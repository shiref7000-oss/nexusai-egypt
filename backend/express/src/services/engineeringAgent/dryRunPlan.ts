import type { ExecutionPlan } from './planner';
import { assessPlanRisk, type RiskReport } from './riskEngine';

/** @deprecated Use RiskReport from riskEngine — kept for compatibility */
export type DryRunAssessment = RiskReport & {
  affectedFiles: string[];
  riskLevel: string;
  estimatedLineChanges: number;
  highRiskFiles: string[];
  buildImpact: string;
  deploymentImpact: string;
  rollbackComplexity: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  blocked: boolean;
  blockReason?: string;
};

export function buildDryRunAssessment(
  plan: ExecutionPlan,
  options?: {
    prompt?: string;
    rollbackAvailable?: boolean;
    branchName?: string | null;
    allowHighRiskExecution?: boolean;
    alreadyApproved?: boolean;
  }
): DryRunAssessment {
  const report = assessPlanRisk({
    plan,
    prompt: options?.prompt || plan.summary,
    rollbackAvailable: options?.rollbackAvailable ?? false,
    branchName: options?.branchName ?? null,
    allowHighRiskExecution: options?.allowHighRiskExecution ?? false,
    alreadyApproved: options?.alreadyApproved ?? false,
  });

  const migrationCount = report.filesAffected.filter((p) => /migrations\//i.test(p)).length;
  return {
    ...report,
    affectedFiles: report.filesAffected,
    riskLevel: report.riskCategory.toLowerCase(),
    estimatedLineChanges: plan.filesToWrite.length * 80,
    highRiskFiles: report.perFileCategories
      .filter((f) => f.category === 'HIGH' || f.category === 'CRITICAL')
      .map((f) => f.path),
    buildImpact: plan.buildCommand ? 'Will run project build after changes' : 'Unknown',
    deploymentImpact: report.databaseImpact,
    rollbackComplexity: report.rollbackAvailable
      ? 'low'
      : migrationCount > 0
        ? 'high'
        : 'medium',
    requiresApproval: report.requiresApproval,
    blocked: report.blocked,
    blockReason: report.blockingReason || undefined,
  };
}
