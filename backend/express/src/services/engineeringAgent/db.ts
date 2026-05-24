import { pool } from '../../config/db_pg';

export type AgentTaskStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'review'
  | 'completed'
  | 'failed'
  | 'verification_failed'
  | 'verification_incomplete';

export type AgentTaskType = 'implementation' | 'verification' | 'deployment' | 'audit';
export type AgentExecutionMode = 'implementation' | 'verification';

export interface AgentTaskRow {
  id: string;
  user_id: number;
  title: string;
  prompt: string;
  task_type?: string;
  execution_mode?: string;
  status: AgentTaskStatus;
  plan_json: unknown;
  result_report: string | null;
  error_message: string | null;
  repo_root: string | null;
  files_touched: string[] | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function createTask(
  userId: number,
  input: {
    title: string;
    prompt: string;
    repoRoot: string;
    taskType?: string;
    executionMode?: string;
  }
): Promise<AgentTaskRow> {
  const { detectTaskIntent } = await import('./taskIntent');
  const intent = detectTaskIntent(input.prompt);
  const taskType = input.taskType || intent.taskType;
  const executionMode = input.executionMode || intent.executionMode;
  const r = await pool.query(
    `INSERT INTO agent_tasks (user_id, title, prompt, status, repo_root, task_type, execution_mode)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6)
     RETURNING *`,
    [userId, input.title.slice(0, 500), input.prompt, input.repoRoot, taskType, executionMode]
  );
  const task = r.rows[0] as AgentTaskRow;
  const { ensureSessionForTask, insertSessionMessage } = await import('./taskSession');
  const session = await ensureSessionForTask(task.id, userId);
  await insertSessionMessage({
    sessionId: session.id,
    role: 'user',
    content: input.prompt,
    metadata: { type: 'initial_prompt', title: input.title },
  });
  return task;
}

export async function getTaskById(taskId: string): Promise<AgentTaskRow | null> {
  const r = await pool.query('SELECT * FROM agent_tasks WHERE id = $1', [taskId]);
  return r.rows[0] || null;
}

export async function getTask(taskId: string, userId: number): Promise<AgentTaskRow | null> {
  const r = await pool.query('SELECT * FROM agent_tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
  return r.rows[0] || null;
}

export async function listTasks(userId: number, limit = 50): Promise<AgentTaskRow[]> {
  const r = await pool.query(
    `SELECT * FROM agent_tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

export async function updateTask(
  taskId: string,
  userId: number,
  patch: Partial<{
    status: AgentTaskStatus;
    planJson: unknown;
    resultReport: string;
    errorMessage: string | null;
    filesTouched: string[];
    startedAt: Date;
    completedAt: Date | null;
  }>
): Promise<AgentTaskRow | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [taskId, userId];
  if (patch.status) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.planJson !== undefined) {
    params.push(JSON.stringify(patch.planJson));
    sets.push(`plan_json = $${params.length}::jsonb`);
  }
  if (patch.resultReport !== undefined) {
    params.push(patch.resultReport);
    sets.push(`result_report = $${params.length}`);
  }
  if (patch.errorMessage !== undefined) {
    params.push(patch.errorMessage);
    sets.push(`error_message = $${params.length}`);
  }
  if (patch.filesTouched) {
    params.push(patch.filesTouched);
    sets.push(`files_touched = $${params.length}`);
  }
  if (patch.startedAt) {
    params.push(patch.startedAt);
    sets.push(`started_at = $${params.length}`);
  }
  if (patch.completedAt !== undefined) {
    params.push(patch.completedAt);
    sets.push(`completed_at = $${params.length}`);
  }
  const r = await pool.query(
    `UPDATE agent_tasks SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

export async function appendTaskLog(
  taskId: string,
  event: { level?: string; eventType: string; message?: string; payload?: unknown }
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_task_logs (task_id, level, event_type, message, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      taskId,
      event.level || 'info',
      event.eventType,
      event.message || null,
      event.payload ? JSON.stringify(event.payload) : null,
    ]
  );
}

export async function listTaskLogs(taskId: string, limit = 200) {
  const r = await pool.query(
    `SELECT id, level, event_type, message, payload, created_at
     FROM agent_task_logs WHERE task_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [taskId, limit]
  );
  return r.rows;
}

/** Incremental activity poll — avoids loading full log history. */
export async function listTaskLogsSince(
  taskId: string,
  since: Date,
  limit = 100
) {
  const r = await pool.query(
    `SELECT id, level, event_type, message, payload, created_at
     FROM agent_task_logs
     WHERE task_id = $1 AND created_at > $2
     ORDER BY created_at ASC
     LIMIT $3`,
    [taskId, since, limit]
  );
  return r.rows;
}

export async function listMemory(scope: 'platform' | 'user' | 'project', userId?: number) {
  const r = await pool.query(
    `SELECT id, scope, category, key, content, metadata, updated_at
     FROM agent_memory WHERE scope = $1 AND (user_id IS NOT DISTINCT FROM $2)
     ORDER BY category, key`,
    [scope, userId ?? null]
  );
  return r.rows;
}

export async function upsertMemory(input: {
  scope: 'platform' | 'user' | 'project';
  userId?: number;
  category: string;
  key: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const metadataJson = JSON.stringify(input.metadata || {});

  // Partial unique indexes from 026_engineering_agent.sql — ON CONFLICT must match them exactly.
  if (input.scope === 'platform') {
    const r = await pool.query(
      `INSERT INTO agent_memory (scope, user_id, category, key, content, metadata)
       VALUES ('platform', NULL, $1, $2, $3, $4::jsonb)
       ON CONFLICT (category, key) WHERE scope = 'platform'
       DO UPDATE SET content = EXCLUDED.content, metadata = EXCLUDED.metadata, updated_at = NOW()
       RETURNING *`,
      [input.category, input.key, input.content, metadataJson]
    );
    return r.rows[0];
  }

  if (input.userId != null) {
    const r = await pool.query(
      `INSERT INTO agent_memory (scope, user_id, category, key, content, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (scope, user_id, category, key) WHERE user_id IS NOT NULL
       DO UPDATE SET content = EXCLUDED.content, metadata = EXCLUDED.metadata, updated_at = NOW()
       RETURNING *`,
      [
        input.scope,
        input.userId,
        input.category,
        input.key,
        input.content,
        metadataJson,
      ]
    );
    return r.rows[0];
  }

  const existing = await pool.query(
    `SELECT id FROM agent_memory
     WHERE scope = $1 AND user_id IS NULL AND category = $2 AND key = $3
     LIMIT 1`,
    [input.scope, input.category, input.key]
  );
  if (existing.rows[0]) {
    const r = await pool.query(
      `UPDATE agent_memory SET content = $2, metadata = $3::jsonb, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [existing.rows[0].id, input.content, metadataJson]
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO agent_memory (scope, user_id, category, key, content, metadata)
     VALUES ($1, NULL, $2, $3, $4, $5::jsonb) RETURNING *`,
    [input.scope, input.category, input.key, input.content, metadataJson]
  );
  return r.rows[0];
}

export async function seedPlatformMemory(): Promise<void> {
  const seeds = [
    { category: 'architecture', key: 'frontend', content: 'React + Vite SPA in saas-frontend/. Routing via react-router. API clients in src/lib/*Api.ts.' },
    {
      category: 'architecture',
      key: 'backend',
      content:
        'Express API in backend/express/ when present (src/). Build: cd backend/express && npm run build. Do not use npm --workspace unless root package.json defines workspaces.',
    },
    { category: 'architecture', key: 'queues', content: 'BullMQ workers in services/queue.ts for async jobs.' },
    { category: 'architecture', key: 'database', content: 'PostgreSQL with numbered migrations in db/migrations/. schema_migrations tracks applied files.' },
    { category: 'module', key: 'whatsapp', content: 'WhatsApp Cloud API integration: routes/whatsapp.ts, services/whatsapp/, per-tenant connections.' },
    { category: 'module', key: 'tiktok', content: 'TikTok Ads: routes/tiktokAds.ts, services/adsPlatforms/tiktok/.' },
    { category: 'module', key: 'cost_analyzer', content: 'AI Cost Analyzer: routes/costAnalyzer.ts, services/costAnalyzer/, frontend CostAnalyzer.tsx.' },
    { category: 'standards', key: 'typescript', content: 'Strict TypeScript. Match existing patterns. Minimal diffs. No over-abstraction.' },
    { category: 'standards', key: 'auth', content: 'JWT authenticate middleware. pgUserId from users table. Admin routes use requireRole(admin, superadmin).' },
    {
      category: 'operating_rules',
      key: 'always',
      content:
        'Search code_index first; read only relevant files; reuse patterns; prefer editing existing modules; strict TypeScript; run build after modifications; generate markdown report.',
    },
    {
      category: 'operating_rules',
      key: 'never',
      content:
        'No secrets; no modifying deployed migrations; no deploy; no git push/commits; no deleting core infrastructure (server, nginx, deploy, locks).',
    },
    {
      category: 'operating_rules',
      key: 'workflow',
      content: 'search → select files → read → plan → modify → build → fix errors → markdown report.',
    },
  ];
  for (const s of seeds) {
    await upsertMemory({ scope: 'platform', category: s.category, key: s.key, content: s.content });
  }
  const { seedBusinessMemory } = await import('./businessMemory');
  await seedBusinessMemory().catch(() => undefined);
}
