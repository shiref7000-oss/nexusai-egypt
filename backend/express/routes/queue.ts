import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { logger } from '../config/logger';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { aiLimiter, queueLimiter } from '../middleware/rateLimit';
import {
  getQueueStatus,
  getRecentJobs,
  addAIJob,
  addWorkflowJob,
  retryDeadLetterJob,
} from '../services/queue';

const router = Router();

// All queue routes require authentication
router.use(authenticate);

// Get comprehensive queue status
router.get('/status', queueLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await getQueueStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    logger.error('Queue status error', { error: err.message, userId: req.user?.id });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get recent jobs from a specific queue
router.get(
  '/jobs/:queueName',
  queueLimiter,
  [
    param('queueName').isIn(['ai', 'workflow', 'notification', 'deadLetter']),
    param('count').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthenticatedRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const queueName = req.params.queueName as string;
      const count = parseInt(req.query.count as string) || 20;
      const jobs = await getRecentJobs(queueName, count);
      res.json({ success: true, data: jobs });
    } catch (err: any) {
      logger.error('Queue jobs error', { error: err.message, userId: req.user?.id });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Add AI job to queue
router.post(
  '/ai',
  aiLimiter,
  [
    body('agent').isIn(['ceo', 'ads', 'meta', 'moderator', 'support', 'product', 'finance', 'shipping', 'hr', 'confirmation']),
    body('prompt').trim().isLength({ min: 1, max: 8000 }),
    body('context').optional().isObject(),
  ],
  async (req: AuthenticatedRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { agent, prompt, context } = req.body;
      const pgId =
        req.user?.pgUserId ||
        (req.user?.id && /^\d+$/.test(String(req.user.id)) ? parseInt(String(req.user.id), 10) : null);
      const job = await addAIJob({
        agent,
        prompt,
        context,
        userId: pgId,
        requestId: `req-${Date.now()}`,
      });

      logger.info('AI job queued', { jobId: job.id, agent, userId: req.user?.id });
      res.json({ success: true, data: { jobId: job.id, status: 'queued' } });
    } catch (err: any) {
      logger.error('Queue AI job error', { error: err.message, userId: req.user?.id });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Add workflow job to queue
router.post(
  '/workflow',
  queueLimiter,
  [
    body('workflowName').trim().isLength({ min: 1, max: 200 }),
    body('input').isObject(),
    body('trigger').optional().isString(),
  ],
  async (req: AuthenticatedRequest, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: errors.array()[0].msg });
      }

      const { workflowName, input, trigger } = req.body;
      const pgId = req.user?.pgUserId || (req.user?.id && /^\d+$/.test(String(req.user.id)) ? parseInt(String(req.user.id), 10) : 1);
      const job = await addWorkflowJob({
        workflowName,
        input,
        trigger,
        userId: pgId,
      });

      logger.info('Workflow job queued', { jobId: job.id, workflowName, userId: req.user?.id });
      res.json({ success: true, data: { jobId: job.id, status: 'queued' } });
    } catch (err: any) {
      logger.error('Queue workflow job error', { error: err.message, userId: req.user?.id });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Retry a dead letter queue job (admin only)
router.post(
  '/retry/:jobId',
  requireRole('superadmin', 'admin'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { jobId } = req.params;
      const newJob = await retryDeadLetterJob(jobId);

      if (!newJob) {
        return res.status(404).json({ success: false, error: 'Job not found in dead letter queue' });
      }

      logger.info('DLQ job retried', { originalJobId: jobId, newJobId: newJob.id, userId: req.user?.id });
      res.json({ success: true, data: { originalJobId: jobId, newJobId: newJob.id, status: 'requeued' } });
    } catch (err: any) {
      logger.error('DLQ retry error', { error: err.message, userId: req.user?.id });
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Get dead letter queue summary (admin only)
router.get('/dead-letter/summary', requireRole('superadmin', 'admin'), queueLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const jobs = await getRecentJobs('deadLetter', 50);
    res.json({ success: true, data: jobs });
  } catch (err: any) {
    logger.error('DLQ summary error', { error: err.message, userId: req.user?.id });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
