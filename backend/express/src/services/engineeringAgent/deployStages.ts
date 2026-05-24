/** Deployment pipeline stages (admin-controlled production deploy). */
export const DEPLOY_STAGES = [
  'build',
  'verification',
  'browser_validation',
  'ready_for_deploy',
  'deploying',
  'post_deploy_validation',
  'deployed',
  'deploy_failed',
] as const;

export type DeployStage = (typeof DEPLOY_STAGES)[number];

export function deployStageLabel(stage: string | null | undefined): string {
  switch (stage) {
    case 'build':
      return 'Build';
    case 'verification':
      return 'Verification';
    case 'ready_for_deploy':
      return 'Ready For Deploy';
    case 'deploying':
      return 'Deploying';
    case 'deployed':
      return 'Deployed';
    case 'deploy_failed':
      return 'Deploy Failed';
    default:
      return stage ? String(stage) : '—';
  }
}

export function canDeployToProduction(task: {
  status: string;
  build_status?: string | null;
  deploy_stage?: string | null;
  verification_status?: string | null;
}): boolean {
  return (
    task.status === 'completed' &&
    task.build_status === 'passed' &&
    task.verification_status === 'passed' &&
    task.deploy_stage === 'ready_for_deploy'
  );
}

export function deployStageAfterTaskComplete(buildPassed: boolean): DeployStage | null {
  if (!buildPassed) return null;
  return 'ready_for_deploy';
}
