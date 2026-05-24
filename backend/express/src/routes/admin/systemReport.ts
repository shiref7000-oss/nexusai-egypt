import { Router, Request, Response } from 'express';
import { logger } from '../../config/logger';
import { db } from '../../config/db';

const router = Router();

/**
 * @route GET /api/admin/system-report
 * @description Get a system health and metrics report.
 * @access Private (Admin)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // For this initial implementation, we will return a single dynamic query
    // to establish the database connection pattern, plus static placeholders.
    const userCountResult = await db.query('SELECT COUNT(*) FROM users;');
    const userCount = parseInt(userCountResult.rows[0].count, 10);

    const report = {
      timestamp: new Date().toISOString(),
      application: 'NexusAI',
      status: 'OK',
      metrics: {
        userCount,
        activeSessions: 0, // Placeholder for now
        pendingJobs: 0,   // Placeholder for now
      },
      version: process.env.npm_package_version || 'unknown',
    };

    res.json(report);
  } catch (error) {
    logger.error('Failed to generate system report:', error);
    res.status(500).json({ message: 'Error generating system report.' });
  }
});

export default router;