import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { checkN8nHealth } from '../services/n8n';
import {
  executeWorkflowRuntime,
  getWorkflowRuntimeOverview,
  getExecutionHistory,
  runAllWorkflowExecutions,
} from '../services/workflowRuntime';
import { getQueueStatus } from '../services/queue';
import { getRuntimeHealthReport } from '../services/runtimeHealth';
import { logger } from '../config/logger';

const router = Router();
router.use(authenticate);

function pgUserId(req: AuthenticatedRequest): number {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return 1;
}

router.get('/health', async (_req, res) => {
  const n8n = await checkN8nHealth();
  res.json({ success: true, data: n8n });
});

router.get('/monitoring', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = pgUserId(req);
    const [overview, history, queue, runtime] = await Promise.all([
      getWorkflowRuntimeOverview(userId),
      getExecutionHistory(userId, 40),
      getQueueStatus().catch(() => null),
      getRuntimeHealthReport().catch(() => null),
    ]);
    res.json({
      success: true,
      data: {
        n8n: overview.n8n,
        workflows: overview.workflows,
        executions: history,
        queue,
        runtime,
        apiNote: overview.apiError,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    logger.error('Workflow monitoring error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load monitoring data',
    });
  }
});

router.get('/status', async (req: AuthenticatedRequest, res) => {
  try {
    const overview = await getWorkflowRuntimeOverview(pgUserId(req));
    res.json({
      success: true,
      data: {
        n8n: overview.n8n,
        workflows: overview.workflows,
        apiNote: overview.apiError,
      },
    });
  } catch (err: unknown) {
    logger.error('Workflow status error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load workflow status',
    });
  }
});

router.get('/executions', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const workflowKey = req.query.workflowKey ? String(req.query.workflowKey) : undefined;
    const history = await getExecutionHistory(pgUserId(req), limit, workflowKey);
    res.json({ success: true, data: history });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load executions',
    });
  }
});

router.post(
  '/test/run-all',
  async (req: AuthenticatedRequest, res) => {
    try {
      const results = await runAllWorkflowExecutions(pgUserId(req), 'e2e-test');
      const overview = await getWorkflowRuntimeOverview(pgUserId(req));
      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            succeeded: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
          },
          workflows: overview.workflows,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'E2E test failed',
      });
    }
  },
);

router.post(
  '/:workflowKey/execute',
  param('workflowKey').isString().isLength({ min: 1, max: 80 }),
  body('input').optional().isObject(),
  body('trigger').optional().isString(),
  async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0]?.msg || 'Validation failed' });
    }
    try {
      const result = await executeWorkflowRuntime({
        userId: pgUserId(req),
        workflowKey: String(req.params.workflowKey),
        input: req.body.input,
        trigger: req.body.trigger || 'api',
      });
      if (!result.success) {
        return res.status(502).json({ ...result, success: false });
      }
      res.json({ success: true, data: result });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Execution failed',
      });
    }
  },
);

export default router;
