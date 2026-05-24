import { Router } from 'express';
import { logger } from '../config/logger';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getProviderHealth } from '../services/ai';
import {
  listAgentConfigs,
  listAgentActivities,
  updateAgentConfig,
  toggleAgentConfig,
  toApiAgentConfig,
  toApiActivity,
} from '../services/agentsDb';
import { paramStr } from '../utils/httpParam';

const router = Router();
router.use(authenticate);

function requirePgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User not linked to database account' });
    }
    const rows = await listAgentConfigs(userId);
    res.json({ success: true, data: rows.map(toApiAgentConfig) });
  } catch (err: unknown) {
    logger.error('Agents list error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({ success: false, error: 'Failed to load agents' });
  }
});

router.patch('/:agentId', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database account' });
    const cfg = await updateAgentConfig(userId, paramStr(req.params.agentId), {
      is_active: req.body.is_active,
      settings: req.body.settings,
    });
    if (!cfg) return res.status(404).json({ success: false, error: 'Agent not found' });
    res.json({ success: true, data: toApiAgentConfig(cfg) });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to update agent' });
  }
});

router.get('/activity', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database account' });
    const rows = await listAgentActivities(userId, 50);
    res.json({ success: true, data: rows.map(toApiActivity) });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to load activity' });
  }
});

router.post('/:agentId/toggle', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked to database account' });
    const cfg = await toggleAgentConfig(userId, paramStr(req.params.agentId));
    if (!cfg) return res.status(404).json({ success: false, error: 'Agent not found' });
    res.json({
      success: true,
      data: toApiAgentConfig(cfg),
      message: `Agent ${cfg.is_active ? 'activated' : 'paused'}`,
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: 'Failed to toggle agent' });
  }
});

router.get('/workflows/status', async (req: AuthenticatedRequest, res) => {
  try {
    const { getWorkflowRuntimeOverview } = await import('../services/workflowRuntime');
    const userId = requirePgUserId(req) || 1;
    const overview = await getWorkflowRuntimeOverview(userId);
    const legacy = overview.workflows.map((w) => ({
      key: w.key,
      agent: w.agent,
      name: w.name,
      path: w.webhookPath,
      status: w.state,
      lastRun: w.lastRunAt,
      responseTime: w.lastDurationMs,
      error: w.lastError,
      failureReason: w.failureReason,
      n8nWorkflowId: w.n8nWorkflowId,
      n8nExecutionId: w.n8nExecutionId,
      lastExecutionId: w.lastExecutionId,
      lastExecutionStatus: w.lastExecutionStatus,
      executionCount: w.executionCount,
      avgRuntimeMs: w.avgRuntimeMs,
      successCount: w.successCount,
      failedCount: w.failedCount,
      recentLogs: w.recentLogs,
    }));
    res.json({ success: true, data: legacy, n8n: overview.n8n });
  } catch (err: unknown) {
    logger.error('Workflow status error', { error: err instanceof Error ? err.message : err });
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load workflow status',
    });
  }
});

router.get('/providers/status', async (_req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: getProviderHealth(), timestamp: new Date().toISOString() });
});

export default router;
