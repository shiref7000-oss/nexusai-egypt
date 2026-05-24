import { Pool, type PoolConfig } from 'pg';
import { logger } from './logger';
import { env, getDatabaseConfig } from './env';

function buildPoolConfig(): PoolConfig {
  const cfg = getDatabaseConfig();
  if (cfg.connectionString) {
    return {
      connectionString: cfg.connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }
  return {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

export const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL error', { error: err.message });
});

export async function verifyDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
  logger.info('PostgreSQL connected');
}

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const ms = Date.now() - start;
  if (ms >= env.SLOW_QUERY_MS) {
    logger.warn('Slow PostgreSQL query', {
      ms,
      label: text.slice(0, 80).replace(/\s+/g, ' '),
    });
  }
  return result;
}
