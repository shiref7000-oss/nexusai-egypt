/** Granular phases shown in admin Engineering Agent Monitor */
export const ENGINEERING_PHASES = [
  'pending',
  'planning',
  'searching_code',
  'reading_files',
  'generating_plan',
  'generating_patches',
  'writing_files',
  'running_build',
  'running_tests',
  'verification',
  'verification_execution',
  'evidence_collection',
  'verification_completed',
  'browser_validation',
  'verification_failed',
  'post_deploy_validation',
  'deployment_ready',
  'review',
  'completed',
  'failed',
] as const;

export type EngineeringPhase = (typeof ENGINEERING_PHASES)[number];

const PROGRESS_MAP: Record<EngineeringPhase, number> = {
  pending: 0,
  planning: 8,
  searching_code: 18,
  reading_files: 30,
  generating_plan: 42,
  generating_patches: 52,
  writing_files: 62,
  running_build: 75,
  running_tests: 85,
  verification: 58,
  verification_execution: 65,
  evidence_collection: 78,
  verification_completed: 95,
  browser_validation: 72,
  verification_failed: 75,
  post_deploy_validation: 94,
  deployment_ready: 96,
  review: 92,
  completed: 100,
  failed: 100,
};

export function progressForPhase(phase: EngineeringPhase): number {
  return PROGRESS_MAP[phase] ?? 0;
}

export function phaseLabel(phase: string): string {
  return phase
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
