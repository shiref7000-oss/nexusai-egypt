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
  GROQ_API_KEY: getEnv('GROQ_API_KEY', ''),
  OPENROUTER_API_KEY: getEnv('OPENROUTER_API_KEY', ''),
  OPENAI_API_KEY: getEnv('OPENAI_API_KEY', ''),
  AI_REQUEST_TIMEOUT_MS: parseInt(getEnv('AI_REQUEST_TIMEOUT_MS', '28000'), 10),
  AI_CACHE_TTL_MS: parseInt(getEnv('AI_CACHE_TTL_MS', '600000'), 10),
  REDIS_HOST: getEnv('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: getEnv('REDIS_PORT', '6379'),

  META_APP_ID: getEnv('META_APP_ID', ''),
  META_APP_SECRET: getEnv('META_APP_SECRET', ''),
  META_ACCESS_TOKEN: getEnv('META_ACCESS_TOKEN', ''),

  WHATSAPP_API_KEY: getEnv('WHATSAPP_API_KEY', ''),
  WHATSAPP_PHONE_NUMBER_ID: getEnv('WHATSAPP_PHONE_NUMBER_ID', ''),

  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3000'),

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
