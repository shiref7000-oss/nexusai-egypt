import { Router } from 'express';
import crypto from 'crypto';
import { supabase } from '../config/supabase';
import { logger } from '../config/logger';
import { env } from '../config/env';

const router = Router();

// ============================================================
// Webhook Signature Validation
// ============================================================

function validateWhatsAppSignature(body: any, signature: string): boolean {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) {
    logger.warn('WhatsApp webhook signature validation skipped: No META_APP_SECRET');
    return true; // Allow in dev
  }

  try {
    const expected = crypto
      .createHmac('sha256', appSecret)
      .update(JSON.stringify(body), 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.replace('sha256=', '')));
  } catch {
    return false;
  }
}

function validateMetaSignature(body: any, signature: string): boolean {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) return true;

  try {
    const expected = crypto
      .createHmac('sha1', appSecret)
      .update(JSON.stringify(body), 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ============================================================
// WhatsApp Webhooks
// ============================================================

// WhatsApp webhook verification
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe') {
    logger.info('WhatsApp webhook verified', { token });
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// WhatsApp incoming messages
router.post('/whatsapp', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (signature && !validateWhatsAppSignature(req.body, signature)) {
      logger.error('WhatsApp webhook signature mismatch');
      return res.sendStatus(200); // Return 200 to prevent retries
    }

    const { entry } = req.body;
    if (!entry) return res.sendStatus(200);

    for (const e of entry) {
      for (const change of e.changes || []) {
        const message = change.value?.messages?.[0];
        if (message) {
          logger.info('WhatsApp message received', {
            from: message.from,
            type: message.type,
            messageId: message.id,
          });

          // Store message
          try {
            await supabase.from('whatsapp_messages').insert([{
              phone: message.from,
              message: message.text?.body || '',
              direction: 'incoming',
              status: 'received',
              message_id: message.id,
              timestamp: new Date(message.timestamp * 1000).toISOString(),
            }]);
          } catch (dbErr: any) {
            logger.error('Failed to store WhatsApp message', { error: dbErr.message });
          }

          // Auto-reply with Moderator AI
          if (message.text?.body) {
            logger.info('Triggering AI moderator response', {
              phone: message.from,
              message: message.text.body.slice(0, 100),
            });

            // Queue AI response
            try {
              const { addAIJob } = await import('../services/queue');
              await addAIJob({
                agent: 'moderator',
                prompt: `Respond to this customer message in Egyptian Arabic: "${message.text.body}"`,
                context: { source: 'whatsapp', phone: message.from, messageId: message.id },
              });
            } catch (queueErr: any) {
              logger.error('Failed to queue AI response', { error: queueErr.message });
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err: any) {
    logger.error('WhatsApp webhook error', { error: err.message, stack: err.stack });
    res.sendStatus(200); // Always return 200 to WhatsApp to prevent retries
  }
});

// ============================================================
// Meta / Facebook Webhooks
// ============================================================

// Meta webhook verification
router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe') {
    logger.info('Meta webhook verified', { token });
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Meta webhook events
router.post('/meta', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature'] as string;
    if (signature && !validateMetaSignature(req.body, signature)) {
      logger.error('Meta webhook signature mismatch');
      return res.sendStatus(200);
    }

    const { object, entry } = req.body;
    if (object !== 'ads') return res.sendStatus(200);

    for (const e of entry || []) {
      for (const change of e.changes || []) {
        logger.info('Meta webhook event', {
          field: change.field,
          value: change.value,
          timestamp: new Date().toISOString(),
        });

        // Store event
        try {
          await supabase.from('meta_events').insert([{
            event_type: change.field,
            event_data: change.value,
            raw_payload: req.body,
            timestamp: new Date().toISOString(),
          }]);
        } catch (dbErr: any) {
          logger.error('Failed to store Meta event', { error: dbErr.message });
        }
      }
    }
    res.sendStatus(200);
  } catch (err: any) {
    logger.error('Meta webhook error', { error: err.message });
    res.sendStatus(200);
  }
});

// ============================================================
// Shipping Webhooks (Bosta / Aramex / VHub)
// ============================================================

// Bosta webhook
router.post('/shipping/bosta', async (req, res) => {
  try {
    const { trackingNumber, state, cod } = req.body;
    logger.info('Bosta webhook received', { trackingNumber, state });

    try {
      await supabase.from('shipping_events').insert([{
        carrier: 'bosta',
        tracking_number: trackingNumber,
        event_code: state?.code,
        event_description: state?.value,
        carrier_status: state?.value,
        cod_collected: cod,
        raw_payload: req.body,
        event_timestamp: new Date().toISOString(),
      }]);
    } catch (dbErr: any) {
      logger.error('Failed to store Bosta event', { error: dbErr.message });
    }

    try {
      const { getSystemIntegrationUserId } = await import('../services/integrationSystemUser');
      const { publishEvent } = await import('../services/integrationEvents');
      const userId = await getSystemIntegrationUserId();
      if (userId) {
        const delivered = /deliver/i.test(state?.value || state?.code || '');
        await publishEvent({
          userId,
          eventType: delivered ? 'shipment.delivered' : 'shipment.created',
          payload: { carrier: 'bosta', trackingNumber, state, cod },
          source: 'bosta_webhook',
          idempotencyKey: `bosta-${trackingNumber}-${state?.code}`,
        });
      }
    } catch (intErr: any) {
      logger.warn('Bosta integration event skipped', { error: intErr.message });
    }

    res.sendStatus(200);
  } catch (err: any) {
    logger.error('Bosta webhook error', { error: err.message });
    res.sendStatus(200);
  }
});

// Aramex webhook
router.post('/shipping/aramex', async (req, res) => {
  try {
    const { waybillNumber, status, location } = req.body;
    logger.info('Aramex webhook received', { waybillNumber, status });

    try {
      await supabase.from('shipping_events').insert([{
        carrier: 'aramex',
        tracking_number: waybillNumber,
        event_code: status?.code,
        event_description: status?.description,
        location: location?.address,
        city: location?.city,
        carrier_status: status?.description,
        raw_payload: req.body,
        event_timestamp: new Date().toISOString(),
      }]);
    } catch (dbErr: any) {
      logger.error('Failed to store Aramex event', { error: dbErr.message });
    }

    try {
      const { getSystemIntegrationUserId } = await import('../services/integrationSystemUser');
      const { publishEvent } = await import('../services/integrationEvents');
      const userId = await getSystemIntegrationUserId();
      if (userId) {
        const delivered = /deliver/i.test(status?.description || status?.code || '');
        await publishEvent({
          userId,
          eventType: delivered ? 'shipment.delivered' : 'shipment.created',
          payload: { carrier: 'aramex', waybillNumber, status, location },
          source: 'aramex_webhook',
          idempotencyKey: `aramex-${waybillNumber}-${status?.code}`,
        });
      }
    } catch (intErr: any) {
      logger.warn('Aramex integration event skipped', { error: intErr.message });
    }

    res.sendStatus(200);
  } catch (err: any) {
    logger.error('Aramex webhook error', { error: err.message });
    res.sendStatus(200);
  }
});

// ============================================================
// Generic / Test Webhook
// ============================================================

router.post('/test', (req, res) => {
  logger.info('Test webhook received', {
    body: req.body,
    headers: Object.keys(req.headers),
  });
  res.json({ success: true, received: req.body, timestamp: new Date().toISOString() });
});

export default router;
