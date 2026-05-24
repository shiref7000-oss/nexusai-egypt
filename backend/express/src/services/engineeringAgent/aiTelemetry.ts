import { pool } from '../../config/db_pg';
import type { EngineeringAITask } from './modelRouter';
import type { ModelTier } from './modelRouter';
import type { AIResponse } from '../ai';

export async function recordEngineeringAICall(input: {
  taskId?: string | null;
  userId?: number | null;
  engineeringTask: EngineeringAITask;
  model: string;
  tier: ModelTier;
  provider: string;
  usage?: AIResponse['usage'];
  latencyMs: number;
  rawInputChars: number;
  compressedInputChars: number;
  success: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  const usage = input.usage || {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };

  await pool.query(
    `INSERT INTO engineering_ai_calls (
      task_id, user_id, engineering_task, model, model_tier, provider,
      prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms,
      raw_input_chars, compressed_input_chars, success, error_message
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      input.taskId || null,
      input.userId ?? null,
      input.engineeringTask,
      input.model,
      input.tier,
      input.provider,
      usage.promptTokens,
      usage.completionTokens,
      usage.totalTokens,
      usage.costUsd,
      input.latencyMs,
      input.rawInputChars,
      input.compressedInputChars,
      input.success,
      input.errorMessage || null,
    ]
  );

  if (input.taskId) {
    const { mergeReliabilityJson } = await import('./reliabilityDb');
    await mergeReliabilityJson(input.taskId, {
      lastAiCall: {
        engineeringTask: input.engineeringTask,
        model: input.model,
        tier: input.tier,
        tokens: usage.totalTokens,
        costUsd: usage.costUsd,
        latencyMs: input.latencyMs,
      },
    });
  }
}

export async function getTaskAITelemetrySummary(taskId: string): Promise<{
  calls: number;
  totalTokens: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  flashCalls: number;
  proCalls: number;
  avgCompressionPct: number;
  byTask: Array<{ engineeringTask: string; model: string; tokens: number; costUsd: number }>;
}> {
  const r = await pool.query(
    `SELECT engineering_task, model, model_tier,
            SUM(total_tokens)::int AS tokens,
            SUM(cost_usd)::float AS cost,
            SUM(latency_ms)::int AS latency,
            COUNT(*)::int AS calls,
            AVG(CASE WHEN raw_input_chars > 0
              THEN 100.0 * (1.0 - compressed_input_chars::float / raw_input_chars::float)
              ELSE 0 END) AS avg_compress
     FROM engineering_ai_calls WHERE task_id = $1
     GROUP BY engineering_task, model, model_tier`,
    [taskId]
  );

  const rows = r.rows as Array<{
    engineering_task: string;
    model: string;
    model_tier: string;
    tokens: number;
    cost: number;
    latency: number;
    calls: number;
    avg_compress: number;
  }>;

  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;
  let flashCalls = 0;
  let proCalls = 0;
  let compressSum = 0;

  const byTask = rows.map((row) => {
    totalTokens += row.tokens || 0;
    totalCostUsd += Number(row.cost) || 0;
    totalLatencyMs += row.latency || 0;
    if (row.model_tier === 'flash') flashCalls += row.calls;
    else proCalls += row.calls;
    compressSum += Number(row.avg_compress) || 0;
    return {
      engineeringTask: row.engineering_task,
      model: row.model,
      tokens: row.tokens,
      costUsd: Number(row.cost),
    };
  });

  return {
    calls: flashCalls + proCalls,
    totalTokens,
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    totalLatencyMs,
    flashCalls,
    proCalls,
    avgCompressionPct: rows.length ? Math.round(compressSum / rows.length) : 0,
    byTask,
  };
}

export async function getPlatformAITelemetrySummary(sinceHours = 168): Promise<{
  calls: number;
  totalTokens: number;
  totalCostUsd: number;
  flashCalls: number;
  proCalls: number;
  avgLatencyMs: number;
  avgCompressionPct: number;
}> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS calls,
            COALESCE(SUM(total_tokens),0)::int AS tokens,
            COALESCE(SUM(cost_usd),0)::float AS cost,
            COALESCE(SUM(CASE WHEN model_tier = 'flash' THEN 1 ELSE 0 END),0)::int AS flash_calls,
            COALESCE(SUM(CASE WHEN model_tier = 'pro' THEN 1 ELSE 0 END),0)::int AS pro_calls,
            COALESCE(AVG(latency_ms),0)::int AS avg_latency,
            COALESCE(AVG(CASE WHEN raw_input_chars > 0
              THEN 100.0 * (1.0 - compressed_input_chars::float / raw_input_chars::float)
              ELSE 0 END),0)::float AS avg_compress
     FROM engineering_ai_calls
     WHERE created_at >= NOW() - make_interval(hours => $1::int)`,
    [sinceHours]
  );
  const row = r.rows[0] as {
    calls: number;
    tokens: number;
    cost: number;
    flash_calls: number;
    pro_calls: number;
    avg_latency: number;
    avg_compress: number;
  };
  return {
    calls: row.calls || 0,
    totalTokens: row.tokens || 0,
    totalCostUsd: Math.round((row.cost || 0) * 1_000_000) / 1_000_000,
    flashCalls: row.flash_calls || 0,
    proCalls: row.pro_calls || 0,
    avgLatencyMs: row.avg_latency || 0,
    avgCompressionPct: Math.round(row.avg_compress || 0),
  };
}
