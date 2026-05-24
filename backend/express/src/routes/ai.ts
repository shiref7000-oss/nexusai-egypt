import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { getProviderAnalyticsSnapshot, getProviderHealth, processAIRequest } from '../services/ai';
import { logger } from '../config/logger';
import { recordAgentActivity } from '../services/agentsDb';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimit';
import { requireUsageQuota } from '../middleware/usageLimit';
import { requirePlatformAIBudget } from '../middleware/platformAIBudget';
import { checkPlatformCostBudget } from '../services/aiProviders/platformCost';
import { requireActiveAccount } from '../middleware/accountStatus';
import { recordUsage, resolvePgUserId } from '../services/usage';

const router = Router();
router.use(authenticate, requireActiveAccount);

router.post('/process', aiLimiter, requirePlatformAIBudget, requireUsageQuota, [
  body('agent').isIn(['ceo', 'ads', 'meta', 'moderator', 'support', 'product', 'finance', 'shipping', 'hr', 'confirmation']),
  body('prompt').trim().isLength({ min: 1, max: 4000 }),
], async (req: AuthenticatedRequest, res) => {
  const pgUserId = (req as any).pgUserId as number | undefined;
  const { agent, prompt, context } = req.body;
  const started = Date.now();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const result = await processAIRequest({
      agent,
      prompt,
      context,
      systemPrompt: typeof context?.systemPrompt === 'string' ? context.systemPrompt : undefined,
      userId: pgUserId,
    });
    const latency = result.latency || Date.now() - started;
    const tokens = result.usage?.totalTokens ?? Math.ceil((prompt.length + (result.response?.length || 0)) / 4);

    if (pgUserId) {
      await recordUsage({
        userId: pgUserId,
        model: result.model || result.provider,
        provider: result.provider,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: tokens,
        latencyMs: latency,
        status: result.success ? 'completed' : 'failed',
        prompt,
        response: result.response || '',
        errorMessage: result.error,
        agent,
        costUsd: result.usage?.costUsd,
      });
    }

    if (result.success && pgUserId) {
      await recordAgentActivity({
        userId: pgUserId,
        agentId: agent,
        agentName: agent,
        action: `AI processed: ${prompt.substring(0, 100)}`,
        status: 'success',
      });
    }

    const usageSnapshot = (req as any).usageSnapshot;
    const platformCost = (req as any).platformCostStatus;
    res.json({
      ...result,
      platformCost: platformCost
        ? {
            month: platformCost.month,
            totalUsd: platformCost.totalUsd,
            warning: platformCost.warning,
          }
        : undefined,
      usage: usageSnapshot ? {
        monthlyUsed: usageSnapshot.monthlyUsed + (result.success ? 1 : 0),
        monthlyLimit: usageSnapshot.monthlyLimit,
        remaining: Math.max(0, usageSnapshot.monthlyLimit - usageSnapshot.monthlyUsed - (result.success ? 1 : 0)),
      } : undefined,
    });
  } catch (err: any) {
    logger.error('AI process error', { error: err.message, userId: pgUserId });
    if (pgUserId) {
      try {
        await recordUsage({
          userId: pgUserId,
          status: 'failed',
          prompt: req.body?.prompt || '',
          errorMessage: err.message,
          agent: req.body?.agent,
          latencyMs: Date.now() - started,
        });
      } catch { /* non-blocking */ }
    }
    res.status(500).json({
      success: false,
      response: '',
      agent: req.body.agent,
      provider: 'none',
      latency: 0,
      error: err.message,
    });
  }
});

router.get('/recommendations', async (_req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: [] });
});

router.patch('/recommendations/:id/read', async (_req: AuthenticatedRequest, res) => {
  res.json({ success: true });
});

/** Provider health for dashboard / agents UI */
router.get('/providers', async (_req: AuthenticatedRequest, res) => {
  try {
    const [budget] = await Promise.all([checkPlatformCostBudget()]);
    res.json({
      success: true,
      data: {
        health: getProviderHealth(),
        snapshot: await getProviderAnalyticsSnapshot(),
        budget,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** User usage summary for dashboard widgets */
router.get('/usage', async (req: AuthenticatedRequest, res) => {
  try {
    const pgUserId = await resolvePgUserId(req.user!.email);
    if (!pgUserId) {
      return res.json({ success: true, data: null });
    }
    const { getUserUsage } = await import('../services/usage');
    const usage = await getUserUsage(pgUserId);
    res.json({ success: true, data: usage });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to load usage' });
  }
});

export default router;
