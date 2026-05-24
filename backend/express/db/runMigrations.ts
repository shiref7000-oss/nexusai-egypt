import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { pool } from '../config/db_pg';
import { logger } from '../config/logger';

const MIGRATIONS_DIR = join(process.cwd(), 'src/db/migrations');

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (exists.rowCount && exists.rowCount > 0) {
      skipped.push(file);
      continue;
    }

    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      logger.info('Migration applied', { file });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Migration failed', { file, error: err instanceof Error ? err.message : err });
      throw err;
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}

if (require.main === module) {
  runMigrations()
    .then((r) => {
      logger.info('Migrations complete', r);
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration runner failed', { error: err.message });
      process.exit(1);
    });
}
