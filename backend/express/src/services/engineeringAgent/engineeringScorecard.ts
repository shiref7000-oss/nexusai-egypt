import { pool } from '../../config/db_pg';

export async function getEngineeringScorecard() {
  const r = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status IN ('failed','verification_failed'))::int AS failed,
      COUNT(*) FILTER (WHERE build_status = 'passed')::int AS builds_passed,
      COUNT(*) FILTER (WHERE build_status IN ('passed','failed'))::int AS builds_total,
      COUNT(*) FILTER (WHERE verification_status = 'passed')::int AS verify_passed,
      COUNT(*) FILTER (WHERE verification_status IN ('passed','failed'))::int AS verify_total,
      COUNT(*) FILTER (WHERE deployment_blocked = true)::int AS deployment_blocked,
      COALESCE(AVG(confidence_score), 0)::numeric(5,2) AS avg_confidence
    FROM agent_tasks
    WHERE created_at >= NOW() - INTERVAL '30 days'
  `);
  const row = r.rows[0] || {};
  const total = Number(row.total || 0);
  const completed = Number(row.completed || 0);
  const buildsTotal = Number(row.builds_total || 0);
  const verifyTotal = Number(row.verify_total || 0);

  return {
    taskSuccessRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : null,
    buildPassRate:
      buildsTotal > 0 ? Math.round((Number(row.builds_passed) / buildsTotal) * 1000) / 10 : null,
    verificationPassRate:
      verifyTotal > 0
        ? Math.round((Number(row.verify_passed) / verifyTotal) * 1000) / 10
        : null,
    deploymentBlockedCount: Number(row.deployment_blocked || 0),
    avgConfidenceScore: Number(row.avg_confidence || 0),
    periodDays: 30,
  };
}
