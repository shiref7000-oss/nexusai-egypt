import { pool } from '../../config/db_pg';

export type DeploymentRow = {
  id: string;
  task_id: string;
  status: string;
  deploy_stage: string | null;
  started_by_user_id: number | null;
  started_by_email: string;
  backup_id: string | null;
  health_checks: unknown;
  commands_log: unknown;
  error_message: string | null;
  rollback_of_deployment_id: string | null;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
  task_title?: string;
  task_status?: string;
  task_build_status?: string | null;
};

export async function setTaskDeployStage(taskId: string, stage: string | null): Promise<void> {
  await pool.query(`UPDATE agent_tasks SET deploy_stage = $2, updated_at = NOW() WHERE id = $1`, [
    taskId,
    stage,
  ]);
}

export async function getTaskForDeploy(taskId: string) {
  const r = await pool.query(
    `SELECT id, user_id, title, status, build_status, deploy_stage, repo_root
     FROM agent_tasks WHERE id = $1`,
    [taskId]
  );
  return r.rows[0] || null;
}

export async function createBackupRecord(input: {
  taskId: string;
  deploymentId?: string;
  stamp: string;
  appBackupPath: string | null;
  dbBackupPath: string | null;
  metadata: Record<string, unknown>;
  createdByUserId: number | null;
  createdByEmail: string;
}): Promise<string> {
  const r = await pool.query(
    `INSERT INTO engineering_backups
       (task_id, deployment_id, stamp, app_backup_path, db_backup_path, metadata, created_by_user_id, created_by_email)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING id`,
    [
      input.taskId,
      input.deploymentId || null,
      input.stamp,
      input.appBackupPath,
      input.dbBackupPath,
      JSON.stringify(input.metadata),
      input.createdByUserId,
      input.createdByEmail,
    ]
  );
  return r.rows[0].id as string;
}

export async function createDeployment(input: {
  id: string;
  taskId: string;
  startedByUserId: number | null;
  startedByEmail: string;
  deployStage: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO engineering_deployments
       (id, task_id, status, deploy_stage, started_by_user_id, started_by_email)
     VALUES ($1, $2, 'running', $3, $4, $5)`,
    [input.id, input.taskId, input.deployStage, input.startedByUserId, input.startedByEmail]
  );
}

export async function updateDeployment(
  id: string,
  patch: {
    status?: string;
    backupId?: string;
    healthChecks?: unknown[];
    commandsLog?: unknown[];
    errorMessage?: string | null;
    completedAt?: Date;
  }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.backupId !== undefined) {
    params.push(patch.backupId);
    sets.push(`backup_id = $${params.length}`);
  }
  if (patch.healthChecks !== undefined) {
    params.push(JSON.stringify(patch.healthChecks));
    sets.push(`health_checks = $${params.length}::jsonb`);
  }
  if (patch.commandsLog !== undefined) {
    params.push(JSON.stringify(patch.commandsLog));
    sets.push(`commands_log = $${params.length}::jsonb`);
  }
  if (patch.errorMessage !== undefined) {
    params.push(patch.errorMessage);
    sets.push(`error_message = $${params.length}`);
  }
  if (patch.completedAt !== undefined) {
    params.push(patch.completedAt);
    sets.push(`completed_at = $${params.length}`);
  }
  if (!sets.length) return;
  await pool.query(`UPDATE engineering_deployments SET ${sets.join(', ')} WHERE id = $1`, params);
}

export async function appendDeploymentLog(
  deploymentId: string,
  level: string,
  message: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO engineering_deployment_logs (deployment_id, level, message, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [deploymentId, level, message, payload ? JSON.stringify(payload) : null]
  );
}

export async function listDeployments(limit = 50, offset = 0): Promise<DeploymentRow[]> {
  const r = await pool.query(
    `SELECT d.*, t.title AS task_title, t.status AS task_status, t.build_status AS task_build_status
     FROM engineering_deployments d
     JOIN agent_tasks t ON t.id = d.task_id
     ORDER BY d.started_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return r.rows;
}

export async function getDeployment(id: string): Promise<DeploymentRow | null> {
  const r = await pool.query(
    `SELECT d.*, t.title AS task_title, t.status AS task_status, t.build_status AS task_build_status
     FROM engineering_deployments d
     JOIN agent_tasks t ON t.id = d.task_id
     WHERE d.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

export async function getDeploymentLogs(deploymentId: string) {
  const r = await pool.query(
    `SELECT id, level, message, payload, created_at
     FROM engineering_deployment_logs
     WHERE deployment_id = $1
     ORDER BY created_at ASC`,
    [deploymentId]
  );
  return r.rows;
}

export async function getBackup(id: string) {
  const r = await pool.query(`SELECT * FROM engineering_backups WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

export async function getLatestRunningDeployment(): Promise<DeploymentRow | null> {
  const r = await pool.query(
    `SELECT d.*, t.title AS task_title, t.status AS task_status, t.build_status AS task_build_status
     FROM engineering_deployments d
     JOIN agent_tasks t ON t.id = d.task_id
     WHERE d.status = 'running'
     ORDER BY d.started_at DESC
     LIMIT 1`
  );
  return r.rows[0] || null;
}

export async function linkBackupToDeployment(backupId: string, deploymentId: string): Promise<void> {
  await pool.query(`UPDATE engineering_backups SET deployment_id = $2 WHERE id = $1`, [
    backupId,
    deploymentId,
  ]);
}
