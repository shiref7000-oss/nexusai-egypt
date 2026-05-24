/** Per-iteration change budget — enforced before writes */
export const DEFAULT_CHANGE_BUDGET = {
  maxFilesModified: 3,
  maxLinesChanged: 300,
  maxMigrations: 1,
  maxFeatureAreas: 1,
  maxBuildFixAttempts: 2,
  maxFixFilesPerAttempt: 1,
} as const;

export type ChangeBudget = typeof DEFAULT_CHANGE_BUDGET;

export type BudgetUsage = {
  filesModified: number;
  linesChanged: number;
  migrations: number;
  featureAreas: Set<string>;
};

export function createBudgetUsage(): BudgetUsage {
  return { filesModified: 0, linesChanged: 0, migrations: 0, featureAreas: new Set() };
}

export function estimateLinesChanged(before: string, after: string): number {
  if (before === after) return 0;
  const b = before.split('\n').length;
  const a = after.split('\n').length;
  return Math.abs(a - b) + Math.min(b, a);
}

export function featureAreaFromPath(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean);
  if (parts[0] === 'backend' && parts[1]) return `backend/${parts[1]}`;
  if (parts[0] === 'saas-frontend' && parts[1]) return `frontend/${parts[1]}`;
  return parts.slice(0, 2).join('/') || 'root';
}

export function recordFileChange(usage: BudgetUsage, filePath: string, before: string, after: string): void {
  usage.filesModified += 1;
  usage.linesChanged += estimateLinesChanged(before, after);
  if (/\/migrations\/\d+_/.test(filePath)) usage.migrations += 1;
  usage.featureAreas.add(featureAreaFromPath(filePath));
}

export function budgetExceeded(usage: BudgetUsage, budget: ChangeBudget = DEFAULT_CHANGE_BUDGET): string[] {
  const violations: string[] = [];
  if (usage.filesModified > budget.maxFilesModified) {
    violations.push(`files_modified ${usage.filesModified} > ${budget.maxFilesModified}`);
  }
  if (usage.linesChanged > budget.maxLinesChanged) {
    violations.push(`lines_changed ${usage.linesChanged} > ${budget.maxLinesChanged}`);
  }
  if (usage.migrations > budget.maxMigrations) {
    violations.push(`migrations ${usage.migrations} > ${budget.maxMigrations}`);
  }
  if (usage.featureAreas.size > budget.maxFeatureAreas) {
    violations.push(`feature_areas ${usage.featureAreas.size} > ${budget.maxFeatureAreas}`);
  }
  return violations;
}

export function applyBudgetToFileWrites<T extends { path: string }>(
  files: T[],
  budget: ChangeBudget = DEFAULT_CHANGE_BUDGET
): { allowed: T[]; deferred: T[] } {
  const allowed = files.slice(0, budget.maxFilesModified);
  const deferred = files.slice(budget.maxFilesModified);
  return { allowed, deferred };
}

export function budgetUsageSnapshot(usage: BudgetUsage): Record<string, unknown> {
  return {
    filesModified: usage.filesModified,
    linesChanged: usage.linesChanged,
    migrations: usage.migrations,
    featureAreas: [...usage.featureAreas],
    limits: { ...DEFAULT_CHANGE_BUDGET },
  };
}
