export type ConfidenceScores = {
  confidenceScore: number;
  evidenceScore: number;
  verificationScore: number;
  deploymentReadinessScore: number;
  deploymentBlocked: boolean;
  blockReasons: string[];
};

export function computeConfidenceScores(input: {
  buildPassed: boolean;
  verifyPassed: boolean;
  regressionPassed: boolean;
  reviewScore: number;
  reviewCritical: number;
  budgetViolations: string[];
  approvalRequired: boolean;
  elevatedVerificationRequired: boolean;
}): ConfidenceScores {
  const blockReasons: string[] = [];
  let evidenceScore = 40;
  if (input.buildPassed) evidenceScore += 25;
  if (input.verifyPassed) evidenceScore += 20;
  if (input.regressionPassed) evidenceScore += 15;

  let verificationScore = 0;
  if (input.verifyPassed) verificationScore = 90;
  else if (input.buildPassed) verificationScore = 30;
  else verificationScore = 10;

  let deploymentReadinessScore = Math.round(
    (evidenceScore * 0.35 + verificationScore * 0.35 + input.reviewScore * 0.3)
  );

  if (input.budgetViolations.length) {
    blockReasons.push(...input.budgetViolations.map((v) => `budget: ${v}`));
    deploymentReadinessScore = Math.min(deploymentReadinessScore, 40);
  }
  if (input.approvalRequired) {
    blockReasons.push('manual approval required for high-risk changes');
    deploymentReadinessScore = Math.min(deploymentReadinessScore, 35);
  }
  if (input.reviewCritical > 0) {
    blockReasons.push(`${input.reviewCritical} critical code review finding(s)`);
    deploymentReadinessScore = 0;
  }
  if (!input.buildPassed) blockReasons.push('build failed');
  if (!input.verifyPassed && input.buildPassed) blockReasons.push('verification failed');
  if (!input.regressionPassed) blockReasons.push('regression detected');

  const confidenceScore = Math.round(
    (evidenceScore + verificationScore + deploymentReadinessScore) / 3
  );

  const deploymentBlocked =
    blockReasons.length > 0 ||
    !input.buildPassed ||
    !input.verifyPassed ||
    !input.regressionPassed ||
    input.reviewCritical > 0 ||
    (input.elevatedVerificationRequired && verificationScore < 85);

  return {
    confidenceScore: Math.min(100, confidenceScore),
    evidenceScore: Math.min(100, evidenceScore),
    verificationScore: Math.min(100, verificationScore),
    deploymentReadinessScore: Math.min(100, Math.max(0, deploymentReadinessScore)),
    deploymentBlocked,
    blockReasons,
  };
}

export function computePipelineConfidence(input: {
  understandingConfidence: number;
  implementationConfidence: number;
  verificationPassed: boolean;
  buildPassed: boolean;
  regressionPassed: boolean;
}): {
  implementationConfidence: number;
  verificationConfidence: number;
} {
  let verificationConfidence = 15;
  if (input.buildPassed) verificationConfidence += 35;
  if (input.verificationPassed) verificationConfidence += 40;
  if (input.regressionPassed) verificationConfidence += 10;

  const implementationConfidence = Math.round(
    (input.understandingConfidence * 0.25 + input.implementationConfidence * 0.75)
  );

  return {
    implementationConfidence: Math.min(100, Math.max(0, implementationConfidence)),
    verificationConfidence: Math.min(100, Math.max(0, verificationConfidence)),
  };
}
