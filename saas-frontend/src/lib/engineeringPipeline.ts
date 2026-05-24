/** Mirrors backend pipelinePhases.ts — keep in sync */
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

export const PIPELINE_PHASE_LABELS: Record<(typeof PIPELINE_PHASES)[number], string> = {
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
