import { pool } from '../../config/db_pg';
import type { AdsAlertRow, AdsPlatformId } from '../adsPlatforms/types';
import type { AlertCandidate } from './ruleEngine';

export async function listAlerts(
  userId: number,
  platform: AdsPlatformId,
  status: 'open' | 'resolved' | 'all' = 'open',
  limit = 50,
  window?: { since: string; until: string }
): Promise<AdsAlertRow[]> {
  const params: (number | string)[] = [userId, platform];
  const conditions: string[] = [];
  if (status !== 'all') {
    params.push(status === 'open' ? 'open' : 'resolved');
    conditions.push(`status = $${params.length}`);
  }
  if (window) {
    params.push(window.since);
    conditions.push(`created_at::date >= $${params.length}::date`);
    params.push(window.until);
    conditions.push(`created_at::date <= $${params.length}::date`);
  }
  params.push(limit);
  const whereExtra = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

  const res = await pool.query(
    `SELECT id, platform, alert_type, severity, title, message,
      entity_type, entity_external_id, metric_snapshot, status, created_at
     FROM ads_alerts
     WHERE user_id = $1 AND platform = $2 ${whereExtra}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return res.rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    alert_type: r.alert_type,
    severity: r.severity,
    title: r.title,
    message: r.message,
    entity_type: r.entity_type,
    entity_external_id: r.entity_external_id,
    metric_snapshot: r.metric_snapshot,
    status: r.status,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function persistAlerts(
  userId: number,
  platform: AdsPlatformId,
  candidates: AlertCandidate[]
): Promise<number> {
  let inserted = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const c of candidates) {
    const dup = await pool.query(
      `SELECT 1 FROM ads_alerts
       WHERE user_id = $1 AND platform = $2 AND alert_type = $3
         AND COALESCE(entity_external_id, '') = COALESCE($4, '')
         AND status = 'open'
         AND created_at::date = $5::date
       LIMIT 1`,
      [userId, platform, c.alert_type, c.entity_external_id || null, today]
    );
    if (dup.rows.length) continue;

    await pool.query(
      `INSERT INTO ads_alerts (
        user_id, platform, alert_type, severity, title, message,
        entity_type, entity_external_id, metric_snapshot, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open')`,
      [
        userId,
        platform,
        c.alert_type,
        c.severity,
        c.title,
        c.message,
        c.entity_type || null,
        c.entity_external_id || null,
        c.metric_snapshot ? JSON.stringify(c.metric_snapshot) : null,
      ]
    );
    inserted++;
  }

  return inserted;
}

export async function resolveAlert(userId: number, alertId: number): Promise<boolean> {
  const res = await pool.query(
    `UPDATE ads_alerts SET status = 'resolved', resolved_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'open'
     RETURNING id`,
    [alertId, userId]
  );
  return (res.rowCount || 0) > 0;
}
