import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Store for Redis-backed rate limiting (in-memory for now, upgrade to RedisStore for cluster)
const requestStore = new Map<string, { count: number; resetTime: number }>();

function createCustomLimiter(windowMs: number, maxRequests: number, keyPrefix: string) {
  return rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => {
      // Use user ID if authenticated, fallback to IP
      const userId = req.user?.id;
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      return userId ? `${keyPrefix}:user:${userId}` : `${keyPrefix}:ip:${ip}`;
    },
    handler: (req: any, res: any) => {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
    skip: (req: any) => {
      // Skip rate limiting for health checks and superadmin
      if (req.path === '/health') return true;
      if (req.user?.role === 'superadmin') return true;
      return false;
    },
  });
}

// General API rate limiter - 100 requests per minute
export const apiLimiter = createCustomLimiter(
  env.RATE_LIMIT_WINDOW_MS || 60000,
  env.RATE_LIMIT_MAX_REQUESTS || 100,
  'api'
);

// Auth rate limiter - 20 login attempts per 15 minutes
export const authLimiter = createCustomLimiter(
  15 * 60 * 1000, // 15 minutes
  20,
  'auth'
);

// AI processing rate limiter - 30 requests per minute
export const aiLimiter = createCustomLimiter(
  60 * 1000, // 1 minute
  30,
  'ai'
);

// Queue operations rate limiter - 60 requests per minute
export const queueLimiter = createCustomLimiter(
  60 * 1000, // 1 minute
  60,
  'queue'
);

// Webhook rate limiter - 200 requests per minute (external services)
export const webhookLimiter = createCustomLimiter(
  60 * 1000, // 1 minute
  200,
  'webhook'
);

/** Public orders API — keyed by integration API key */
export const publicOrdersLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    const integrationId = req.integrationAuth?.integrationId ?? req.integration?.id;
    return integrationId ? `public-orders:int:${integrationId}` : `public-orders:ip:${req.ip}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Public orders rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  },
});

// Strict rate limiter for sensitive operations - 10 requests per minute
export const strictLimiter = createCustomLimiter(
  60 * 1000, // 1 minute
  10,
  'strict'
);

// Admin operations rate limiter - 120 requests per minute
export const adminLimiter = createCustomLimiter(
  60 * 1000, // 1 minute
  120,
  'admin'
);

// Sliding window rate limiter for dynamic limits based on user plan
export function planBasedLimiter(req: any, res: any, next: any) {
  const planLimits: Record<string, { rpm: number; rpd: number }> = {
    free: { rpm: 30, rpd: 500 },
    starter: { rpm: 60, rpd: 2000 },
    pro: { rpm: 120, rpd: 10000 },
    enterprise: { rpm: 300, rpd: 50000 },
  };

  const plan = req.user?.plan || 'free';
  const limit = planLimits[plan] || planLimits.free;

  // This is a simplified version - production should use Redis-backed sliding window
  const key = `plan:${plan}:user:${req.user?.id}`;
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  const entry = requestStore.get(key);
  if (!entry || entry.resetTime < now) {
    requestStore.set(key, { count: 1, resetTime: now + 60000 });
    return next();
  }

  if (entry.count >= limit.rpm) {
    return res.status(429).json({
      success: false,
      error: `Plan limit exceeded. Your ${plan} plan allows ${limit.rpm} requests/minute.`,
      upgradeUrl: '/upgrade',
    });
  }

  entry.count++;
  next();
}
