import { Router } from 'express';
import db from '../../db/db';
import { logger } from '../../config/logger';

const router = Router();

/**
 * @route GET /admin/system-report
 * @group Admin - System operations
 * @summary Provides a system health and status report
 * @returns {object} 200 - An object with system status
 * @returns {Error} 500 - Internal Server Error
 */
router.get('/', async (req, res) => {
  try {
    // Simple query to check database connectivity
    const dbResult = await db.raw('SELECT 1 as result');
    const dbOk = dbResult.rows && dbResult.rows[0].result === 1;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
      nodeVersion: process.version,
    });
  } catch (error) {
    logger.error('Error generating system report:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate system report.' });
  }
});

export default router;
