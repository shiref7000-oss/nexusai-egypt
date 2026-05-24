import { pool } from '../../config/db_pg';
import { appendTaskLog, listTaskLogs, type AgentTaskRow } from './db';
import { listVerifications } from './verificationDb';

export type SessionRow = {
  id: string;
  task_id: string;
  created_by: number | null;
  status: string;
  session_summary: string | null;
  summary_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type MessageRow = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

const SUMMARY_MESSAGE_THRESHOLD = 24;

export async function ensureSessionForTask(
  taskId: string,
  createdBy?: number | null
): Promise<SessionRow> {
  const existing = await pool.query(`SELECT * FROM agent_task_sessions WHERE task_id = $1`, [taskId]);
  if (existing.rows[0]) return existing.rows[0] as SessionRow;

  const r = await pool.query(
    `INSERT INTO agent_task_sessions (task_id, created_by, status)
     VALUES ($1::uuid, $2, 'active')
     RETURNING *`,
    [taskId, createdBy ?? null]
  );
  await appendTaskLog(taskId, {
    eventType: 'session_created',
    message: 'Task session initialized',
    payload: { sessionId: r.rows[0].id },
  });
  return r.rows[0] as SessionRow;
}

export async function getSessionByTaskId(taskId: string): Promise<SessionRow | null> {
  const r = await pool.query(`SELECT * FROM agent_task_sessions WHERE task_id = $1`, [taskId]);
  return (r.rows[0] as SessionRow) || null;
}

export async function insertSessionMessage(input: {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<MessageRow> {
  const r = await pool.query(
    `INSERT INTO agent_task_messages (session_id, role, content, metadata)
     VALUES ($1::uuid, $2, $3, $4::jsonb)
     RETURNING *`,
    [input.sessionId, input.role, input.content, JSON.stringify(input.metadata || {})]
  );
  await pool.query(
    `UPDATE agent_task_sessions SET updated_at = NOW() WHERE id = $1::uuid`,
    [input.sessionId]
  );
  return r.rows[0] as MessageRow;
}

export async function listSessionMessages(sessionId: string, limit = 200): Promise<MessageRow[]> {
  const r = await pool.query(
    `SELECT * FROM agent_task_messages WHERE session_id = $1::uuid
     ORDER BY created_at ASC LIMIT $2`,
    [sessionId, limit]
  );
  return r.rows as MessageRow[];
}

export async function getSessionConversation(
  taskId: string,
  messageLimit = 120
): Promise<{
  session: SessionRow | null;
  messages: MessageRow[];
}> {
  const session = await getSessionByTaskId(taskId);
  if (!session) return { session: null, messages: [] };
  const messages = await listSessionMessages(session.id, messageLimit);
  return { session, messages };
}

export async function buildSessionContext(task: AgentTaskRow): Promise<string> {
  const session = await ensureSessionForTask(task.id, task.user_id);
  const messages = await listSessionMessages(session.id, 100);
  const logs = await listTaskLogs(task.id, 80);
  const verifications = await listVerifications(task.id);

  const parts: string[] = [
    '## Original task',
    task.prompt,
    '',
    '## Current status',
    `status=${task.status} build=${(task as { build_status?: string }).build_status || 'n/a'} verification=${(task as { verification_status?: string }).verification_status || 'n/a'}`,
    task.error_message ? `error: ${task.error_message}` : '',
    '',
  ];

  if (session.session_summary) {
    parts.push('## Session summary (compressed)', session.session_summary, '');
  }

  if (task.result_report) {
    parts.push('## Latest report (excerpt)', task.result_report.slice(0, 4000), '');
  }

  if (task.files_touched?.length) {
    parts.push('## Files touched', task.files_touched.map((f) => `- ${f}`).join('\n'), '');
  }

  const failedChecks = verifications.filter((v) => v.status === 'failed').map((v) => v.name);
  if (failedChecks.length) {
    parts.push('## Failed verification checks', failedChecks.join(', '), '');
  }

  parts.push('## Recent execution log');
  for (const l of logs.slice(-25)) {
    parts.push(`- [${l.event_type}] ${l.message || ''}`);
  }

  parts.push('## Conversation history');
  for (const m of messages.slice(-30)) {
    parts.push(`${m.role.toUpperCase()}: ${m.content.slice(0, 2000)}`);
  }

  return parts.filter(Boolean).join('\n');
}

export async function maybeCompressSessionSummary(
  sessionId: string,
  task: AgentTaskRow
): Promise<void> {
  const messages = await listSessionMessages(sessionId, 500);
  if (messages.length < SUMMARY_MESSAGE_THRESHOLD) return;

  const { processEngineeringAI } = await import('./engineeringAI');
  const transcript = messages
    .slice(-40)
    .map((m) => `${m.role}: ${m.content.slice(0, 1500)}`)
    .join('\n\n');

  const summaryPrompt = [
    'Compress this engineering task session into a concise summary for the agent.',
    'Include: completed work, findings, files modified, verification results, blockers, next actions.',
    'Max 800 words.',
    '',
    `Task: ${task.prompt.slice(0, 500)}`,
    `Status: ${task.status}`,
    '',
    transcript,
  ].join('\n');

  const res = await processEngineeringAI({
    engineeringTask: 'conversation_compression',
    prompt: summaryPrompt,
    userId: task.user_id,
    taskId: task.id,
    overrides: { plainText: true, maxTokens: 2000 },
  });

  const summary = res.response?.slice(0, 8000) || '';

  await pool.query(
    `UPDATE agent_task_sessions
     SET session_summary = $2, summary_updated_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid`,
    [sessionId, summary]
  );

  await insertSessionMessage({
    sessionId,
    role: 'system',
    content: 'Session context compressed to summary for continued work.',
    metadata: { type: 'context_compression', messageCount: messages.length },
  });
}

export function extractBearerTokenFromMessage(message: string): string | null {
  const jwt = message.match(/\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/);
  return jwt?.[1] || null;
}

export type ContinueAction =
  | 'retry_verification'
  | 'retry_verification_with_token'
  | 'full_retry'
  | 'deploy'
  | 'continue_investigation';

export function detectContinueAction(message: string, task: AgentTaskRow): ContinueAction {
  const m = message.toLowerCase().trim();
  if (extractBearerTokenFromMessage(message) || /\b(admin jwt|admin token|bearer token|use token)\b/i.test(m)) {
    return 'retry_verification_with_token';
  }
  if (/retry verification|re-?verify|rerun verification|verify again|run verification/i.test(m)) {
    return 'retry_verification';
  }
  if (/^retry$/i.test(m) || /\brerun (the )?task\b/i.test(m) || /\bstart over\b/i.test(m)) {
    return 'full_retry';
  }
  if (/\bdeploy\b/i.test(m) && !/\bdo not deploy\b/i.test(m)) {
    return 'deploy';
  }
  return 'continue_investigation';
}
