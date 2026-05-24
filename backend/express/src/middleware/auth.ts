import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env, isDev } from '../config/env';
import { logger } from '../config/logger';

// Ensure JWT secret is not the default in production
if (env.JWT_SECRET === 'nexusai-dev-secret-change-me' && isDev === false) {
  logger.error('CRITICAL: Default JWT secret detected in production!');
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    plan: string;
    pgUserId?: number;
    monthlyRequestLimit?: number;
    monthlyRequestsUsed?: number;
    impersonatedBy?: string;
  };
  requestId?: string;
  isImpersonation?: boolean;
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

// Generate unique request ID (honor inbound X-Request-ID for tracing)
export function requestId(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  req.requestId =
    typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : crypto.randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

// Main authentication middleware
export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn('Auth failed: No Bearer token', { path: req.path, ip: req.ip });
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid Bearer token.',
        code: 'AUTH_MISSING_TOKEN',
      });
    }

    const token = authHeader.substring(7);

    // Basic token validation
    if (!token || token.length < 20) {
      logger.warn('Auth failed: Invalid token format', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Invalid token format',
        code: 'AUTH_INVALID_TOKEN',
      });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, {
        clockTolerance: 30, // 30 second clock skew tolerance
        maxAge: env.JWT_EXPIRES_IN || '7d',
      });
    } catch (jwtErr: any) {
      if (jwtErr.name === 'TokenExpiredError') {
        logger.warn('Auth failed: Token expired', { path: req.path, userId: decoded?.userId });
        return res.status(401).json({
          success: false,
          error: 'Token expired. Please sign in again.',
          code: 'AUTH_TOKEN_EXPIRED',
        });
      }
      if (jwtErr.name === 'JsonWebTokenError') {
        logger.warn('Auth failed: Invalid token', { path: req.path, error: jwtErr.message });
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'AUTH_INVALID_TOKEN',
        });
      }
      throw jwtErr;
    }

    if (!decoded.userId || !decoded.email) {
      logger.warn('Auth failed: Token missing claims', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Invalid token claims',
        code: 'AUTH_INVALID_CLAIMS',
      });
    }

    const userId = decoded.userId;
    const numericId = /^\d+$/.test(String(userId)) ? parseInt(String(userId), 10) : null;

    let dbRole = decoded.role || 'user';
    let dbPlan = decoded.plan || 'free';
    let dbStatus = 'active';
    let pgUserId: number | undefined;
    let monthlyRequestLimit: number | undefined;
    let monthlyRequestsUsed: number | undefined;
    try {
      const { pool } = require('../config/db_pg');
      const dbResult = await pool.query(
        `SELECT id, role, plan::text AS plan, status, monthly_request_limit, monthly_requests_used
         FROM users WHERE email = $1`,
        [decoded.email]
      );
      if (dbResult.rows.length > 0) {
        const row = dbResult.rows[0];
        dbRole = row.role;
        dbPlan = row.plan;
        dbStatus = row.status;
        pgUserId = row.id;
        monthlyRequestLimit = Number(row.monthly_request_limit);
        monthlyRequestsUsed = Number(row.monthly_requests_used);
      } else if (numericId) {
        const byId = await pool.query(
          `SELECT id, role, plan::text AS plan, status, monthly_request_limit, monthly_requests_used, full_name
           FROM users WHERE id = $1`,
          [numericId]
        );
        if (byId.rows.length > 0) {
          const row = byId.rows[0];
          dbRole = row.role;
          dbPlan = row.plan;
          dbStatus = row.status;
          pgUserId = row.id;
          monthlyRequestLimit = Number(row.monthly_request_limit);
          monthlyRequestsUsed = Number(row.monthly_requests_used);
        }
      }
    } catch (dbErr) {
      logger.error('Auth DB lookup failed', { error: dbErr instanceof Error ? dbErr.message : dbErr });
      return res.status(503).json({
        success: false,
        error: 'Authentication service unavailable',
        code: 'AUTH_DB_UNAVAILABLE',
      });
    }

    if (!pgUserId && numericId) {
      pgUserId = numericId;
    }

    if (!pgUserId && !numericId) {
      return res.status(401).json({
        success: false,
        error: 'Account not found',
        code: 'AUTH_USER_NOT_FOUND',
      });
    }

    const isImpersonation = Boolean(decoded.isImpersonation && decoded.impersonatedBy);
    if (isImpersonation) {
      req.isImpersonation = true;
    } else if (dbStatus === 'suspended') {
      return res.status(403).json({ success: false, error: 'Account suspended', code: 'AUTH_SUSPENDED' });
    } else if (dbStatus === 'pending') {
      return res.status(403).json({ success: false, error: 'Account pending activation', code: 'AUTH_PENDING' });
    } else if (dbStatus === 'inactive') {
      return res.status(403).json({ success: false, error: 'Account inactive', code: 'AUTH_INACTIVE' });
    }

    req.user = {
      id: userId,
      email: decoded.email,
      name: decoded.name || 'User',
      role: dbRole,
      plan: dbPlan,
      pgUserId,
      monthlyRequestLimit,
      monthlyRequestsUsed,
      impersonatedBy: decoded.impersonatedBy,
    };

    if (pgUserId) {
      try {
        const { pool: pgPool } = await import('../config/db_pg');
        const nameRes = await pgPool.query('SELECT full_name FROM users WHERE id = $1', [pgUserId]);
        if (nameRes.rows[0]?.full_name) {
          req.user.name = nameRes.rows[0].full_name;
        }
      } catch {
        /* ignore */
      }
    }

    logger.debug('Auth success', { userId: req.user.id, path: req.path, role: req.user.role });
    next();
  } catch (err: any) {
    logger.error('Auth middleware error', { error: err.message, path: req.path });
    return res.status(500).json({
      success: false,
      error: isDev ? err.message : 'Authentication system error',
      code: 'AUTH_SYSTEM_ERROR',
    });
  }
};

// Role-based access control
export const requireRole = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    // Role hierarchy: superadmin > admin > moderator > user > viewer
    const roleHierarchy: Record<string, number> = {
      superadmin: 5,
      admin: 4,
      moderator: 3,
      manager: 3,
      user: 2,
      viewer: 1,
    };

    const userRoleLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = Math.max(...roles.map(r => roleHierarchy[r] || 0));

    if (userRoleLevel < requiredLevel) {
      logger.warn('RBAC denied', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${roles.join(' or ')}`,
        code: 'RBAC_DENIED',
      });
    }

    next();
  };
};

// Webhook signature validation for WhatsApp
export function validateWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-hub-signature-256'] as string;

  if (!signature) {
    // For verification challenges, allow without signature
    if (req.query['hub.mode'] === 'subscribe') {
      return next();
    }
    logger.warn('Webhook missing signature', { path: req.path, ip: req.ip });
    return res.status(401).json({ success: false, error: 'Missing webhook signature' });
  }

  try {
    const appSecret = env.META_APP_SECRET;
    if (!appSecret) {
      logger.warn('Webhook signature validation skipped: No app secret configured');
      return next(); // Allow in dev, log warning
    }

    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(JSON.stringify(req.body), 'utf8')
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))) {
      logger.error('Webhook signature mismatch', { path: req.path });
      return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
    }

    next();
  } catch (err: any) {
    logger.error('Webhook signature validation error', { error: err.message });
    return res.status(400).json({ success: false, error: 'Signature validation failed' });
  }
}

// Optional auth - doesn't fail if no token, but sets user if present
export const optionalAuth = async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, env.JWT_SECRET, { clockTolerance: 30 }) as any;

    if (decoded?.userId) {
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name || 'User',
        role: decoded.role || 'user',
        plan: decoded.plan || 'free',
      };
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }
  next();
};
