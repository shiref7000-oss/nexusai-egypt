import { Router } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { env } from '../config/env';

const router = Router();

// ============================================================
// Webhook Signature Validation
// ============================================================

function validateWhatsAppSignature(body: unknown, signature: string): boolean {
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

function validateMetaSignature(body: unknown, signature: string): boolean {
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

router.get('/whatsapp', async (req, res) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  const { handleWhatsAppWebhookVerify } = await import('../services/whatsapp/webhookHandler');
  const result = await handleWhatsAppWebhookVerify(mode, token, challenge);
  if (result !== null) {
    return res.status(200).send(result);
  }
  res.sendStatus(403);
});

router.post('/whatsapp', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const rawBody =
      (req as { rawBody?: Buffer }).rawBody?.toString('utf8') || JSON.stringify(req.body);

    if (signature && !validateWhatsAppSignature(req.body, signature)) {
      logger.error('WhatsApp webhook signature mismatch (legacy check)');
      return res.sendStatus(200);
    }

    const { handleWhatsAppWebhookPayload } = await import('../services/whatsapp/webhookHandler');
    await handleWhatsAppWebhookPayload(req.body, rawBody, signature);
    res.sendStatus(200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('WhatsApp webhook error', { error: msg });
    res.sendStatus(200);
  }
});

// ============================================================
// Meta / Facebook Webhooks
// ============================================================

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
          channel: 'meta',
          timestamp: new Date().toISOString(),
        });
      }
    }
    res.sendStatus(200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Meta webhook error', { error: msg });
    res.sendStatus(200);
  }
});

// ============================================================
// Shipping Webhooks (Bosta / Aramex / VHub)
// ============================================================

router.post('/shipping/bosta', async (req, res) => {
  try {
    const { trackingNumber, state, cod } = req.body;
    logger.info('Bosta webhook received', { trackingNumber, state, carrier: 'bosta' });

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
    } catch (intErr: unknown) {
      const msg = intErr instanceof Error ? intErr.message : String(intErr);
      logger.warn('Bosta integration event skipped', { error: msg });
    }

    res.sendStatus(200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Bosta webhook error', { error: msg });
    res.sendStatus(200);
  }
});

router.post('/shipping/aramex', async (req, res) => {
  try {
    const { waybillNumber, status, location } = req.body;
    logger.info('Aramex webhook received', { waybillNumber, status, carrier: 'aramex' });

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
    } catch (intErr: unknown) {
      const msg = intErr instanceof Error ? intErr.message : String(intErr);
      logger.warn('Aramex integration event skipped', { error: msg });
    }

    res.sendStatus(200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Aramex webhook error', { error: msg });
    res.sendStatus(200);
  }
});

router.post('/test', (req, res) => {
  logger.info('Test webhook received', {
    body: req.body,
    headers: Object.keys(req.headers),
  });
  res.json({ success: true, received: req.body, timestamp: new Date().toISOString() });
});

export default router;
