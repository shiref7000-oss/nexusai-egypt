import { pool } from '../../config/db_pg';

export type MetaConnectionRow = {
  id: number;
  user_id: number;
  meta_user_id: string | null;
  access_token: string;
  token_expires_at: Date | null;
  status: string;
  last_sync_at: Date | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

export async function getConnectionByUserId(userId: number): Promise<MetaConnectionRow | null> {
  const r = await pool.query(`SELECT * FROM meta_connections WHERE user_id = $1`, [userId]);
  return (r.rows[0] as MetaConnectionRow) || null;
}

export async function upsertConnection(input: {
  userId: number;
  metaUserId: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
}): Promise<MetaConnectionRow> {
  const r = await pool.query(
    `INSERT INTO meta_connections (user_id, meta_user_id, access_token, token_expires_at, status, updated_at)
     VALUES ($1, $2, $3, $4, 'connected', NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       meta_user_id = EXCLUDED.meta_user_id,
       access_token = EXCLUDED.access_token,
       token_expires_at = EXCLUDED.token_expires_at,
       status = 'connected',
       last_sync_error = NULL,
       updated_at = NOW()
     RETURNING *`,
    [input.userId, input.metaUserId, input.accessToken, input.tokenExpiresAt]
  );
  return r.rows[0] as MetaConnectionRow;
}

export async function deleteConnection(userId: number): Promise<void> {
  await pool.query(`DELETE FROM meta_connections WHERE user_id = $1`, [userId]);
}

export async function updateSyncStatus(
  connectionId: number,
  status: 'success' | 'error' | 'running',
  error?: string
): Promise<void> {
  if (status === 'running') {
    await pool.query(
      `UPDATE meta_connections SET last_sync_status = 'running', updated_at = NOW() WHERE id = $1`,
      [connectionId]
    );
    return;
  }
  await pool.query(
    `UPDATE meta_connections SET
      last_sync_at = CASE WHEN $2 = 'success' THEN NOW() ELSE last_sync_at END,
      last_sync_status = $2,
      last_sync_error = $3,
      updated_at = NOW()
     WHERE id = $1`,
    [connectionId, status, error || null]
  );
}

export async function upsertAdAccounts(
  connectionId: number,
  accounts: { ad_account_id: string; name?: string; currency?: string; account_status?: string }[]
): Promise<{ id: number; ad_account_id: string }[]> {
  const rows: { id: number; ad_account_id: string }[] = [];
  for (const a of accounts) {
    const r = await pool.query(
      `INSERT INTO meta_ad_accounts (connection_id, ad_account_id, name, currency, account_status, is_selected)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (connection_id, ad_account_id) DO UPDATE SET
         name = EXCLUDED.name,
         currency = EXCLUDED.currency,
         account_status = EXCLUDED.account_status
       RETURNING id, ad_account_id`,
      [
        connectionId,
        a.ad_account_id,
        a.name || null,
        a.currency || 'EGP',
        a.account_status || null,
      ]
    );
    rows.push(r.rows[0] as { id: number; ad_account_id: string });
  }
  return rows;
}

export async function getAdAccountsForConnection(connectionId: number) {
  const r = await pool.query(
    `SELECT id, ad_account_id, name, currency, account_status, is_selected
     FROM meta_ad_accounts WHERE connection_id = $1 ORDER BY name`,
    [connectionId]
  );
  return r.rows;
}

export async function getSelectedAdAccountIds(connectionId: number): Promise<number[]> {
  const r = await pool.query(
    `SELECT id FROM meta_ad_accounts WHERE connection_id = $1 AND is_selected = true`,
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
    `UPDATE meta_ad_accounts SET is_selected = $3
     WHERE connection_id = $1 AND id = $2`,
    [connectionId, accountDbId, selected]
  );
}
