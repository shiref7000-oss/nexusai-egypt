import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from './auth';
import { isDev } from '../config/env';

const apiMetrics: Array<Record<string, unknown>> = [];
const MAX_METRICS = 10000;

export function auditLogger(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = req.requestId || crypto.randomUUID();
  req.requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const logData = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode,
      duration,
      userId: req.user?.id,
      userRole: req.user?.role,
    };
    apiMetrics.push({ ...logData, timestamp: Date.now() });
    if (apiMetrics.length > MAX_METRICS) apiMetrics.splice(0, apiMetrics.length - MAX_METRICS);
    if (statusCode >= 500) logger.error('API request failed', logData);
    else if (statusCode >= 400) logger.warn('API request error', logData);
    else if (duration > 5000) logger.warn('API request slow', logData);
  });
  next();
}

export function errorTracker(err: { status?: number; statusCode?: number; message?: string; stack?: string; code?: string }, req: AuthenticatedRequest, res: Response, _next: NextFunction) {
  const errorId = crypto.randomUUID();
  const statusCode = err.status || err.statusCode || 500;
  logger.error('Request error', { errorId, path: req.path, message: err.message, stack: isDev ? err.stack : undefined });
  res.status(statusCode).json({
    success: false,
    error: isDev ? err.message : statusCode >= 500 ? 'Internal server error' : err.message,
    errorId,
    code: err.code || 'INTERNAL_ERROR',
  });
}

export function getRecentMetrics(minutes: number = 60) {
  const cutoff = Date.now() - minutes * 60000;
  const recent = apiMetrics.filter((m) => Number(m.timestamp) > cutoff);
  return {
    totalRequests: recent.length,
    errors: recent.filter((m) => Number(m.statusCode) >= 500).length,
    avgDuration:
      recent.length > 0
        ? Math.round(recent.reduce((s, m) => s + Number(m.duration || 0), 0) / recent.length)
        : 0,
  };
}

export function responseTime(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e6;
    try {
      if (!res.headersSent) res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
    } catch {
      /* ignore */
    }
  });
  next();
}
