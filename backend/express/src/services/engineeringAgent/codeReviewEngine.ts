export type CodeReviewResult = {
  reviewScore: number;
  warnings: string[];
  recommendations: string[];
  criticalCount: number;
};

export function runLightweightCodeReview(filesTouched: string[], contents: Map<string, string>): CodeReviewResult {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let criticalCount = 0;

  for (const path of filesTouched) {
    const body = contents.get(path) || '';
    if (/eval\s*\(/.test(body)) {
      warnings.push(`${path}: eval() usage`);
      criticalCount++;
    }
    if (/password\s*=\s*['"][^'"]+['"]/i.test(body)) {
      warnings.push(`${path}: possible hardcoded secret`);
      criticalCount++;
    }
    if (body.includes('console.log') && !path.includes('test')) {
      recommendations.push(`${path}: remove debug console.log before deploy`);
    }
    if ((body.match(/^import /gm) || []).length > 25) {
      recommendations.push(`${path}: large import surface — verify all are used`);
    }
    if (/\.query\s*\(\s*`[^`]*\$\{/.test(body)) {
      warnings.push(`${path}: possible SQL injection via template literal`);
      criticalCount++;
    }
  }

  let reviewScore = 85;
  reviewScore -= warnings.length * 8;
  reviewScore -= criticalCount * 25;
  reviewScore = Math.max(0, Math.min(100, reviewScore));

  return { reviewScore, warnings, recommendations, criticalCount };
}
