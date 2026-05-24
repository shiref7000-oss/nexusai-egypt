export type RiskLevel = 'low' | 'medium' | 'high';

const HIGH_RISK_PATTERNS: RegExp[] = [
  /runner\.ts$/i,
  /taskMonitor\.ts$/i,
  /phases\.ts$/i,
  /deploymentService\.ts$/i,
  /deploymentDb\.ts$/i,
  /auth\.ts$/i,
  /middleware\/auth/i,
  /runMigrations\.ts$/i,
  /db_pg\.ts$/i,
  /server\.ts$/i,
];

const LOW_RISK_PATTERNS: RegExp[] = [
  /^docs\//i,
  /\.md$/i,
  /\/test\//i,
  /\.test\./i,
  /\.spec\./i,
  /__tests__\//i,
];

export function classifyFileRisk(filePath: string): RiskLevel {
  const p = filePath.replace(/\\/g, '/');
  if (HIGH_RISK_PATTERNS.some((re) => re.test(p))) return 'high';
  if (LOW_RISK_PATTERNS.some((re) => re.test(p))) return 'low';
  if (/\/pages\//i.test(p) || /\/routes\//i.test(p) || /\/services\//i.test(p)) return 'medium';
  return 'medium';
}

export function aggregatePlanRisk(paths: string[]): {
  level: RiskLevel;
  highRiskFiles: string[];
  requiresApproval: boolean;
  estimatedRiskScore: number;
} {
  const levels = paths.map(classifyFileRisk);
  const highRiskFiles = paths.filter((p, i) => levels[i] === 'high');
  let score = 0;
  for (const l of levels) {
    if (l === 'high') score += 35;
    else if (l === 'medium') score += 15;
    else score += 5;
  }
  score = Math.min(100, score);
  const level: RiskLevel = highRiskFiles.length > 0 ? 'high' : score > 40 ? 'medium' : 'low';
  return {
    level,
    highRiskFiles,
    requiresApproval: highRiskFiles.length > 0,
    estimatedRiskScore: score,
  };
}

export const FAILURE_MEMORY_HIGH_RISK = new Set([
  'backend/express/src/services/engineeringAgent/runner.ts',
  'backend/express/src/services/engineeringAgent/taskMonitor.ts',
  'backend/express/src/services/engineeringAgent/phases.ts',
]);

export function requiresElevatedVerification(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return [...FAILURE_MEMORY_HIGH_RISK].some((f) => norm.endsWith(f.replace(/^backend\/express\/src\//, '')) || norm.includes(f));
}
