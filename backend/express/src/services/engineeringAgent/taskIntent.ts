export const TASK_TYPES = ['implementation', 'verification', 'deployment', 'audit'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const EXECUTION_MODES = ['implementation', 'verification'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

const VERIFICATION_PATTERNS: RegExp[] = [
  /\bverify\b/i,
  /\bverification\b/i,
  /\baudit\b/i,
  /\binspect\b/i,
  /\bvalidate\b/i,
  /\bbrowser\s*(check|verification|evidence)\b/i,
  /\bproduction\s*(check|validation|verify|inspect)\b/i,
  /\bQA\b/i,
  /\bregression\b/i,
  /\bdeployment\s*validation\b/i,
  /\bconfirm\b.*\b(tabs?|UI|page|production|verification)\b/i,
  /\bcheck\b.*\b(tabs?|DOM|endpoints?|health|screenshots?|bundle)\b/i,
  /\btask\s+details\b/i,
  /\blive\s+(URL|site|deployment)\b/i,
  /\bpost[- ]?deploy\s*validation\b/i,
];

const IMPLEMENTATION_PATTERNS: RegExp[] = [
  /\b(add|create|implement|fix|refactor|patch)\b/i,
  /\b(write|modify|update)\b.*\b(file|code|component|module)\b/i,
  /\bbuild\b.*\b(and|then)\b.*\b(deploy|fix)\b/i,
  /\brun\s+(npm|build|tests?)\b/i,
];

const DEPLOYMENT_PATTERNS: RegExp[] = [
  /\bdeploy\b.*\bproduction\b/i,
  /\bproduction\s+deploy\b/i,
];

export function detectTaskIntent(prompt: string): { taskType: TaskType; executionMode: ExecutionMode } {
  const text = prompt.trim();
  const hasVerify = VERIFICATION_PATTERNS.some((re) => re.test(text));
  const hasImpl = IMPLEMENTATION_PATTERNS.some((re) => re.test(text));
  const hasDeploy = DEPLOYMENT_PATTERNS.some((re) => re.test(text));

  if (hasDeploy && !hasVerify) {
    return { taskType: 'deployment', executionMode: 'implementation' };
  }

  if (/\baudit\b/i.test(text) && hasVerify) {
    return { taskType: 'audit', executionMode: 'verification' };
  }

  if (hasVerify) {
    const startsWithVerify = /^\s*(verify|check|confirm|audit|inspect|validate|browser)\b/i.test(text);
    if (!hasImpl || startsWithVerify) {
      return { taskType: 'verification', executionMode: 'verification' };
    }
  }

  return { taskType: 'implementation', executionMode: 'implementation' };
}

export function isVerificationExecutionMode(prompt: string): boolean {
  return detectTaskIntent(prompt).executionMode === 'verification';
}

export function prefersProductionVerification(prompt: string): boolean {
  return /production|live\s+URL|deployed|nexus-ai\.group|post[- ]?deploy|public\s+URL/i.test(prompt);
}

export function taskTypeLabel(taskType: string): string {
  switch (taskType) {
    case 'verification':
      return 'Verification';
    case 'deployment':
      return 'Deployment';
    case 'audit':
      return 'Audit';
    default:
      return 'Implementation';
  }
}
