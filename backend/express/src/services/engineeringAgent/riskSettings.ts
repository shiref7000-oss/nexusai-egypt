import { pool } from '../../config/db_pg';
import { env } from '../../config/env';

export type EngineeringRiskSettings = {
  allowHighRiskExecution: boolean;
  branchIsolationEnabled: boolean;
};

export async function getEngineeringRiskSettings(): Promise<EngineeringRiskSettings> {
  let allowHighRisk = env.ENGINEERING_ALLOW_HIGH_RISK === 'true';
  try {
    const r = await pool.query(
      `SELECT content FROM agent_memory WHERE scope = 'platform' AND category = 'engineering' AND key = 'engineering_allow_high_risk' LIMIT 1`
    );
    if (r.rows[0]?.content === 'true') allowHighRisk = true;
    if (r.rows[0]?.content === 'false') allowHighRisk = false;
  } catch {
    /* memory optional */
  }
  return {
    allowHighRiskExecution: allowHighRisk,
    branchIsolationEnabled: env.ENGINEERING_BRANCH_ISOLATION !== 'false',
  };
}

export async function setAllowHighRiskExecution(enabled: boolean, updatedBy?: string): Promise<void> {
  const existing = await pool.query(
    `SELECT id FROM agent_memory WHERE scope = 'platform' AND category = 'engineering' AND key = 'engineering_allow_high_risk' LIMIT 1`
  );
  if (existing.rows[0]) {
    await pool.query(`UPDATE agent_memory SET content = $1, updated_at = NOW() WHERE id = $2`, [
      enabled ? 'true' : 'false',
      existing.rows[0].id,
    ]);
  } else {
    await pool.query(
      `INSERT INTO agent_memory (scope, category, key, content, updated_at)
       VALUES ('platform', 'engineering', 'engineering_allow_high_risk', $1, NOW())`,
      [enabled ? 'true' : 'false']
    );
  }
}
