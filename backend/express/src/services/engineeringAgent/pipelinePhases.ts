/** Mandatory execution pipeline — phases 1–10 (no code before phase 4 completes). */
export const PIPELINE_PHASES = [
  'UNDERSTAND_TASK',
  'ARCHITECTURE_MAPPING',
  'IMPACT_ANALYSIS',
  'IMPLEMENTATION_PLAN',
  'IMPLEMENTATION',
  'BUILD',
  'VERIFICATION',
  'REGRESSION_TESTING',
  'DEPLOYMENT',
  'EVIDENCE',
] as const;

export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

export const PIPELINE_PHASE_LABELS: Record<PipelinePhase, string> = {
  UNDERSTAND_TASK: 'Understand task',
  ARCHITECTURE_MAPPING: 'Architecture mapping',
  IMPACT_ANALYSIS: 'Impact analysis',
  IMPLEMENTATION_PLAN: 'Implementation plan',
  IMPLEMENTATION: 'Implementation',
  BUILD: 'Build',
  VERIFICATION: 'Verification',
  REGRESSION_TESTING: 'Regression testing',
  DEPLOYMENT: 'Deployment readiness',
  EVIDENCE: 'Evidence',
};

/** Maps pipeline phase → granular UI `current_phase` for progress bar. */
export const PIPELINE_TO_UI_PHASE: Record<PipelinePhase, string> = {
  UNDERSTAND_TASK: 'planning',
  ARCHITECTURE_MAPPING: 'searching_code',
  IMPACT_ANALYSIS: 'generating_plan',
  IMPLEMENTATION_PLAN: 'generating_plan',
  IMPLEMENTATION: 'writing_files',
  BUILD: 'running_build',
  VERIFICATION: 'verification',
  REGRESSION_TESTING: 'verification',
  DEPLOYMENT: 'deployment_ready',
  EVIDENCE: 'evidence_collection',
};

export function pipelineProgressPercent(phase: PipelinePhase): number {
  const idx = PIPELINE_PHASES.indexOf(phase);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / PIPELINE_PHASES.length) * 100);
}

export function isPreImplementationPhase(phase: PipelinePhase): boolean {
  return (
    phase === 'UNDERSTAND_TASK' ||
    phase === 'ARCHITECTURE_MAPPING' ||
    phase === 'IMPACT_ANALYSIS' ||
    phase === 'IMPLEMENTATION_PLAN'
  );
}

export function nextPipelinePhase(phase: PipelinePhase): PipelinePhase | null {
  const i = PIPELINE_PHASES.indexOf(phase);
  return i >= 0 && i < PIPELINE_PHASES.length - 1 ? PIPELINE_PHASES[i + 1]! : null;
}
