import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });

function getEnv(name: string, defaultValue?: string): string {
  return process.env[name] || defaultValue || '';
}

export type DatabaseConfig = {
  connectionString?: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

/** Prefer DATABASE_URL; fall back to DB_* (production VPS pattern). */
export function getDatabaseConfig(): DatabaseConfig {
  const url = getEnv('DATABASE_URL');
  if (url) {
    return {
      connectionString: url,
      host: '127.0.0.1',
      port: 5432,
      database: 'nexusai',
      user: 'postgres',
      password: '',
    };
  }
  return {
    host: getEnv('DB_HOST', '127.0.0.1'),
    port: parseInt(getEnv('DB_PORT', '5432'), 10),
    database: getEnv('DB_NAME', 'nexusai'),
    user: getEnv('DB_USER', 'postgres'),
    password: getEnv('DB_PASSWORD', ''),
  };
}

export function getDatabaseUrlForShell(): string {
  const cfg = getDatabaseConfig();
  if (cfg.connectionString) return cfg.connectionString;
  const user = encodeURIComponent(cfg.user);
  const pass = encodeURIComponent(cfg.password);
  return `postgresql://${user}:${pass}@${cfg.host}:${cfg.port}/${cfg.database}`;
}

export const env = {
  PORT: parseInt(getEnv('PORT', '3001'), 10),
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  API_BASE_URL: getEnv('API_BASE_URL', 'http://localhost:3001'),

  DATABASE_URL: getEnv('DATABASE_URL', ''),
  DB_HOST: getEnv('DB_HOST', '127.0.0.1'),
  DB_PORT: getEnv('DB_PORT', '5432'),
  DB_NAME: getEnv('DB_NAME', 'nexusai'),
  DB_USER: getEnv('DB_USER', 'postgres'),
  DB_PASSWORD: getEnv('DB_PASSWORD', ''),

  MIGRATE_ON_START: getEnv('MIGRATE_ON_START', 'true') === 'true',

  SUPABASE_URL: getEnv('SUPABASE_URL', ''),
  SUPABASE_PUBLISHABLE_KEY: getEnv('SUPABASE_PUBLISHABLE_KEY', ''),
  SUPABASE_SECRET_KEY: getEnv('SUPABASE_SECRET_KEY', ''),

  JWT_SECRET: getEnv('JWT_SECRET', 'nexusai-dev-secret-change-me'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '7d'),

  GEMINI_API_KEY: getEnv('GEMINI_API_KEY', ''),
  GEMINI_KEY_1: getEnv('GEMINI_KEY_1', getEnv('GEMINI_API_KEY', '')),
  GEMINI_KEY_2: getEnv('GEMINI_KEY_2', ''),
  GEMINI_KEY_3: getEnv('GEMINI_KEY_3', ''),
  /** Google AI model id (gemini-1.5-flash is retired on the API; default is current Flash). */
  GEMINI_MODEL: getEnv('GEMINI_MODEL', 'gemini-2.5-flash'),
  /** Engineering Agent: lightweight routing (search, memory, compression). */
  GEMINI_MODEL_FLASH: getEnv('GEMINI_MODEL_FLASH', getEnv('GEMINI_MODEL', 'gemini-2.5-flash')),
  /** Engineering Agent: planning, patches, debugging, multi-file work. */
  GEMINI_MODEL_PRO: getEnv('GEMINI_MODEL_PRO', 'gemini-2.5-pro'),
  GROQ_API_KEY: getEnv('GROQ_API_KEY', ''),
  OPENROUTER_API_KEY: getEnv('OPENROUTER_API_KEY', ''),
  OPENAI_API_KEY: getEnv('OPENAI_API_KEY', ''),
  /** Primary production provider (default: Gemini). */
  AI_PRIMARY_PROVIDER: getEnv('AI_PRIMARY_PROVIDER', 'gemini'),
  /** Automatic fallback when primary fails (default: Groq). */
  AI_FALLBACK_PROVIDER: getEnv('AI_FALLBACK_PROVIDER', 'groq'),
  /** When true, also try OpenRouter/OpenAI after primary+fallback. */
  AI_EXTENDED_FALLBACK: getEnv('AI_EXTENDED_FALLBACK', 'false') === 'true',
  AI_REQUEST_TIMEOUT_MS: parseInt(getEnv('AI_REQUEST_TIMEOUT_MS', '28000'), 10),
  AI_CACHE_TTL_MS: parseInt(getEnv('AI_CACHE_TTL_MS', '600000'), 10),
  AI_PLATFORM_COST_SOFT_USD: parseFloat(getEnv('AI_PLATFORM_COST_SOFT_USD', '3')),
  AI_PLATFORM_COST_HARD_USD: parseFloat(getEnv('AI_PLATFORM_COST_HARD_USD', '5')),
  REDIS_HOST: getEnv('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: getEnv('REDIS_PORT', '6379'),
  /** When false, API process does not run BullMQ workers (use separate nexusai-worker PM2 app). */
  RUN_WORKERS: getEnv('RUN_WORKERS', 'true') !== 'false',
  WORKER_HEALTH_PORT: parseInt(getEnv('WORKER_HEALTH_PORT', '3002'), 10),
  SLOW_QUERY_MS: parseInt(getEnv('SLOW_QUERY_MS', '500'), 10),
  CACHE_REDIS_PREFIX: getEnv('CACHE_REDIS_PREFIX', 'nexus:cache:'),

  META_APP_ID: getEnv('META_APP_ID', ''),
  META_APP_SECRET: getEnv('META_APP_SECRET', ''),
  META_ACCESS_TOKEN: getEnv('META_ACCESS_TOKEN', ''),
  META_GRAPH_VERSION: getEnv('META_GRAPH_VERSION', 'v21.0'),
  META_REDIRECT_URI: getEnv('META_REDIRECT_URI', ''),

  TIKTOK_APP_ID: getEnv('TIKTOK_APP_ID', ''),
  TIKTOK_APP_SECRET: getEnv('TIKTOK_APP_SECRET', ''),
  TIKTOK_REDIRECT_URI: getEnv('TIKTOK_REDIRECT_URI', ''),

  /** Business Context Intelligence */
  GEMINI_EMBEDDING_MODEL: getEnv('GEMINI_EMBEDDING_MODEL', 'text-embedding-004'),
  BCI_EMBEDDING_DIM: parseInt(getEnv('BCI_EMBEDDING_DIM', '768'), 10),
  BCI_CRAWL_MAX_PAGES: parseInt(getEnv('BCI_CRAWL_MAX_PAGES', '12'), 10),

  WHATSAPP_API_KEY: getEnv('WHATSAPP_API_KEY', ''),
  WHATSAPP_PHONE_NUMBER_ID: getEnv('WHATSAPP_PHONE_NUMBER_ID', ''),
  /** Platform-level fallback for Meta webhook GET verify (per-tenant tokens preferred). */
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: getEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN', ''),
  INTEGRATION_ENCRYPTION_KEY: getEnv('INTEGRATION_ENCRYPTION_KEY', ''),

  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3000'),

  /** Root directory the engineering agent may read/write (absolute path). */
  ENGINEERING_REPO_ROOT: getEnv('ENGINEERING_REPO_ROOT', ''),
  /** Optional API directory when backend/express is not inside the git clone (e.g. /var/www/nexusai-api). */
  ENGINEERING_BACKEND_ROOT: getEnv('ENGINEERING_BACKEND_ROOT', ''),
  ENGINEERING_AGENT_ENABLED: getEnv('ENGINEERING_AGENT_ENABLED', 'true') === 'true',
  /** When true, HIGH risk tasks run without manual approval (warning only) */
  ENGINEERING_ALLOW_HIGH_RISK: getEnv('ENGINEERING_ALLOW_HIGH_RISK', 'false'),
  /** Create git branch agent/task-<id> before writes (default on) */
  ENGINEERING_BRANCH_ISOLATION: getEnv('ENGINEERING_BRANCH_ISOLATION', 'true'),
  /** 6-digit PIN for POST /{phone_number_id}/register when Meta phone status is not CONNECTED */
  WHATSAPP_REGISTRATION_PIN: getEnv('WHATSAPP_REGISTRATION_PIN', ''),
  ENGINEERING_TASK_TIMEOUT_MS: parseInt(getEnv('ENGINEERING_TASK_TIMEOUT_MS', '600000'), 10),
  ENGINEERING_STALE_TASK_MINUTES: parseInt(getEnv('ENGINEERING_STALE_TASK_MINUTES', '30'), 10),

  /** Phase 3: admin-triggered production deploy from engineering agent tasks */
  ENGINEERING_DEPLOY_ENABLED: getEnv('ENGINEERING_DEPLOY_ENABLED', ''),
  ENGINEERING_DEPLOY_DRY_RUN: getEnv('ENGINEERING_DEPLOY_DRY_RUN', 'false') === 'true',
  ENGINEERING_DEPLOY_API_DIR: getEnv('ENGINEERING_DEPLOY_API_DIR', '/var/www/nexusai-api'),
  ENGINEERING_DEPLOY_FRONT_DIR: getEnv('ENGINEERING_DEPLOY_FRONT_DIR', '/var/www/nexusai-frontend'),
  ENGINEERING_DEPLOY_REPO_ROOT: getEnv('ENGINEERING_DEPLOY_REPO_ROOT', ''),
  ENGINEERING_DEPLOY_BACKUP_ROOT: getEnv('ENGINEERING_DEPLOY_BACKUP_ROOT', '/var/backups/nexusai'),
  ENGINEERING_DEPLOY_PM2_NAME: getEnv('ENGINEERING_DEPLOY_PM2_NAME', 'nexusai-api'),
  ENGINEERING_DEPLOY_PUBLIC_URL: getEnv('ENGINEERING_DEPLOY_PUBLIC_URL', ''),

  /** Phase 4: QA verification (browser, DOM, bundle, API) */
  ENGINEERING_VERIFY_LOCAL_URL: getEnv('ENGINEERING_VERIFY_LOCAL_URL', ''),
  ENGINEERING_VERIFY_PUBLIC_URL: getEnv('ENGINEERING_VERIFY_PUBLIC_URL', ''),
  ENGINEERING_VERIFY_API_URL: getEnv('ENGINEERING_VERIFY_API_URL', ''),
  ENGINEERING_VERIFY_API_TOKEN: getEnv('ENGINEERING_VERIFY_API_TOKEN', ''),
  ENGINEERING_VERIFY_ARTIFACTS_DIR: getEnv('ENGINEERING_VERIFY_ARTIFACTS_DIR', ''),
  ENGINEERING_VERIFY_STRICT: getEnv('ENGINEERING_VERIFY_STRICT', 'true') === 'true',

  RATE_LIMIT_WINDOW_MS: parseInt(getEnv('RATE_LIMIT_WINDOW_MS', '60000'), 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(getEnv('RATE_LIMIT_MAX_REQUESTS', '100'), 10),

  N8N_URL: getEnv('N8N_URL', ''),
  N8N_API_KEY: getEnv('N8N_API_KEY', ''),
  N8N_USERNAME: getEnv('N8N_USERNAME', ''),
  N8N_PASSWORD: getEnv('N8N_PASSWORD', ''),

  INTEGRATIONS_ENABLED: getEnv('INTEGRATIONS_ENABLED', 'true') === 'true',
  WEBHOOK_SIGNING_SECRET: getEnv('WEBHOOK_SIGNING_SECRET', ''),
};

export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';

export function assertProductionEnv(): string[] {
  const errors: string[] = [];
  if (!isProd) return errors;

  if (env.JWT_SECRET === 'nexusai-dev-secret-change-me' || env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be set to a strong value in production');
  }
  const db = getDatabaseConfig();
  if (!db.connectionString && !db.password && db.user === 'postgres') {
    errors.push('DATABASE_URL or DB_PASSWORD must be configured in production');
  }
  if (!env.REDIS_HOST) errors.push('REDIS_HOST is required');
  return errors;
}
