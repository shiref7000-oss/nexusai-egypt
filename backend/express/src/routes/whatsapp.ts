import { Router, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../config/logger';
import {
  connectionPublicView,
  disconnectWhatsApp,
  getConnectionByUserId,
  getOrderWhatsAppMessages,
  getRecentActivity,
  getSettingsForUser,
  getWhatsAppAnalytics,
  getWhatsAppStats,
  listFailedOutboundMessages,
  listTemplates,
  markTemplateSyncTime,
  updateSettingsForUser,
  updateTemplateMapping,
  upsertConnection,
} from '../services/whatsapp/db';
import { syncTemplatesFromMeta } from '../services/whatsapp/graphClient';
import { runSyncWithTimeout } from '../services/whatsapp/metaSync';
import { addWhatsAppOutboundJob } from '../services/whatsapp/queue';
import { WHATSAPP_TEMPLATE_CATALOG } from '../services/whatsapp/templateCatalog';
import { enqueueCodConfirmation } from '../services/whatsapp/codFlow';
import { getWhatsAppQueueHealth } from '../services/whatsapp/dashboard';
import { parseSettings } from '../services/whatsapp/settings';
import { getWorkerRuntimeStatus } from '../services/whatsapp/workerHealth';
import { extractGraphError, verifyWhatsAppCredentials } from '../services/whatsapp/graphClient';
import { withTimeout } from '../utils/queryTimeout';
import { paramStr } from '../utils/httpParam';
import { whatsappWebhookPublicUrl } from '../utils/publicApiUrl';

const router = Router();

function requirePgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

function mapTemplates(templates: Array<Record<string, unknown>>) {
  return templates.map((t) => ({
    key: t.template_key,
    metaName: t.meta_template_name,
    status: t.status,
    metaStatus: t.meta_status,
    rejectionReason: t.rejection_reason,
    lastSyncedAt: t.last_synced_at,
    flow: WHATSAPP_TEMPLATE_CATALOG.find((c) => c.key === t.template_key)?.flow,
    catalog: WHATSAPP_TEMPLATE_CATALOG.find((c) => c.key === t.template_key),
  }));
}

async function buildStatusPayload(userId: number) {
  const conn = await getConnectionByUserId(userId);
  const templates = await listTemplates(userId);
  const [stats, analytics, activity, queue, worker] = await Promise.all([
    getWhatsAppStats(userId),
    getWhatsAppAnalytics(userId),
    getRecentActivity(userId, 20),
    getWhatsAppQueueHealth(),
    getWorkerRuntimeStatus(),
  ]);
  const settings = await getSettingsForUser(userId);
  const approved = templates.filter((t) => t.status === 'approved').length;
  const pending = templates.filter((t) => t.status === 'pending').length;
  const rejected = templates.filter((t) => t.status === 'rejected').length;

  return {
    connection: connectionPublicView(conn),
    webhookUrl: whatsappWebhookPublicUrl(),
    templates: mapTemplates(templates),
    templateSync: {
      lastSyncedAt: conn?.last_template_sync_at || null,
      approved,
      pending,
      rejected,
      total: templates.length,
    },
    stats,
    analytics,
    activity,
    queue,
    worker,
    settings,
    flows: {
      cod: {
        enabled: settings.codEnabled,
        ready: templates.some((t) => t.template_key === settings.codTemplateKey && t.status === 'approved'),
      },
      shipping: {
        enabled: false,
        ready: templates.some((t) => t.template_key === 'shipping_update' && t.status === 'approved'),
        note: 'Coming soon — shipment webhooks will trigger shipping_update template',
      },
      retention: {
        enabled: false,
        ready: templates.some((t) => t.template_key === 'failed_delivery' && t.status === 'approved'),
        note: 'Coming soon',
      },
      aiAgent: {
        enabled: false,
        ready: false,
        note: 'AI drafts only — outbound always via approved templates + queue',
      },
      abandonedCart: { enabled: false, ready: false, note: 'Coming soon' },
      aiSales: { enabled: false, ready: false, note: 'Coming soon' },
    },
  };
}

router.use(authenticate);

router.get('/status', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  res.json({ success: true, data: await buildStatusPayload(userId) });
});

/** Full refresh from Meta: phone numbers, templates, then latest dashboard payload. */
router.post('/sync', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const conn = await getConnectionByUserId(userId);
  if (!conn || conn.status !== 'connected') {
    return res.status(400).json({ success: false, error: 'WhatsApp not connected', code: 'NOT_CONNECTED' });
  }
  try {
    const sync = await runSyncWithTimeout(userId);
    const data = await buildStatusPayload(userId);
    return res.json({ success: true, data: { ...data, sync } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync from Meta failed';
    logger.warn('WhatsApp /sync failed', { userId, error: message });
    return res.status(400).json({ success: false, error: message, code: 'META_SYNC_FAILED' });
  }
});

const TEST_CONNECTION_MAX_MS = 15000;

async function handleTestConnection(req: AuthenticatedRequest, res: Response) {
  const started = Date.now();
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: 'Invalid input', code: 'VALIDATION' });
  }

  try {
    const outcome = await withTimeout(
      (async () => {
        const worker = await withTimeout(
          getWorkerRuntimeStatus(),
          3000,
          'workerHealthForTestConnection'
        );
        const verified = await verifyWhatsAppCredentials({
          accessToken: String(req.body.accessToken),
          phoneNumberId: String(req.body.phoneNumberId),
          wabaId: req.body.wabaId ? String(req.body.wabaId) : undefined,
        });
        return { verified, worker };
      })(),
      TEST_CONNECTION_MAX_MS,
      'whatsappTestConnection'
    );

    const ms = Date.now() - started;
    logger.info('WhatsApp test-connection ok', { ms, phoneNumberId: String(req.body.phoneNumberId) });
    return res.json({
      success: true,
      data: {
        ok: true,
        ...outcome.verified,
        _timingMs: ms,
        worker: outcome.worker,
        message: 'Meta Graph API credentials verified successfully.',
      },
    });
  } catch (err: unknown) {
    const ms = Date.now() - started;
    const message = extractGraphError(err);
    const code =
      message.includes('timed out after') ? 'REQUEST_TIMEOUT' : 'GRAPH_VERIFY_FAILED';
    logger.warn('WhatsApp test-connection failed', {
      ms,
      code,
      phoneNumberId: String(req.body.phoneNumberId),
      error: message,
    });
    const status = code === 'REQUEST_TIMEOUT' ? 504 : 400;
    let worker;
    try {
      worker = await withTimeout(getWorkerRuntimeStatus(), 2000, 'workerHealthOnTestError');
    } catch {
      worker = {
        redisReady: false,
        workerReachable: false,
        workerRole: 'nexusai-worker',
        note: 'Worker health check timed out',
      };
    }
    return res.status(status).json({
      success: false,
      error: message,
      code,
      data: { _timingMs: ms, worker },
    });
  }
}

router.post(
  '/test-connection',
  body('phoneNumberId').isString().notEmpty(),
  body('accessToken').isString().notEmpty(),
  body('wabaId').optional().isString(),
  handleTestConnection
);

/** Alias for clients expecting /test */
router.post(
  '/test',
  body('phoneNumberId').isString().notEmpty(),
  body('accessToken').isString().notEmpty(),
  body('wabaId').optional().isString(),
  handleTestConnection
);

router.post(
  '/connect',
  body('metaAppId').isString().notEmpty(),
  body('wabaId').isString().notEmpty(),
  body('phoneNumberId').isString().notEmpty(),
  body('accessToken').isString().notEmpty(),
  body('webhookVerifyToken').isString().notEmpty(),
  async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: errors.array() });
    }
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });

    try {
      const { metaAppId, wabaId, phoneNumberId, accessToken, webhookVerifyToken, displayPhone, businessName } =
        req.body;

      const verified = await verifyWhatsAppCredentials({ accessToken, phoneNumberId, wabaId });
      const conn = await upsertConnection({
        userId,
        metaAppId,
        wabaId,
        phoneNumberId,
        accessToken,
        webhookVerifyToken,
        displayPhone: displayPhone || verified.displayPhone,
        businessName: businessName || verified.verifiedName,
      });

      res.json({
        success: true,
        data: {
          connection: connectionPublicView(conn),
          webhookUrl: whatsappWebhookPublicUrl(),
          templateSyncQueued: true,
        },
      });

      void (async () => {
        try {
          await withTimeout(
            syncTemplatesFromMeta(userId, accessToken, wabaId),
            20000,
            'syncTemplatesAfterConnect'
          );
          await markTemplateSyncTime(userId);
        } catch (syncErr: unknown) {
          logger.warn('Template sync after connect failed', {
            error: syncErr instanceof Error ? syncErr.message : syncErr,
          });
        }
      })();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      logger.error('WhatsApp connect failed', { userId, error: msg });
      res.status(400).json({ success: false, error: msg });
    }
  }
);

router.post('/disconnect', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  await disconnectWhatsApp(userId);
  res.json({ success: true, data: { connection: connectionPublicView(null) } });
});

router.patch('/settings', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const patch = parseSettings(req.body);
  const settings = await updateSettingsForUser(userId, patch);
  res.json({ success: true, data: { settings } });
});

router.post('/templates/sync', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const conn = await getConnectionByUserId(userId);
  if (!conn || conn.status !== 'connected') {
    return res.status(400).json({ success: false, error: 'WhatsApp not connected', code: 'NOT_CONNECTED' });
  }
  try {
    const sync = await runSyncWithTimeout(userId);
    const data = await buildStatusPayload(userId);
    return res.json({
      success: true,
      data: { templates: data.templates, templateSync: data.templateSync, connection: data.connection, sync },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Template sync failed';
    logger.warn('WhatsApp templates/sync failed', { userId, error: message });
    return res.status(400).json({ success: false, error: message, code: 'META_SYNC_FAILED' });
  }
});

router.patch('/templates/:templateKey', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const key = paramStr(req.params.templateKey);
  const metaName = String(req.body.metaTemplateName || '').trim();
  if (!metaName) return res.status(400).json({ success: false, error: 'metaTemplateName required' });
  await updateTemplateMapping(userId, key, metaName);
  const templates = await listTemplates(userId);
  res.json({ success: true, data: { templates: mapTemplates(templates) } });
});

router.post(
  '/test-message',
  body('phone').isString().notEmpty(),
  async (req: AuthenticatedRequest, res) => {
    const started = Date.now();
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'Account not linked', code: 'NO_USER' });
    const conn = await getConnectionByUserId(userId);
    if (!conn || conn.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'Connect WhatsApp first', code: 'NOT_CONNECTED' });
    }

    const worker = await getWorkerRuntimeStatus();
    if (!worker.redisReady) {
      return res.status(503).json({
        success: false,
        error: 'Message queue unavailable (Redis). Try again shortly.',
        code: 'REDIS_UNAVAILABLE',
        data: { worker, _timingMs: Date.now() - started },
      });
    }
    if (!worker.workerReachable) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp worker is offline. Start nexusai-worker on the server.',
        code: 'WORKER_OFFLINE',
        data: { worker, _timingMs: Date.now() - started },
      });
    }

    const phone = String(req.body.phone);
    const settings = await getSettingsForUser(userId);
    const templates = await listTemplates(userId);
    const codTpl = templates.find(
      (t) => t.template_key === settings.codTemplateKey && t.status === 'approved'
    );

    try {
      const jobPayload = codTpl
        ? {
            userId,
            templateKey: settings.codTemplateKey,
            recipientPhone: phone,
            templateName: codTpl.meta_template_name as string,
            bodyParameters: ['Test Customer', 'TEST-001', '99 EGP'],
          }
        : {
            userId,
            recipientPhone: phone,
            textBody: 'NexusAI test message — your WhatsApp integration is connected.',
          };

      const job = await withTimeout(
        addWhatsAppOutboundJob(jobPayload),
        8000,
        'enqueueWhatsAppTestMessage'
      );

      return res.json({
        success: true,
        data: {
          queued: true,
          jobId: job.id,
          worker,
          message: 'Test message queued for delivery via WhatsApp worker.',
          _timingMs: Date.now() - started,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to queue test message';
      logger.error('WhatsApp test-message enqueue failed', { userId, error: message });
      return res.status(500).json({
        success: false,
        error: message,
        code: 'ENQUEUE_FAILED',
        data: { worker, _timingMs: Date.now() - started },
      });
    }
  }
);

router.post('/messages/resend-failed', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const failed = await listFailedOutboundMessages(userId, 30);
  const settings = await getSettingsForUser(userId);
  const templates = await listTemplates(userId);
  let queued = 0;

  for (const row of failed) {
    const tpl = templates.find((t) => t.template_key === row.template_key && t.status === 'approved');
    if (!tpl || !row.recipient_phone) continue;
    await addWhatsAppOutboundJob({
      userId,
      orderId: row.order_id || undefined,
      templateKey: row.template_key,
      recipientPhone: row.recipient_phone,
      templateName: tpl.meta_template_name as string,
      bodyParameters: ['Customer', row.order_id || 'ORDER', '—'],
    });
    queued += 1;
  }

  res.json({ success: true, data: { queued, totalFailed: failed.length } });
});

router.get('/orders/:orderId/messages', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const orderId = paramStr(req.params.orderId);
  const messages = await getOrderWhatsAppMessages(userId, orderId);
  res.json({
    success: true,
    data: {
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        messageType: m.message_type,
        templateKey: m.template_key,
        status: m.status,
        bodyPreview: m.body_preview,
        sentAt: m.sent_at,
        deliveredAt: m.delivered_at,
        readAt: m.read_at,
        failedAt: m.failed_at,
        createdAt: m.created_at,
      })),
    },
  });
});

router.post('/orders/:orderId/resend-confirmation', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const { pool } = await import('../config/db_pg');
  const r = await pool.query(
    'SELECT * FROM integration_orders WHERE id = $1 AND user_id = $2',
    [paramStr(req.params.orderId), userId]
  );
  const order = r.rows[0];
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  const result = await enqueueCodConfirmation({
    userId,
    orderId: order.id,
    customerPhone: order.customer_phone,
    customerName: order.customer_name,
    externalId: order.external_id,
    codAmount: Number(order.cod_amount),
    currency: order.currency,
  });
  res.json({ success: true, data: result });
});

export default router;
