import { Router } from 'express';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { paramStr } from '../utils/httpParam';
import { listTaskLogs } from '../services/engineeringAgent/db';

const router = Router();

router.use(authenticate, requireRole('admin', 'superadmin'));

router.get('/metrics', async (_req: AuthenticatedRequest, res) => {
  // TODO: Re-implement metrics or remove route if no longer needed
  res.json({ success: false, error: 'Metrics route temporarily disabled due to build errors.' });
});

router.get('/tasks', async (req: AuthenticatedRequest, res) => {
  // TODO: Re-implement task listing or remove route if no longer needed
  res.json({ success: false, error: 'Task listing route temporarily disabled due to build errors.' });
});

router.get('/tasks/:id', async (req: AuthenticatedRequest, res) => {
  // TODO: Re-implement task details or remove route if no longer needed
  res.json({ success: false, error: 'Task details route temporarily disabled due to build errors.' });
});

router.get('/tasks/:id/activity', async (req: AuthenticatedRequest, res) => {
  // TODO: Re-implement task activity or remove route if no longer needed
  res.json({ success: false, error: 'Task activity route temporarily disabled due to build errors.' });
});

router.get('/tasks/:id/timeline', async (req: AuthenticatedRequest, res) => {
  // TODO: Re-implement task timeline or remove route if no longer needed
  res.json({ success: false, error: 'Task timeline route temporarily disabled due to build errors.' });
});

function deriveReasoningFromPlan(planJson: unknown, logs: Array<{ event_type: string }>) {
  const plan = planJson as {
    summary?: string;
    planningSummary?: string;
    fileSelectionRationale?: Array<{ path: string; reason: string }>;
    filesToRead?: string[];
  } | null;
  const buildFixAttempts = logs.filter((l) => l.event_type === 'build_error').length;
  return {
    planningSummary: plan?.planningSummary || plan?.summary || 'No planning summary recorded.',
    selectedFiles:
      plan?.fileSelectionRationale ||
      (plan?.filesToRead || []).map((path) => ({ path, reason: 'From execution plan' })),
    executionPlanSummary: plan?.summary || '',
    buildFixAttempts,
    finalDecision: 'See task status and build output.',
  };
}

export default router;
