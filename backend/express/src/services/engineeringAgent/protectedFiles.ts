import { classifyFileRisk, FAILURE_MEMORY_HIGH_RISK } from './fileRisk';

const INFRA_PATH_PATTERNS = [
  /services\/engineeringAgent\//i,
  /routes\/engineeringAgent/i,
  /routes\/adminEngineeringAgent/i,
  /EngineeringAgent/i,
  /engineering_agent/i,
  /034_engineering_agent_pipeline/i,
];

const PROTECTED_PATTERNS: RegExp[] = [
  /\/db\/migrations\/\d+_/i,
  /middleware\/auth/i,
  /config\/env\.ts$/i,
  /deploy\//i,
  /nginx/i,
  /docker-compose/i,
  /engineeringAgent\/phases\.ts$/i,
  /engineeringAgent\/pipelinePhases\.ts$/i,
];

export function taskTargetsEngineeringInfra(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return (
    /engineering\s*agent/i.test(p) ||
    /developer\s*agent/i.test(p) ||
    /agent_task/i.test(p) ||
    /execution\s*pipeline/i.test(p) ||
    /task\s*monitor/i.test(p) ||
    /verification\s*pipeline/i.test(p) ||
    /admin\/engineering-agent/i.test(p)
  );
}

export function isProtectedFile(filePath: string, allowEngineeringInfra: boolean): boolean {
  const norm = filePath.replace(/\\/g, '/');
  if (allowEngineeringInfra && INFRA_PATH_PATTERNS.some((re) => re.test(norm))) {
    return false;
  }
  for (const p of FAILURE_MEMORY_HIGH_RISK) {
    const needle = p.replace(/^backend\/express\/src\//, '');
    if (norm.includes(needle) || norm.endsWith(p)) return true;
  }
  return PROTECTED_PATTERNS.some((re) => re.test(norm));
}

export function filterApprovedFileWrites(
  files: Array<{ path: string; action: 'create' | 'modify'; description: string }>,
  approvedPaths: Set<string>,
  allowEngineeringInfra: boolean
): {
  allowed: Array<{ path: string; action: 'create' | 'modify'; description: string }>;
  blocked: Array<{ path: string; reason: string }>;
} {
  const allowed: typeof files = [];
  const blocked: Array<{ path: string; reason: string }> = [];

  for (const f of files) {
    const norm = f.path.replace(/\\/g, '/');
    if (isProtectedFile(norm, allowEngineeringInfra)) {
      blocked.push({
        path: norm,
        reason: 'Protected path — task does not target Engineering Agent infrastructure',
      });
      continue;
    }
    if (approvedPaths.size > 0 && !approvedPaths.has(norm)) {
      blocked.push({
        path: norm,
        reason: 'Not in impact-approved file list (scope control)',
      });
      continue;
    }
    const risk = classifyFileRisk(norm);
    if (risk === 'high' && !allowEngineeringInfra) {
      blocked.push({ path: norm, reason: 'High-risk file requires explicit Engineering Agent infra task' });
      continue;
    }
    allowed.push(f);
  }
  return { allowed, blocked };
}
