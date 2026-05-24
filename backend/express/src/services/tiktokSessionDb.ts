import { pool } from '../config/db_pg';
import { logger } from '../config/logger';

export interface TikTokSession {
  id: number;
  account_id: number;
  tiktok_username: string | null;
  session_data: string;
  cookies: any[];
  local_storage: Record<string, string>;
  status: 'active' | 'expired' | 'disconnected';
  last_login_at: string | null;
  last_health_at: string | null;
  expires_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TikTokAuditEvent {
  id: number;
  session_id: number | null;
  account_id: number;
  event_type: string;
  details: any;
  created_at: string;
}

// ── Sessions ──

export async function createSession(
  accountId: number,
  sessionData: string,
  cookies: any[] = [],
  localStorage: Record<string, string> = {}
): Promise<TikTokSession> {
  const result = await pool.query<TikTokSession>(
    `INSERT INTO tiktok_sessions (account_id, session_data, cookies, local_storage, status, last_login_at)
     VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [accountId, sessionData, JSON.stringify(cookies), JSON.stringify(localStorage)]
  );

  if (result.rows[0]) return result.rows[0];

  // Update existing session
  const updated = await pool.query<TikTokSession>(
    `UPDATE tiktok_sessions
     SET session_data = $2, cookies = $3, local_storage = $4,
         status = 'active', last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE account_id = $1
     RETURNING *`,
    [accountId, sessionData, JSON.stringify(cookies), JSON.stringify(localStorage)]
  );
  return updated.rows[0];
}

export async function getActiveSession(accountId: number): Promise<TikTokSession | null> {
  const result = await pool.query<TikTokSession>(
    `SELECT * FROM tiktok_sessions
     WHERE account_id = $1 AND status = 'active'
     ORDER BY last_login_at DESC LIMIT 1`,
    [accountId]
  );
  return result.rows[0] || null;
}

export async function getSessionById(sessionId: number): Promise<TikTokSession | null> {
  const result = await pool.query<TikTokSession>(
    `SELECT * FROM tiktok_sessions WHERE id = $1`,
    [sessionId]
  );
  return result.rows[0] || null;
}

export async function updateSessionStatus(
  sessionId: number,
  status: 'active' | 'expired' | 'disconnected',
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `UPDATE tiktok_sessions
     SET status = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [sessionId, status, errorMessage || null]
  );
}

export async function updateSessionHealth(sessionId: number): Promise<void> {
  await pool.query(
    `UPDATE tiktok_sessions SET last_health_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [sessionId]
  );
}

export async function updateSessionUsername(sessionId: number, username: string): Promise<void> {
  await pool.query(
    `UPDATE tiktok_sessions SET tiktok_username = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [sessionId, username]
  );
}

export async function expireSession(sessionId: number, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE tiktok_sessions
     SET status = 'expired', error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [sessionId, errorMessage]
  );
}

// ── Audit Log ──

export async function logAuditEvent(
  eventType: string,
  accountId: number,
  sessionId?: number | null,
  details: any = {}
): Promise<void> {
  await pool.query(
    `INSERT INTO tiktok_audit_log (event_type, account_id, session_id, details)
     VALUES ($1, $2, $3, $4)`,
    [eventType, accountId, sessionId || null, JSON.stringify(details)]
  );
}

export async function getAuditEvents(
  accountId: number,
  limit: number = 20
): Promise<TikTokAuditEvent[]> {
  const result = await pool.query<TikTokAuditEvent>(
    `SELECT * FROM tiktok_audit_log
     WHERE account_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [accountId, limit]
  );
  return result.rows;
}

logger.info('TikTok session DB service initialized');
