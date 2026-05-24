/** Phase 4 execution + deploy pipeline stages shown in admin UI */
export const VERIFICATION_EXECUTION_PHASES = [
  'pending',
  'planning',
  'implementation',
  'build',
  'verification',
  'browser_validation',
  'verification_failed',
  'ready_for_deploy',
  'deploying',
  'post_deploy_validation',
  'completed',
  'failed',
  'review',
] as const;

export type VerificationExecutionPhase = (typeof VERIFICATION_EXECUTION_PHASES)[number];

export const VERIFICATION_STATUSES = ['pending', 'passed', 'failed', 'skipped'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export function verificationPhaseLabel(phase: string): string {
  return phase
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const PROGRESS_MAP_V4: Record<string, number> = {
  pending: 0,
  planning: 5,
  implementation: 25,
  build: 45,
  verification: 58,
  browser_validation: 72,
  verification_failed: 75,
  ready_for_deploy: 80,
  deploying: 88,
  post_deploy_validation: 94,
  completed: 100,
  failed: 100,
  review: 92,
};
