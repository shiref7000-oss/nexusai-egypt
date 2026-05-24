/**
 * Risk management v2 — category-based approval, no hard-stop for large features.
 */
import type { ExecutionPlan } from './planner';

export type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskApprovalStatus = 'not_required' | 'pending' | 'approved' | 'auto_approved';

export type RiskReport = {
  riskScore: number;
  riskCategory: RiskCategory;
  blockingReason: string | null;
  requiresApproval: boolean;
  /** Hard block only for unapproved destructive ops */
  blocked: boolean;
  safeExecutionMode: boolean;
  reasons: string[];
  filesAffected: string[];
  databaseImpact: string;
  rollbackAvailable: boolean;
  branchName: string | null;
  destructiveActions: string[];
  perFileCategories: Array<{ path: string; category: RiskCategory; reason: string }>;
  incrementalPhases?: Array<{ title: string; prompt: string; estimatedCategory: RiskCategory }>;
};

const CRITICAL_PATH = [/DROP/i, /delete-all/i, /truncate/i];
const HIGH_PATH = [
  /middleware\/auth/i,
  /\/auth\.ts$/i,
  /billing/i,
  /payment/i,
  /stripe/i,
  /deploy\//i,
  /runMigrations/i,
  /\/migrations\/\d+_/i,
  /\.env/i,
  /secrets/i,
  /permissions/i,
];
const LOW_PATH = [
  /^docs\//i,
  /\.md$/i,
  /\/pages\//i,
  /\/components\//i,
  /\.tsx$/i,
  /\.css$/i,
  /\/test\//i,
  /\.test\./i,
  /__tests__\//i,
  /\/locales\//i,
];

function detectDestructiveInPrompt(prompt: string): string[] {
  const found: string[] = [];
  if (/\bDROP\s+TABLE\b/i.test(prompt)) found.push('Prompt requests DROP TABLE');
  if (/\bTRUNCATE\b/i.test(prompt)) found.push('Prompt requests TRUNCATE');
  if (/\bdelete\s+all\s+(users|data|records)/i.test(prompt)) found.push('Prompt requests mass data deletion');
  if (/\bremove\s+production\b/i.test(prompt)) found.push('Prompt references production data removal');
  return found;
}

function detectDestructiveInPlan(plan: ExecutionPlan): string[] {
  const found: string[] = [];
  for (const f of plan.filesToWrite) {
    const p = f.path.replace(/\\/g, '/');
    const d = (f.description || '').toLowerCase();
    if (/drop\s+table|truncate|delete\s+from/i.test(d)) found.push(`Destructive change described in ${p}`);
    if (/migrations\/.*\.sql$/i.test(p) && /drop|truncate|delete\s+from/i.test(d)) {
      found.push(`Migration may be destructive: ${p}`);
    }
  }
  return found;
}

export function classifyFileCategory(filePath: string, description = ''): {
  category: RiskCategory;
  reason: string;
} {
  const p = filePath.replace(/\\/g, '/');
  const text = `${p} ${description}`.toLowerCase();

  if (CRITICAL_PATH.some((re) => re.test(p)) || /drop\s+table|truncate/i.test(text)) {
    return { category: 'CRITICAL', reason: 'Destructive or irreversible data operation' };
  }
  if (HIGH_PATH.some((re) => re.test(p))) {
    return { category: 'HIGH', reason: 'Auth, billing, deploy, migration, or secrets surface' };
  }
  if (LOW_PATH.some((re) => re.test(p))) {
    return { category: 'LOW', reason: 'UI, page, component, docs, or test-only' };
  }
  if (/\/services\//i.test(p) || /\/routes\//i.test(p) || /\/workers?\//i.test(p)) {
    return { category: 'MEDIUM', reason: 'Backend service, API route, or worker' };
  }
  if (/migrations\//i.test(p)) {
    return { category: 'HIGH', reason: 'Database migration' };
  }
  return { category: 'MEDIUM', reason: 'General application code' };
}

function maxCategory(categories: RiskCategory[]): RiskCategory {
  const order: RiskCategory[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  let max: RiskCategory = 'LOW';
  for (const c of categories) {
    if (order.indexOf(c) > order.indexOf(max)) max = c;
  }
  return max;
}

function scoreFromCategory(cat: RiskCategory, rollbackAvailable: boolean): number {
  const base = { LOW: 15, MEDIUM: 35, HIGH: 62, CRITICAL: 88 }[cat];
  return rollbackAvailable ? Math.max(0, base - 20) : base;
}

export function assessPlanRisk(input: {
  plan: ExecutionPlan;
  prompt: string;
  rollbackAvailable: boolean;
  branchName: string | null;
  allowHighRiskExecution: boolean;
  alreadyApproved?: boolean;
}): RiskReport {
  const paths = [
    ...input.plan.filesToWrite.map((f) => f.path),
    ...input.plan.filesToRead.filter((p) => /migrations\//i.test(p)),
  ];

  const perFileCategories = input.plan.filesToWrite.map((f) => {
    const { category, reason } = classifyFileCategory(f.path, f.description);
    return { path: f.path, category, reason };
  });

  const destructiveActions = [
    ...detectDestructiveInPrompt(input.prompt),
    ...detectDestructiveInPlan(input.plan),
  ];

  const categories = perFileCategories.map((x) => x.category);
  if (destructiveActions.length) categories.push('CRITICAL');

  const riskCategory = maxCategory(categories.length ? categories : ['LOW']);
  let riskScore = scoreFromCategory(riskCategory, input.rollbackAvailable);

  const reasons: string[] = [];
  if (perFileCategories.filter((f) => f.category === 'HIGH' || f.category === 'CRITICAL').length) {
    reasons.push(
      ...perFileCategories
        .filter((f) => f.category === 'HIGH' || f.category === 'CRITICAL')
        .map((f) => `${f.path}: ${f.reason}`)
    );
  }
  if (destructiveActions.length) {
    reasons.push(...destructiveActions);
  }

  const migrationCount = paths.filter((p) => /migrations\//i.test(p)).length;
  const databaseImpact =
    migrationCount > 0
      ? `${migrationCount} migration file(s) — schema change possible`
      : paths.some((p) => /\/services\//i.test(p))
        ? 'Application logic only (no new migration detected)'
        : 'None detected';

  const requiresApproval =
    (riskCategory === 'HIGH' || riskCategory === 'CRITICAL') && !input.allowHighRiskExecution;

  const safeExecutionMode = riskCategory === 'LOW' || riskCategory === 'MEDIUM';

  /** Only block without approval path when destructive CRITICAL */
  const blocked =
    destructiveActions.length > 0 &&
    riskCategory === 'CRITICAL' &&
    !input.alreadyApproved &&
    !input.allowHighRiskExecution;

  let blockingReason: string | null = null;
  if (blocked) {
    blockingReason = `Destructive operation requires explicit approval: ${destructiveActions[0]}`;
  } else if (requiresApproval && !input.alreadyApproved) {
    blockingReason = null; // approval workflow, not a block
  }

  if (input.allowHighRiskExecution && (riskCategory === 'HIGH' || riskCategory === 'CRITICAL')) {
    reasons.push('Admin setting: Allow High Risk Execution is enabled (warning only)');
  }

  if (input.rollbackAvailable) {
    reasons.push(`Changes isolated on branch ${input.branchName || 'agent/task-*'} — rollback available`);
  }

  // Large feature requests must NOT inflate score
  if (input.plan.filesToWrite.length > 5 && riskCategory === 'LOW') {
    reasons.push(
      `Large scope (${input.plan.filesToWrite.length} files) — incremental delivery recommended; risk remains LOW (new modules/pages allowed)`
    );
  }

  return {
    riskScore,
    riskCategory,
    blockingReason,
    requiresApproval: requiresApproval && !input.alreadyApproved,
    blocked,
    safeExecutionMode,
    reasons,
    filesAffected: paths,
    databaseImpact,
    rollbackAvailable: input.rollbackAvailable,
    branchName: input.branchName,
    destructiveActions,
    perFileCategories,
  };
}

export function formatRiskReportMarkdown(report: RiskReport): string {
  return [
    `# Risk assessment`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Risk score** | ${report.riskScore}/100 |`,
    `| **Category** | ${report.riskCategory} |`,
    `| **Safe auto-execution** | ${report.safeExecutionMode ? 'Yes' : 'No'} |`,
    `| **Approval required** | ${report.requiresApproval ? 'Yes — use Approve & Continue' : 'No'} |`,
    `| **Rollback available** | ${report.rollbackAvailable ? 'Yes' : 'No'} |`,
    `| **Database impact** | ${report.databaseImpact} |`,
    report.branchName ? `| **Git branch** | \`${report.branchName}\` |` : '',
    ``,
    `## Reasons`,
    ...(report.reasons.length ? report.reasons.map((r) => `- ${r}`) : ['- No elevated risk signals']),
    ``,
    report.destructiveActions.length
      ? `## Destructive actions\n${report.destructiveActions.map((d) => `- ⚠️ ${d}`).join('\n')}`
      : '',
    ``,
    `## Files affected (${report.filesAffected.length})`,
    ...report.filesAffected.slice(0, 25).map((f) => `- ${f}`),
    report.filesAffected.length > 25 ? `- …and ${report.filesAffected.length - 25} more` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
