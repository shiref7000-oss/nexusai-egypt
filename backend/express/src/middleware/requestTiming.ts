import { Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from './auth';

const SLOW_REQUEST_MS = parseInt(process.env.SLOW_REQUEST_MS || '3000', 10);

/** Logs structured timing; exposes X-Response-Time (via responseTime) and optional _timingMs on JSON bodies. */
export function requestTiming(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const start = Date.now();

  const originalJson = res.json.bind(res);
  res.json = function jsonWithTiming(body: unknown) {
    const ms = Date.now() - start;
    if (body && typeof body === 'object' && body !== null && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if (record.success === true && record.data && typeof record.data === 'object' && record.data !== null) {
        const data = record.data as Record<string, unknown>;
        if (data._timingMs === undefined) data._timingMs = ms;
      }
    }
    res.setHeader('X-Server-Timing', `total;dur=${ms}`);
    return originalJson(body);
  } as typeof res.json;

  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms >= SLOW_REQUEST_MS) {
      logger.warn('Slow HTTP request', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ms,
      });
    }
  });

  next();
}
