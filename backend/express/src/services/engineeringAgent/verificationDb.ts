import crypto from 'crypto';
import { pool } from '../../config/db_pg';

export type VerificationRow = {
  id: string;
  task_id: string;
  check_type: string;
  name: string;
  status: string;
  message: string | null;
  evidence: Record<string, unknown>;
  started_at: Date;
  completed_at: Date | null;
};

export type ArtifactRow = {
  id: string;
  task_id: string;
  artifact_type: string;
  label: string | null;
  file_path: string;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export async function setTaskVerificationStatus(
  taskId: string,
  status: string,
  summary: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `UPDATE agent_tasks SET verification_status = $2, verification_summary = $3::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [taskId, status, JSON.stringify(summary)]
  );
}

export async function insertVerificationCheck(input: {
  taskId: string;
  checkType: string;
  name: string;
  status: string;
  message?: string | null;
  evidence?: Record<string, unknown>;
}): Promise<string> {
  const id = crypto.randomUUID();
  const r = await pool.query(
    `INSERT INTO agent_task_verifications (id, task_id, check_type, name, status, message, evidence, completed_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     RETURNING id`,
    [
      id,
      input.taskId,
      input.checkType,
      input.name,
      input.status,
      input.message || null,
      JSON.stringify(input.evidence || {}),
    ]
  );
  return r.rows[0].id as string;
}

export async function insertArtifact(input: {
  taskId: string;
  artifactType: string;
  label: string;
  filePath: string;
  url?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const id = crypto.randomUUID();
  const r = await pool.query(
    `INSERT INTO agent_task_artifacts (id, task_id, artifact_type, label, file_path, url, metadata)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      id,
      input.taskId,
      input.artifactType,
      input.label,
      input.filePath,
      input.url || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
  return r.rows[0].id as string;
}

export async function listVerifications(taskId: string): Promise<VerificationRow[]> {
  const r = await pool.query(
    `SELECT * FROM agent_task_verifications WHERE task_id = $1 ORDER BY started_at ASC`,
    [taskId]
  );
  return r.rows;
}

export async function listArtifacts(taskId: string): Promise<ArtifactRow[]> {
  const r = await pool.query(
    `SELECT * FROM agent_task_artifacts WHERE task_id = $1 ORDER BY created_at ASC`,
    [taskId]
  );
  return r.rows;
}

export async function getEnabledRegressionRules(): Promise<
  Array<{ name: string; targets: unknown[] }>
> {
  const r = await pool.query(
    `SELECT name, targets FROM engineering_verification_rules WHERE enabled = true ORDER BY id`
  );
  return r.rows.map((row) => ({
    name: row.name as string,
    targets: (row.targets as unknown[]) || [],
  }));
}
