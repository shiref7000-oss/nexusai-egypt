import { pool } from '../../../config/db_pg';

export type TikTokConnectionRow = {
  id: number;
  user_id: number;
  tiktok_user_id: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  refresh_expires_at: Date | null;
  status: string;
  last_sync_at: Date | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

export async function getConnectionByUserId(userId: number): Promise<TikTokConnectionRow | null> {
  const r = await pool.query(`SELECT * FROM tiktok_connections WHERE user_id = $1`, [userId]);
  return (r.rows[0] as TikTokConnectionRow) || null;
}

export async function upsertConnection(input: {
  userId: number;
  tiktokUserId?: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt: Date | null;
  refreshExpiresAt?: Date | null;
  tokenScopeType?: 'marketing' | 'creator';
}): Promise<TikTokConnectionRow> {
  const r = await pool.query(
    `INSERT INTO tiktok_connections (
      user_id, tiktok_user_id, access_token, refresh_token,
      token_expires_at, refresh_expires_at, status, token_scope_type, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'connected', $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       tiktok_user_id = COALESCE(EXCLUDED.tiktok_user_id, tiktok_connections.tiktok_user_id),
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, tiktok_connections.refresh_token),
       token_expires_at = EXCLUDED.token_expires_at,
       refresh_expires_at = COALESCE(EXCLUDED.refresh_expires_at, tiktok_connections.refresh_expires_at),
       status = 'connected',
       token_scope_type = EXCLUDED.token_scope_type,
       last_sync_error = NULL,
       updated_at = NOW()
     RETURNING *`,
    [
      input.userId,
      input.tiktokUserId || null,
      input.accessToken,
      input.refreshToken || null,
      input.tokenExpiresAt,
      input.refreshExpiresAt || null,
      input.tokenScopeType || 'marketing',
    ]
  );
  return r.rows[0] as TikTokConnectionRow;
}

export async function deleteConnection(userId: number): Promise<void> {
  await pool.query(`DELETE FROM tiktok_connections WHERE user_id = $1`, [userId]);
}

export async function updateSyncStatus(
  connectionId: number,
  status: 'success' | 'error' | 'running',
  error?: string
): Promise<void> {
  if (status === 'running') {
    await pool.query(
      `UPDATE tiktok_connections SET last_sync_status = 'running', updated_at = NOW() WHERE id = $1`,
      [connectionId]
    );
    return;
  }
  await pool.query(
    `UPDATE tiktok_connections SET
      last_sync_at = CASE WHEN $2 = 'success' THEN NOW() ELSE last_sync_at END,
      last_sync_status = $2,
      last_sync_error = $3,
      updated_at = NOW()
     WHERE id = $1`,
    [connectionId, status, error || null]
  );
}

export type TikTokAdvertiserUpsert = {
  advertiser_id: string;
  advertiser_name?: string;
  name?: string;
  currency?: string;
  account_status?: string;
  status?: string;
  timezone?: string;
  is_selected?: boolean;
};

export async function upsertAdAccounts(
  connectionId: number,
  accounts: TikTokAdvertiserUpsert[],
  options?: { defaultSelectSingle?: boolean }
): Promise<{ id: number; advertiser_id: string }[]> {
  const defaultSelectSingle = options?.defaultSelectSingle !== false;
  const autoSelect = defaultSelectSingle && accounts.length === 1;

  const rows: { id: number; advertiser_id: string }[] = [];
  for (const a of accounts) {
    const displayName = a.advertiser_name || a.name || null;
    const status = a.account_status || a.status || null;
    const selected = a.is_selected ?? autoSelect;
    const r = await pool.query(
      `INSERT INTO tiktok_ad_accounts (
        connection_id, advertiser_id, name, currency, account_status, timezone, is_selected
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (connection_id, advertiser_id) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, tiktok_ad_accounts.name),
         currency = COALESCE(EXCLUDED.currency, tiktok_ad_accounts.currency),
         account_status = COALESCE(EXCLUDED.account_status, tiktok_ad_accounts.account_status),
         timezone = COALESCE(EXCLUDED.timezone, tiktok_ad_accounts.timezone)
       RETURNING id, advertiser_id`,
      [
        connectionId,
        a.advertiser_id,
        displayName,
        a.currency || 'USD',
        status,
        a.timezone || null,
        selected,
      ]
    );
    rows.push(r.rows[0] as { id: number; advertiser_id: string });
  }
  return rows;
}

export async function getAdAccountsForConnection(connectionId: number) {
  const r = await pool.query(
    `SELECT id, advertiser_id AS ad_account_id,
      name AS advertiser_name, name, currency, account_status AS status,
      account_status, timezone, is_selected
     FROM tiktok_ad_accounts WHERE connection_id = $1 ORDER BY name NULLS LAST, advertiser_id`,
    [connectionId]
  );
  return r.rows;
}

export async function countSelectedAdAccounts(connectionId: number): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM tiktok_ad_accounts WHERE connection_id = $1 AND is_selected = true`,
    [connectionId]
  );
  return Number(r.rows[0]?.c) || 0;
}

export async function getSelectedAdAccountIds(connectionId: number): Promise<number[]> {
  const r = await pool.query(
    `SELECT id FROM tiktok_ad_accounts WHERE connection_id = $1 AND is_selected = true`,
    [connectionId]
  );
  return r.rows.map((row) => row.id as number);
}

export async function setAdAccountSelected(
  connectionId: number,
  accountDbId: number,
  selected: boolean
): Promise<void> {
  await pool.query(
    `UPDATE tiktok_ad_accounts SET is_selected = $3 WHERE connection_id = $1 AND id = $2`,
    [connectionId, accountDbId, selected]
  );
}

export async function getValidAccessToken(connectionId: number): Promise<string | null> {
  const r = await pool.query(
    `SELECT id, access_token, refresh_token, token_expires_at FROM tiktok_connections WHERE id = $1`,
    [connectionId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at as string | Date) : null;
  const needsRefresh = expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;
  if (!needsRefresh) return row.access_token as string;
  if (!row.refresh_token) return row.access_token as string;
  return null;
}

/** Returns a valid access token, refreshing when near expiry. */
export async function ensureAccessToken(
  connectionId: number,
  refreshFn: (refreshToken: string) => Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>
): Promise<string | null> {
  const r = await pool.query(
    `SELECT access_token, refresh_token, token_expires_at FROM tiktok_connections WHERE id = $1`,
    [connectionId]
  );
  const row = r.rows[0];
  if (!row) return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at as string | Date) : null;
  const needsRefresh = expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  if (!needsRefresh) return row.access_token as string;
  if (!row.refresh_token) return row.access_token as string;

  try {
    const refreshed = await refreshFn(row.refresh_token as string);
    const tokenExpiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null;
    await updateTokens(
      connectionId,
      refreshed.access_token,
      refreshed.refresh_token || (row.refresh_token as string),
      tokenExpiresAt
    );
    return refreshed.access_token;
  } catch {
    return row.access_token as string;
  }
}

export async function updateTokens(
  connectionId: number,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiresAt: Date | null
): Promise<void> {
  await pool.query(
    `UPDATE tiktok_connections SET access_token = $2, refresh_token = COALESCE($3, refresh_token),
      token_expires_at = $4, updated_at = NOW() WHERE id = $1`,
    [connectionId, accessToken, refreshToken, tokenExpiresAt]
  );
}
