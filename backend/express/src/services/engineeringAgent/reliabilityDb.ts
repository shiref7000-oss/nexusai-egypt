import { pool } from '../../config/db_pg';

export async function mergeReliabilityJson(
  taskId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `UPDATE agent_tasks
     SET reliability_json = COALESCE(reliability_json, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [taskId, JSON.stringify(patch)]
  );
}

export async function setConfidenceAndBlock(
  taskId: string,
  scores: {
    confidenceScore: number;
    deploymentBlocked: boolean;
  }
): Promise<void> {
  await pool.query(
    `UPDATE agent_tasks
     SET confidence_score = $2,
         deployment_blocked = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [taskId, scores.confidenceScore, scores.deploymentBlocked]
  );
}

export async function recordIncident(input: {
  taskId: string;
  incidentType: string;
  severity: 'low' | 'medium' | 'high';
  summary: string;
  rootCause?: string;
  evidence?: Record<string, unknown>;
  filesInvolved?: string[];
}): Promise<void> {
  await pool.query(
    `INSERT INTO engineering_agent_incidents
       (task_id, incident_type, severity, summary, root_cause, evidence, files_involved)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      input.taskId,
      input.incidentType,
      input.severity,
      input.summary,
      input.rootCause || null,
      JSON.stringify(input.evidence || {}),
      input.filesInvolved || [],
    ]
  );
}

export async function findSimilarIncidents(
  incidentType: string,
  fileFragment: string,
  limit = 5
): Promise<
  Array<{
    id: string;
    summary: string;
    root_cause: string | null;
    resolved: boolean;
    created_at: Date;
  }>
> {
  const r = await pool.query(
    `SELECT id, summary, root_cause, resolved, created_at
     FROM engineering_agent_incidents
     WHERE incident_type = $1
       AND ($2 = '' OR $2 = ANY(files_involved) OR summary ILIKE '%' || $2 || '%')
     ORDER BY created_at DESC
     LIMIT $3`,
    [incidentType, fileFragment, limit]
  );
  return r.rows;
}
