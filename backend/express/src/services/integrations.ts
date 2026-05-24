import { Router, Response } from 'express';
import { paramStr } from '../utils/httpParam';
import { body, param, query, validationResult } from 'express-validator';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import {
  authenticateApiKey,
  IntegrationAuthRequest,
  requireApiPermission,
} from '../middleware/integrationAuth';
import { resolvePgUserId } from '../services/usage';
import { logger } from '../config/logger';
import {
  createIntegration,
  listIntegrations,
  getIntegration,
  updateIntegration,
  deleteIntegration,
  createWebhook,
  listWebhooks,
  updateWebhook,
  createApiKey,
  listApiKeys,
  listWebhookLogs,
  getIntegrationStats,
  INTEGRATION_EVENT_TYPES,
} from '../services/integrationsDb';
import {
  publishEvent,
  replayEvent,
  retryWebhookLog,
  isValidEventType,
} from '../services/integrationEvents';
import { verifyInboundSignature } from '../services/webhookDelivery';
import { getWebhookById } from '../services/integrationsDb';
import { pool } from '../config/db_pg';
import {
  listIntegrationOrders,
  getOrderStats,
  getIntegrationOrder,
  getIntegrationOrderDetail,
  updateIntegrationOrderStatus,
  getOrdersDashboard,
  ORDER_WORKFLOW_STATUSES,
  type OrderWorkflowStatus,
} from '../services/ordersDb';
import { listOrderStatusHistory } from '../services/orderStatusHistory';
import { getIntegrationOrderCount } from '../services/integrationsDb';
import {
  listIncomingWebhookLogs,
  getIncomingLogStats,
} from '../services/incomingWebhookLogs';
import { incomingOrderWebhookUrl, formatIntegrationRow } from '../utils/incomingWebhookUrl';
import { regenerateIncomingSecret } from '../services/integrationsDb';
import {
  buildSampleIncomingOrderPayload,
  ingestIncomingOrder,
} from '../services/incomingOrderIngest';

const router = Router();

async function pgUserId(req: AuthenticatedRequest): Promise<number | null> {
  if (req.user?.pgUserId) return req.user.pgUserId;
  if (req.user?.email) return resolvePgUserId(req.user.email);
  return null;
}

// ============================================================
// Public API — external systems emit events (API key)
// ============================================================
router.post(
  '/v1/events',
  authenticateApiKey,
  requireApiPermission('events:emit'),
  [
    body('type').isString().isLength({ min: 3, max: 64 }),
    body('data').isObject(),
    body('idempotency_key').optional().isString().isLength({ max: 128 }),
  ],
  async (req: IntegrationAuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }
      const { type, data, idempotency_key: idempotencyKey } = req.body;
      if (!isValidEventType(type)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported event type. Allowed: ${INTEGRATION_EVENT_TYPES.join(', ')}`,
        });
      }
      const auth = req.integrationAuth!;
      const result = await publishEvent({
        userId: auth.userId,
        integrationId: auth.integrationId,
        eventType: type,
        payload: data,
        source: 'api',
        idempotencyKey: idempotencyKey,
      });
      res.status(202).json({
        success: true,
        data: {
          eventId: result.event.id,
          deliveriesQueued: result.deliveryCount,
        },
      });
    } catch (err: any) {
      logger.error('API event emit failed', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to emit event' });
    }
  }
);

// ============================================================
// Inbound webhook receiver (signature verified)
// ============================================================
router.post('/hooks/:webhookId', async (req, res) => {
  try {
    const webhook = await getWebhookById(paramStr(req.params.webhookId));
    if (!webhook || !webhook.enabled || !webhook.integration_enabled) {
      return res.status(404).json({ success: false, error: 'Webhook not found or disabled' });
    }

    const rawBody = (req as any).rawBody
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body);
    const sig =
      (req.headers['x-nexus-signature'] as string) ||
      (req.headers['x-hub-signature-256'] as string);

    if (!verifyInboundSignature(rawBody, sig, webhook.secret)) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const eventType = (req.body.type || req.body.event_type) as string;
    const data = req.body.data || req.body.payload || req.body;
    if (!eventType || !isValidEventType(eventType)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing event type' });
    }

    const result = await publishEvent({
      userId: webhook.user_id,
      integrationId: webhook.integration_id,
      eventType,
      payload: typeof data === 'object' ? data : { value: data },
      source: 'inbound_webhook',
      idempotencyKey: req.body.idempotency_key,
    });

    res.status(202).json({
      success: true,
      data: { eventId: result.event.id, deliveriesQueued: result.deliveryCount },
    });
  } catch (err: any) {
    logger.error('Inbound webhook error', { error: err.message });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

// ============================================================
// Authenticated management API
// ============================================================
router.use(authenticate);

router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const [stats, orders, incomingLogs, dashboard] = await Promise.all([
    getIntegrationStats(uid),
    getOrderStats(uid).catch(() => ({
      total: 0,
      new: 0,
      pending_confirmation: 0,
      confirmed: 0,
      cancelled: 0,
      shipped: 0,
    })),
    getIncomingLogStats(uid, 24).catch(() => ({ success: 0, failed: 0, total: 0 })),
    getOrdersDashboard(uid).catch(() => null),
  ]);
  res.json({
    success: true,
    data: { ...stats, orders, incoming_webhooks_24h: incomingLogs, dashboard },
  });
});

router.get('/dashboard', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const data = await getOrdersDashboard(uid);
  res.json({ success: true, data });
});

router.get('/orders', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn([...ORDER_WORKFLOW_STATUSES]),
  query('integration_id').optional().isInt(),
  query('search').optional().trim(),
], async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const result = await listIntegrationOrders(uid, {
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 50,
    status: req.query.status as string,
    integrationId: req.query.integration_id
      ? parseInt(req.query.integration_id as string)
      : undefined,
    search: req.query.search as string,
  });
  res.json({ success: true, data: result.orders, meta: result.meta });
});

router.get('/orders/stats', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const integrationId = req.query.integration_id
    ? parseInt(req.query.integration_id as string)
    : undefined;
  const stats = await getOrderStats(uid, integrationId);
  res.json({ success: true, data: stats });
});

router.get('/orders/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });

  const order = await getIntegrationOrderDetail(uid, paramStr(req.params.id));
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  const [statusHistory, incomingLogs] = await Promise.all([
    listOrderStatusHistory(uid, paramStr(req.params.id)),
    listIncomingWebhookLogs(uid, { orderId: paramStr(req.params.id), limit: 20 }),
  ]);

  res.json({
    success: true,
    data: {
      order,
      status_history: statusHistory,
      incoming_logs: incomingLogs,
      webhook_source: 'incoming_webhook',
    },
  });
});

router.patch('/orders/:id/status', [
  param('id').isUUID(),
  body('status').isIn([...ORDER_WORKFLOW_STATUSES]),
  body('notes').optional().trim(),
], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const uid = await pgUserId(req);
    if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });

    const existing = await getIntegrationOrder(uid, paramStr(req.params.id));
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const previousStatus = existing.status as string;
    const newStatus = req.body.status as OrderWorkflowStatus;
    const order = await updateIntegrationOrderStatus(
      uid,
      paramStr(req.params.id),
      existing.integration_id as number,
      newStatus,
      {
        notes: req.body.notes,
        changedBy: req.user?.email || String(uid),
        source: 'dashboard',
      }
    );
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.json({
      success: true,
      data: { order, previous_status: previousStatus },
    });
  } catch (err: any) {
    logger.error('Admin order status update failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

router.get('/event-types', (_req, res) => {
  res.json({ success: true, data: INTEGRATION_EVENT_TYPES });
});

router.get('/admin/overview', requireRole('admin', 'superadmin'), async (_req, res) => {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM integrations) AS integrations,
      (SELECT COUNT(*)::int FROM webhooks WHERE enabled = true) AS active_webhooks,
      (SELECT COUNT(*)::int FROM webhook_events WHERE created_at >= NOW() - INTERVAL '24 hours') AS events_24h,
      (SELECT COUNT(*)::int FROM webhook_logs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') AS failed_24h,
      (SELECT COUNT(*)::int FROM webhook_logs WHERE status = 'dead_letter') AS dead_letter
  `);
  res.json({ success: true, data: r.rows[0] });
});

router.get('/incoming-logs', [
  query('integration_id').optional().isInt(),
  query('status').optional().isIn(['success', 'failed']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
], async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const logs = await listIncomingWebhookLogs(uid, {
    integrationId: req.query.integration_id
      ? parseInt(req.query.integration_id as string, 10)
      : undefined,
    status: req.query.status as 'success' | 'failed' | undefined,
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
  });
  res.json({ success: true, data: logs });
});

router.get('/incoming-logs/stats', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const hours = parseInt(req.query.hours as string) || 24;
  const stats = await getIncomingLogStats(uid, hours);
  res.json({ success: true, data: stats });
});

router.get('/logs', [
  query('webhookId').optional().isUUID(),
  query('status').optional().isIn(['pending', 'delivered', 'failed', 'dead_letter']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const logs = await listWebhookLogs(uid, {
    webhookId: req.query.webhookId as string,
    status: req.query.status as string,
    limit: parseInt(req.query.limit as string) || 50,
  });
  res.json({ success: true, data: logs });
});

router.post('/logs/:logId/retry', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  try {
    const result = await retryWebhookLog(paramStr(req.params.logId), uid);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post('/events/:eventId/replay', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  try {
    const result = await replayEvent(paramStr(req.params.eventId), uid);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post(
  '/events/emit',
  requireRole('admin', 'superadmin'),
  [
    body('type').isString(),
    body('data').isObject(),
    body('userId').optional().isInt(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    let uid = req.body.userId || (await pgUserId(req));
    if (!uid) return res.status(400).json({ success: false, error: 'userId required' });
    const result = await publishEvent({
      userId: uid,
      eventType: req.body.type,
      payload: req.body.data,
      source: 'admin_test',
    });
    res.status(202).json({ success: true, data: result });
  }
);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const rows = await listIntegrations(uid);
  res.json({
    success: true,
    data: rows.map((row) => formatIntegrationRow(row)),
  });
});

router.post(
  '/',
  [body('name').trim().isLength({ min: 2, max: 255 }), body('description').optional().trim()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    const uid = await pgUserId(req);
    if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
    const row = await createIntegration(uid, req.body);
    res.status(201).json({
      success: true,
      data: {
        ...formatIntegrationRow(row),
        incoming_secret: row.incoming_secret,
      },
      message: 'Store the incoming webhook secret now; it will not be shown again.',
    });
  }
);

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const row = await getIntegration(uid, parseInt(paramStr(req.params.id), 10));
  if (!row) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: formatIntegrationRow(row) });
});

router.post('/:id/test-incoming-order', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = await pgUserId(req);
    if (!uid) {
      return res.status(400).json({ success: false, error: 'User not linked to database' });
    }
    const integrationId = parseInt(paramStr(req.params.id), 10);
    const integration = await getIntegration(uid, integrationId);
    if (!integration) {
      return res.status(404).json({ success: false, error: 'Integration not found' });
    }
    if (!integration.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Integration is inactive. Activate it before sending a test order.',
        code: 'INTEGRATION_INACTIVE',
      });
    }

    const samplePayload = buildSampleIncomingOrderPayload();
    const webhookUrl = incomingOrderWebhookUrl(integrationId);
    const result = await ingestIncomingOrder({
      userId: uid,
      integrationId,
      body: samplePayload,
      clientIp: req.ip || null,
    });

    if (!result.ok) {
      return res.status(result.httpStatus).json({
        success: false,
        error: result.error,
        code: result.code,
        data: {
          http_status: result.httpStatus,
          webhook_url: webhookUrl,
          payload_sent: samplePayload,
          details: result.details,
        },
      });
    }

    res.status(result.httpStatus).json({
      success: true,
      data: {
        http_status: result.httpStatus,
        webhook_url: webhookUrl,
        payload_sent: samplePayload,
        order: result.order,
        created: result.created,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Test order failed';
    logger.error('Test incoming order failed', { error: message });
    res.status(500).json({ success: false, error: message });
  }
});

router.post('/:id/regenerate-incoming-secret', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const row = await regenerateIncomingSecret(uid, parseInt(paramStr(req.params.id), 10));
  if (!row) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({
    success: true,
    data: {
      ...formatIntegrationRow(row),
      incoming_secret: row.incoming_secret,
      incoming_webhook_url: incomingOrderWebhookUrl(row.id),
    },
    message: 'Store the new secret now; it will not be shown again.',
  });
});

router.patch(
  '/:id',
  [
    body('name').optional().trim().isLength({ min: 2, max: 255 }),
    body('description').optional().trim(),
    body('enabled').optional().isBoolean(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const uid = await pgUserId(req);
    if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
    const row = await updateIntegration(uid, parseInt(paramStr(req.params.id), 10), req.body);
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: formatIntegrationRow(row) });
  }
);

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const integrationId = parseInt(paramStr(req.params.id), 10);
  const confirm = req.query.confirm === 'true' || req.query.confirm === '1';
  const orderCount = await getIntegrationOrderCount(uid, integrationId);

  if (orderCount > 0 && !confirm) {
    return res.status(409).json({
      success: false,
      error: 'Integration has existing orders',
      code: 'ORDERS_EXIST',
      data: { order_count: orderCount },
      message: `This integration has ${orderCount} order(s). Pass ?confirm=true to delete anyway.`,
    });
  }

  const ok = await deleteIntegration(uid, integrationId);
  if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({
    success: true,
    message: 'Integration deleted',
    data: { deleted_orders: orderCount },
  });
});

router.get('/:id/webhooks', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const rows = await listWebhooks(uid, parseInt(paramStr(req.params.id), 10));
  res.json({ success: true, data: rows });
});

router.post(
  '/:id/webhooks',
  [
    body('name').trim().isLength({ min: 2 }),
    body('url').isURL({ require_protocol: true }),
    body('eventTypes').isArray({ min: 1 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    const uid = await pgUserId(req);
    if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
    const integrationId = parseInt(paramStr(req.params.id), 10);
    const integration = await getIntegration(uid, integrationId);
    if (!integration) return res.status(404).json({ success: false, error: 'Integration not found' });

    const invalid = (req.body.eventTypes as string[]).filter((t) => !isValidEventType(t));
    if (invalid.length) {
      return res.status(400).json({ success: false, error: `Invalid event types: ${invalid.join(', ')}` });
    }

    const webhook = await createWebhook(uid, integrationId, {
      name: req.body.name,
      url: req.body.url,
      eventTypes: req.body.eventTypes,
    });
    const base = process.env.API_BASE_URL || 'https://nexus-ai.group/api';
    const inboundUrl = `${base.replace(/\/$/, '')}/integrations/hooks/${webhook.id}`;
    res.status(201).json({
      success: true,
      data: { ...webhook, secret: webhook.secret, inboundUrl },
      message: 'Store the signing secret now; it will not be shown again.',
    });
  }
);

router.patch('/webhooks/:webhookId', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const row = await updateWebhook(uid, paramStr(req.params.webhookId), req.body);
  if (!row) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: row });
});

router.get('/:id/api-keys', async (req: AuthenticatedRequest, res: Response) => {
  const uid = await pgUserId(req);
  if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
  const rows = await listApiKeys(uid, parseInt(paramStr(req.params.id), 10));
  res.json({ success: true, data: rows });
});

router.post(
  '/:id/api-keys',
  [body('name').trim().isLength({ min: 2 })],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
    const uid = await pgUserId(req);
    if (!uid) return res.status(400).json({ success: false, error: 'User not linked to database' });
    const key = await createApiKey(uid, parseInt(paramStr(req.params.id), 10), req.body.name, req.body.permissions);
    res.status(201).json({
      success: true,
      data: key,
      message: 'Copy the API key now; it will not be shown again.',
    });
  }
);

export default router;
