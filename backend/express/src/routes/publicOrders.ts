import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  authenticateApiKey,
  IntegrationAuthRequest,
  requireApiPermission,
} from '../middleware/integrationAuth';
import { authenticateIncomingWebhook, IncomingWebhookRequest } from '../middleware/incomingWebhookAuth';
import { publicOrdersLimiter } from '../middleware/rateLimit';
import { logger } from '../config/logger';
import {
  createIntegrationOrder,
  getIntegrationOrder,
  updateIntegrationOrderStatus,
  ORDER_WORKFLOW_STATUSES,
  type OrderWorkflowStatus,
} from '../services/ordersDb';
import { normalizeEgyptianPhone } from '../services/phoneNormalize';
import { ingestIncomingOrder } from '../services/incomingOrderIngest';
import { paramStr } from '../utils/httpParam';

const router = Router();

function clientIp(req: IncomingWebhookRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.ip || '';
}

/**
 * POST /api/public/orders/:integrationId
 * Universal incoming order webhook (secret or nxk_ API key).
 */
router.post(
  '/:integrationId',
  publicOrdersLimiter,
  param('integrationId').isInt({ min: 1 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid integration id',
        details: errors.array(),
      });
    }
    next();
  },
  authenticateIncomingWebhook,
  async (req: IncomingWebhookRequest, res: Response) => {
    const integration = req.integration!;
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
      string,
      unknown
    >;
    const result = await ingestIncomingOrder({
      userId: integration.userId,
      integrationId: integration.id,
      body,
      clientIp: clientIp(req),
    });

    if (!result.ok) {
      return res.status(result.httpStatus).json({
        success: false,
        error: result.error,
        code: result.code,
        details: result.details,
      });
    }

    res.status(result.httpStatus).json({
      success: true,
      data: { order: result.order, created: result.created },
    });
  }
);

/** Legacy API-key ingest (no outbound events in V1). */
router.post(
  '/',
  authenticateApiKey,
  publicOrdersLimiter,
  requireApiPermission('orders:write'),
  [
    body('external_id').trim().isLength({ min: 1, max: 128 }),
    body('customer.name').trim().isLength({ min: 2, max: 255 }),
    body('customer.phone').trim().isLength({ min: 8, max: 64 }),
    body('customer.city').optional().trim(),
    body('customer.email').optional({ nullable: true }).isEmail(),
    body('products').isArray({ min: 1 }),
    body('products.*.name').trim().isLength({ min: 1 }),
    body('products.*.quantity').isInt({ min: 1 }),
    body('cod_amount').isFloat({ min: 0 }),
    body('status').optional().isIn([...ORDER_WORKFLOW_STATUSES]),
    body('notes').optional().trim(),
    body('idempotency_key').optional().isString().isLength({ max: 128 }),
  ],
  async (req: IntegrationAuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const auth = req.integrationAuth!;
      const { customer, products, cod_amount: codAmount, currency, status, notes, idempotency_key } =
        req.body;

      const phoneNorm = normalizeEgyptianPhone(customer.phone);
      if (!phoneNorm.ok) {
        return res.status(400).json({ success: false, error: phoneNorm.error, code: 'VALIDATION_FAILED' });
      }

      const { order, created } = await createIntegrationOrder({
        userId: auth.userId,
        integrationId: auth.integrationId,
        externalId: req.body.external_id,
        customerName: customer.name,
        customerPhone: phoneNorm.phone,
        customerCity: customer.city,
        customerEmail: customer.email,
        products,
        codAmount,
        currency,
        status: status as OrderWorkflowStatus | undefined,
        notes,
        idempotencyKey: idempotency_key,
        rawPayload: req.body as Record<string, unknown>,
        changedBy: 'api_key',
        historySource: 'api',
      });

      res.status(created ? 201 : 200).json({ success: true, data: { order, created } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed';
      logger.error('Legacy public order create failed', { error: message });
      res.status(500).json({ success: false, error: 'Failed to create order' });
    }
  }
);

router.post(
  '/order/:id/status',
  authenticateApiKey,
  publicOrdersLimiter,
  requireApiPermission('orders:write'),
  [
    param('id').isUUID(),
    body('status').isIn([...ORDER_WORKFLOW_STATUSES]),
    body('notes').optional().trim(),
  ],
  async (req: IntegrationAuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const auth = req.integrationAuth!;
      const existing = await getIntegrationOrder(auth.userId, paramStr(req.params.id), auth.integrationId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      const order = await updateIntegrationOrderStatus(
        auth.userId,
        paramStr(req.params.id),
        auth.integrationId,
        req.body.status as OrderWorkflowStatus,
        { notes: req.body.notes, changedBy: 'api_key', source: 'api' }
      );

      res.json({
        success: true,
        data: { order, previous_status: existing.status },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed';
      logger.error('Public order status update failed', { error: message });
      res.status(500).json({ success: false, error: 'Failed to update order status' });
    }
  }
);

export default router;
