import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env, isDev, isProd, assertProductionEnv } from './config/env';
import { verifyDatabaseConnection } from './config/db_pg';
import { runMigrations } from './db/runMigrations';
import { logger } from './config/logger';
import { requestId, optionalAuth, AuthenticatedRequest } from './middleware/auth';
import { auditLogger, errorTracker, responseTime, getRecentMetrics } from './middleware/audit';
import { requestTiming } from './middleware/requestTiming';
import { apiLimiter, webhookLimiter } from './middleware/rateLimit';
import { redis } from './services/queue';

// Route imports
import authRoutes from './routes/auth';
import orderRoutes from './routes/orders';
import analyticsRoutes from './routes/analytics';
import agentRoutes from './routes/agents';
import workflowRoutes from './routes/workflows';
import aiRoutes from './routes/ai';
import webhookRoutes from './routes/webhooks';
import queueRoutes from './routes/queue';
import adminRoutes from './routes/admin';
import usageRoutes from './routes/usage';
import accountRoutes from './routes/account';
import integrationRoutes from './routes/integrations';
import publicOrderRoutes from './routes/publicOrders';
import publicSiteRoutes from './routes/publicSite';
import costAnalyzerRoutes from './routes/costAnalyzer';
import metaAdsRoutes from './routes/metaAds';
import tiktokAdsRoutes from './routes/tiktokAds';
import adsHubRoutes from './routes/adsHub';
import businessContextRoutes from './routes/businessContext';
import whatsappRoutes from './routes/whatsapp';
import engineeringAgentRoutes from './routes/engineeringAgent';
import { startQueueWorkers, closeQueues } from './services/queue';

const app = express();

// ============================================================
// Security Middleware
// ============================================================
app.use(requestId);
app.use(responseTime);
app.use(requestTiming);
app.use(auditLogger);

// Helmet security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      env.FRONTEND_URL,
      'https://nexus-ai.group',
      'https://www.nexus-ai.group',
      'https://nexusai-egypt.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000',
      undefined, // Allow requests with no origin (curl, etc.)
    ];
    if (isDev || !origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key', 'X-Nexus-Api-Key', 'X-Nexus-Signature'],
}));

app.use(compression());
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// Rate Limiting
// ============================================================
app.use('/api/', apiLimiter);
app.use('/api/webhooks', webhookLimiter); // More generous for external services

// ============================================================
// Health Checks (unauthenticated)
// ============================================================

// Basic health check
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  });
});

// Detailed health check (internal monitoring)
app.get('/health/detailed', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user?.role === 'superadmin' || req.user?.role === 'admin';

  // Check Redis
  let redisStatus = 'unknown';
  try {
    await redis.ping();
    redisStatus = 'ready';
  } catch {
    redisStatus = 'error';
  }

  // Check AI providers (quick health check)
  let aiProviderStatus = 'unknown';
  try {
    const { getProviderHealth } = await import('./services/ai');
    const providers = getProviderHealth();
    aiProviderStatus = providers.some((p) => p.healthy) ? 'healthy' : 'degraded';
  } catch {
    aiProviderStatus = 'error';
  }

  const status = {
    success: true,
    status: redisStatus === 'ready' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services: {
      redis: redisStatus,
      aiProviders: aiProviderStatus,
      server: 'running',
    },
    memory: isAdmin ? {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      external: Math.round((process.memoryUsage().external || 0) / 1024 / 1024),
    } : undefined,
    metrics: isAdmin ? getRecentMetrics(60) : undefined,
  };

  res.status(redisStatus === 'ready' ? 200 : 503).json(status);
});

// Ready probe (for Kubernetes/Docker)
app.get('/health/ready', async (_req, res) => {
  try {
    await redis.ping();
    res.status(200).json({ success: true, ready: true });
  } catch {
    res.status(503).json({ success: false, ready: false, reason: 'redis' });
  }
});

// Live probe (always returns 200 if process is running)
app.get('/health/live', (_req, res) => {
  res.status(200).json({ success: true, live: true, uptime: process.uptime() });
});

// Production runtime health (DB, Redis, n8n, queue, failures)
app.get('/health/runtime', optionalAuth, async (_req, res) => {
  try {
    const { getRuntimeHealthReport } = await import('./services/runtimeHealth');
    const report = await getRuntimeHealthReport();
    res.status(report.status === 'unhealthy' ? 503 : 200).json({ success: true, data: report });
  } catch (err: unknown) {
    res.status(503).json({
      success: false,
      error: err instanceof Error ? err.message : 'Health check failed',
    });
  }
});

// ============================================================
// API Routes
// ============================================================

// Auth routes (already have authLimiter in route file)
app.use('/api/auth', authRoutes);
app.use('/api/public', publicSiteRoutes);
app.use('/api/account', accountRoutes);

// Protected routes (require authentication)
app.use('/api/orders', orderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/usage', usageRoutes);

// Integrations (API keys + inbound hooks are unauthenticated subsets inside router)
app.use('/api/integrations', integrationRoutes);
app.use('/api/public/orders', publicOrderRoutes);
app.use('/api/meta', metaAdsRoutes);
app.use('/api/tiktok', tiktokAdsRoutes);
app.use('/api/ads', adsHubRoutes);
app.use('/api/context', businessContextRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/cost-analyzer', costAnalyzerRoutes);
app.use('/api/engineering-agent', engineeringAgentRoutes);

// Webhook routes (no auth - external services call these)
app.use('/api/webhooks', webhookRoutes);


// ============================================================
app.use((req: any, res: any) => {
// ============================================================
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
  });
});

// Global error handler (must be last)
app.use(errorTracker);

// ============================================================
// Server Startup
// ============================================================
const PORT = env.PORT;

async function bootstrap() {
  const prodErrors = assertProductionEnv();
  prodErrors.forEach((e) => logger.error(`[ENV] ${e}`));
  if (prodErrors.length > 0 && isProd) {
    throw new Error('Production environment validation failed');
  }

  await verifyDatabaseConnection();

  if (env.RUN_WORKERS) {
    startQueueWorkers();
    logger.info('BullMQ workers running in API process');
  } else {
    logger.info('BullMQ workers disabled in API — use nexusai-worker PM2 process');
  }

  if (env.MIGRATE_ON_START) {
    const migrationResult = await runMigrations();
    logger.info('Database migrations', migrationResult);
  }

  validateEnvironment();
}

const server = app.listen(PORT, () => {
  bootstrap().catch((err) => {
    logger.error('Startup bootstrap failed', { error: err instanceof Error ? err.message : err });
    process.exit(1);
  });

  logger.info(`NexusAI API server running on port ${PORT} [${env.NODE_ENV}]`);
  logger.info(`Health: /health · /health/ready · /health/runtime`);

  if (isDev) {
    logger.warn('Running in DEVELOPMENT mode - security features relaxed');
  }
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  server.close(async () => {
    logger.info('HTTP server closed');
    await closeQueues().catch(() => undefined);
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Validate environment configuration
function validateEnvironment() {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (env.JWT_SECRET === 'nexusai-dev-secret-change-me') {
    if (isProd) {
      errors.push('JWT_SECRET is using default value in production');
    } else {
      warnings.push('JWT_SECRET is using default value');
    }
  }

  if (!env.DATABASE_URL && !env.DB_PASSWORD && isProd) {
    warnings.push('DATABASE_URL or DB_PASSWORD not set');
  }

  if (!env.GEMINI_API_KEY) {
    warnings.push('GEMINI_API_KEY not set (primary AI provider)');
  }
  if (!env.GROQ_API_KEY) {
    warnings.push('GROQ_API_KEY not set (fallback AI provider)');
  }

  if (!env.REDIS_HOST) {
    warnings.push('REDIS_HOST not set');
  }

  if (!env.FRONTEND_URL) {
    warnings.push('FRONTEND_URL not set');
  }

  warnings.forEach(w => logger.warn(`[ENV] ${w}`));
  errors.forEach(e => logger.error(`[ENV] ${e}`));

  if (errors.length > 0 && isProd) {
    logger.error('Critical environment validation failures detected');
  }
}

export default app;
