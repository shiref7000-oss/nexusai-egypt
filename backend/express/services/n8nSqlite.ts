import { existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../config/logger';

const execFileAsync = promisify(execFile);

const DEFAULT_DB = '/opt/n8n/.n8n/database.sqlite';

function parseN8nTime(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return new Date(value).toISOString();
  const s = String(value);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function sqliteQuery(dbPath: string, sql: string): Promise<Record<string, unknown>[]> {
  if (!existsSync(dbPath)) return [];
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql], { timeout: 15000 });
  if (!stdout.trim()) return [];
  try {
    return JSON.parse(stdout) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function listWorkflowsFromSqlite(dbPath = DEFAULT_DB) {
  try {
    const rows = await sqliteQuery(
      dbPath,
      `SELECT id, name, active FROM workflow_entity WHERE active = 1 ORDER BY name`,
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      active: Boolean(r.active),
    }));
  } catch (err: unknown) {
    logger.warn('n8n sqlite workflow list failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function listExecutionsFromSqlite(workflowId: string, limit = 5, dbPath = DEFAULT_DB) {
  try {
    const wid = workflowId.replace(/'/g, "''");
    const rows = await sqliteQuery(
      dbPath,
      `SELECT id, workflowId, status, startedAt, stoppedAt, finished, mode
       FROM execution_entity
       WHERE workflowId = '${wid}'
       ORDER BY id DESC
       LIMIT ${Math.min(limit, 50)}`,
    );
    const executions = await Promise.all(
      rows.map(async (r) => {
        const id = String(r.id);
        const status = String(r.status);
        let errorMessage: string | undefined;
        if (status === 'error') {
          errorMessage = await getExecutionErrorMessage(id, dbPath);
        }
        const startedAt = parseN8nTime(r.startedAt);
        const stoppedAt = parseN8nTime(r.stoppedAt);
        let durationMs: number | null = null;
        if (startedAt && stoppedAt) {
          durationMs = new Date(stoppedAt).getTime() - new Date(startedAt).getTime();
        }
        return {
          id,
          workflowId: String(r.workflowId),
          status: status as 'success' | 'error' | 'running' | 'waiting' | 'canceled' | 'unknown',
          startedAt,
          stoppedAt,
          finished: Boolean(r.finished),
          mode: r.mode ? String(r.mode) : undefined,
          errorMessage,
          durationMs,
        };
      }),
    );
    return executions;
  } catch (err: unknown) {
    logger.warn('n8n sqlite executions list failed', {
      workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function getExecutionErrorMessage(executionId: string, dbPath: string): Promise<string | undefined> {
  try {
    const rows = await sqliteQuery(
      dbPath,
      `SELECT data FROM execution_data WHERE executionId = ${Number(executionId)} LIMIT 1`,
    );
    if (!rows[0]?.data) return undefined;
    const raw = String(rows[0].data);
    const msgMatch = raw.match(/"message":"([^"]{5,500})"/);
    if (msgMatch) return msgMatch[1].replace(/\\n/g, ' ');
    if (raw.includes('Could not get parameter')) return 'Could not get parameter (n8n Code node)';
    if (raw.includes('Error in workflow')) return 'Error in workflow';
    return raw.slice(0, 200);
  } catch {
    return undefined;
  }
}

export function readN8nDbPath(): string {
  return process.env.N8N_SQLITE_PATH || DEFAULT_DB;
}
