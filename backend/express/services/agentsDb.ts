import { pool } from '../config/db_pg';
import { logger } from '../config/logger';

export type AgentConfigRow = {
  id: number;
  agent_id: string;
  agent_name: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  capabilities: string[];
  user_id: number;
  updated_at: string;
};

export type AgentActivityRow = {
  id: number;
  agent_id: string;
  agent_name: string;
  action: string;
  status: string;
  created_at: string;
  details?: string | null;
};

const DEFAULT_AGENTS: Omit<AgentConfigRow, 'id' | 'user_id' | 'updated_at'>[] = [
  { agent_id: 'ceo', agent_name: 'CEO Agent', is_active: true, capabilities: ['Market analysis', 'Competitor tracking', 'P&L forecasting'], settings: {} },
  { agent_id: 'ads', agent_name: 'AI Ads Engine', is_active: true, capabilities: ['Franco-Arabic copy', 'Audience targeting', 'A/B testing'], settings: {} },
  { agent_id: 'meta', agent_name: 'Meta Ads Live', is_active: true, capabilities: ['Live CPA tracking', 'ROAS monitoring', 'CTR analysis'], settings: {} },
  { agent_id: 'moderator', agent_name: 'Moderator AI', is_active: true, capabilities: ['Egyptian dialect', 'Order inquiries', 'Complaint handling'], settings: {} },
  { agent_id: 'support', agent_name: 'AI Support', is_active: false, capabilities: ['Return processing', 'Refund approval', 'Dispute resolution'], settings: {} },
  { agent_id: 'product', agent_name: 'Product Hunter', is_active: true, capabilities: ['Trend analysis', 'Margin calculation', 'Supplier scouting'], settings: {} },
  { agent_id: 'finance', agent_name: 'Finance Agent', is_active: true, capabilities: ['P&L tracking', 'VAT calculation', 'Cash flow analysis'], settings: {} },
  { agent_id: 'shipping', agent_name: 'Shipping Agent', is_active: true, capabilities: ['Multi-carrier tracking', 'COD reconciliation', 'Delivery optimization'], settings: {} },
  { agent_id: 'hr', agent_name: 'HR & Team Agent', is_active: false, capabilities: ['Payroll tracking', 'Attendance monitoring', 'Performance reviews'], settings: {} },
  { agent_id: 'confirmation', agent_name: 'Order Confirmation', is_active: true, capabilities: ['WhatsApp confirmation', 'COD validation'], settings: {} },
];

export async function ensureDefaultAgentConfigs(userId: number): Promise<AgentConfigRow[]> {
  const existing = await pool.query(
    `SELECT id, agent_id, agent_name, is_active, settings, capabilities, user_id, updated_at
     FROM agent_configs WHERE user_id = $1 ORDER BY agent_name`,
    [userId],
  );
  if (existing.rows.length > 0) {
    return existing.rows.map(mapConfigRow);
  }

  for (const a of DEFAULT_AGENTS) {
    await pool.query(
      `INSERT INTO agent_configs (user_id, agent_id, agent_name, is_active, settings, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, agent_id) DO NOTHING`,
      [userId, a.agent_id, a.agent_name, a.is_active, JSON.stringify(a.settings), a.capabilities],
    );
  }

  const seeded = await pool.query(
    `SELECT id, agent_id, agent_name, is_active, settings, capabilities, user_id, updated_at
     FROM agent_configs WHERE user_id = $1 ORDER BY agent_name`,
    [userId],
  );
  logger.info('Seeded default agent configs', { userId, count: seeded.rows.length });
  return seeded.rows.map(mapConfigRow);
}

function mapConfigRow(row: Record<string, unknown>): AgentConfigRow {
  return {
    id: Number(row.id),
    agent_id: String(row.agent_id),
    agent_name: String(row.agent_name),
    is_active: Boolean(row.is_active),
    settings: (row.settings as Record<string, unknown>) || {},
    capabilities: (row.capabilities as string[]) || [],
    user_id: Number(row.user_id),
    updated_at: new Date(row.updated_at as string).toISOString(),
  };
}

export async function listAgentConfigs(userId: number): Promise<AgentConfigRow[]> {
  return ensureDefaultAgentConfigs(userId);
}

export async function updateAgentConfig(
  userId: number,
  agentId: string,
  patch: { is_active?: boolean; settings?: Record<string, unknown> },
): Promise<AgentConfigRow | null> {
  await ensureDefaultAgentConfigs(userId);
  const cur = await pool.query(
    `SELECT id FROM agent_configs WHERE user_id = $1 AND agent_id = $2`,
    [userId, agentId],
  );
  if (!cur.rows[0]) return null;

  if (patch.is_active !== undefined) {
    await pool.query(
      `UPDATE agent_configs SET is_active = $1, updated_at = NOW() WHERE user_id = $2 AND agent_id = $3`,
      [patch.is_active, userId, agentId],
    );
  }
  if (patch.settings) {
    await pool.query(
      `UPDATE agent_configs SET settings = settings || $1::jsonb, updated_at = NOW() WHERE user_id = $2 AND agent_id = $3`,
      [JSON.stringify(patch.settings), userId, agentId],
    );
  }

  const r = await pool.query(
    `SELECT id, agent_id, agent_name, is_active, settings, capabilities, user_id, updated_at
     FROM agent_configs WHERE user_id = $1 AND agent_id = $2`,
    [userId, agentId],
  );
  return r.rows[0] ? mapConfigRow(r.rows[0]) : null;
}

export async function toggleAgentConfig(userId: number, agentId: string): Promise<AgentConfigRow | null> {
  await ensureDefaultAgentConfigs(userId);
  const r = await pool.query(
    `UPDATE agent_configs SET is_active = NOT is_active, updated_at = NOW()
     WHERE user_id = $1 AND agent_id = $2
     RETURNING id, agent_id, agent_name, is_active, settings, capabilities, user_id, updated_at`,
    [userId, agentId],
  );
  return r.rows[0] ? mapConfigRow(r.rows[0]) : null;
}

export async function recordAgentActivity(input: {
  userId: number;
  agentId: string;
  agentName: string;
  action: string;
  status?: 'success' | 'warning' | 'error';
  details?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO agent_activities (user_id, agent_id, agent_name, action, status, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.userId,
      input.agentId,
      input.agentName,
      input.action,
      input.status || 'success',
      input.details || null,
    ],
  );
}

export async function listAgentActivities(userId: number, limit = 50): Promise<AgentActivityRow[]> {
  const r = await pool.query(
    `SELECT id, agent_id, agent_name, action, status, created_at, details
     FROM agent_activities WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    agent_id: String(row.agent_id),
    agent_name: String(row.agent_name),
    action: String(row.action),
    status: String(row.status),
    created_at: new Date(row.created_at).toISOString(),
    details: row.details,
  }));
}

/** API shape for frontend */
export function toApiAgentConfig(row: AgentConfigRow) {
  return {
    id: String(row.id),
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    is_active: row.is_active,
    capabilities: row.capabilities,
    settings: row.settings,
    updated_at: row.updated_at,
  };
}

export function toApiActivity(row: AgentActivityRow) {
  return {
    id: String(row.id),
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    action: row.action,
    status: row.status,
    created_at: row.created_at,
  };
}
