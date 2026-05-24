import { pool } from '../../config/db_pg';
import type { PipelinePhase } from './pipelinePhases';
import { PIPELINE_TO_UI_PHASE, pipelineProgressPercent } from './pipelinePhases';
import { appendTaskLog } from './db';
import type { EngineeringPhase } from './phases';

export type PipelinePhaseArtifact = {
  completedAt: string;
  evidence: string[];
  data: Record<string, unknown>;
};

export type PipelineState = {
  version: 1;
  phases: Partial<Record<PipelinePhase, PipelinePhaseArtifact>>;
  preImplementationComplete?: boolean;
  approvedFilePaths?: string[];
};

export function normalizePipelineState(raw: unknown): PipelineState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, phases: {} };
  }
  const o = raw as Partial<PipelineState>;
  const phases =
    o.phases && typeof o.phases === 'object' && !Array.isArray(o.phases) ? o.phases : {};
  return {
    version: o.version ?? 1,
    phases,
    preImplementationComplete: o.preImplementationComplete,
    approvedFilePaths: o.approvedFilePaths,
  };
}

export async function getPipelineState(taskId: string): Promise<PipelineState> {
  const r = await pool.query(`SELECT pipeline_state FROM agent_tasks WHERE id = $1`, [taskId]);
  return normalizePipelineState(r.rows[0]?.pipeline_state);
}

export async function setPipelinePhase(
  taskId: string,
  userId: number,
  phase: PipelinePhase,
  artifact: {
    evidence: string[];
    data: Record<string, unknown>;
  },
  confidence?: {
    understanding?: number;
    implementation?: number;
    verification?: number;
  }
): Promise<void> {
  const state = await getPipelineState(taskId);
  if (!state.phases || typeof state.phases !== 'object') {
    state.phases = {};
  }
  state.phases[phase] = {
    completedAt: new Date().toISOString(),
    evidence: artifact.evidence,
    data: artifact.data,
  };
  if (phase === 'IMPLEMENTATION_PLAN') {
    state.preImplementationComplete = true;
    const approved = artifact.data.approvedFilePaths;
    if (Array.isArray(approved)) {
      state.approvedFilePaths = approved as string[];
    }
  }

  const uiPhase = PIPELINE_TO_UI_PHASE[phase] as EngineeringPhase;
  const progress = pipelineProgressPercent(phase);

  const sets = [
    'pipeline_phase = $3',
    'pipeline_state = $4::jsonb',
    'current_phase = $5',
    'progress_percent = $6',
    'updated_at = NOW()',
  ];
  const params: unknown[] = [taskId, userId, phase, JSON.stringify(state), uiPhase, progress];

  if (confidence?.understanding != null) {
    params.push(confidence.understanding);
    sets.push(`understanding_confidence = $${params.length}`);
  }
  if (confidence?.implementation != null) {
    params.push(confidence.implementation);
    sets.push(`implementation_confidence = $${params.length}`);
  }
  if (confidence?.verification != null) {
    params.push(confidence.verification);
    sets.push(`verification_confidence_pct = $${params.length}`);
  }

  await pool.query(`UPDATE agent_tasks SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`, params);

  await appendTaskLog(taskId, {
    eventType: 'pipeline_phase',
    message: `${phase} → ${uiPhase}`,
    payload: {
      pipelinePhase: phase,
      progress,
      evidenceCount: artifact.evidence.length,
      confidence,
    },
  });
}

export async function assertPreImplementationComplete(taskId: string): Promise<void> {
  const state = await getPipelineState(taskId);
  if (!state.preImplementationComplete) {
    throw new Error(
      'Pipeline gate: IMPLEMENTATION blocked — phases UNDERSTAND_TASK through IMPLEMENTATION_PLAN must complete first'
    );
  }
  const required: PipelinePhase[] = [
    'UNDERSTAND_TASK',
    'ARCHITECTURE_MAPPING',
    'IMPACT_ANALYSIS',
    'IMPLEMENTATION_PLAN',
  ];
  for (const p of required) {
    if (!state.phases[p]?.completedAt) {
      throw new Error(`Pipeline gate: missing completed phase ${p}`);
    }
  }
}
