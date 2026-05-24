import { appendTaskLog } from './db';
import { parseRegressionTargets } from './verificationCriteria';
import { getEnabledRegressionRules } from './verificationDb';
import { validateDomTargets, validateRouteAccessibility } from './domValidation';
import { validateApiTargets } from './apiValidation';

export type RegressionBaseline = {
  capturedAt: string;
  checks: Array<{ name: string; ok: boolean; message: string }>;
};

export async function captureRegressionBaseline(input: {
  taskId: string;
  publicUrl: string;
  apiBase: string;
  authHeaders?: Record<string, string>;
}): Promise<RegressionBaseline> {
  const rules = await getEnabledRegressionRules();
  const targets = rules.flatMap((r) => parseRegressionTargets(r.targets));

  const dom = await validateDomTargets(input.publicUrl, targets, { label: 'baseline' });
  const routes = await validateRouteAccessibility(input.apiBase, targets, input.authHeaders);
  const api = await validateApiTargets({ apiBase: input.apiBase, targets, authHeaders: input.authHeaders });

  const checks = [...dom, ...routes, ...api].map((c) => ({
    name: c.name,
    ok: c.ok,
    message: c.message,
  }));

  await appendTaskLog(input.taskId, {
    eventType: 'regression_baseline',
    message: `Baseline captured (${checks.filter((c) => c.ok).length}/${checks.length} passed)`,
    payload: { checks },
  });

  return { capturedAt: new Date().toISOString(), checks };
}

export function compareRegression(
  baseline: RegressionBaseline,
  after: Array<{ name: string; ok: boolean; message: string }>
): { passed: boolean; regressions: string[] } {
  const regressions: string[] = [];
  const baseMap = new Map(baseline.checks.map((c) => [c.name, c.ok]));

  for (const [name, wasOk] of baseMap) {
    const now = after.find((c) => c.name === name);
    if (wasOk && now && !now.ok) regressions.push(`${name}: was OK, now failed — ${now.message}`);
  }

  return { passed: regressions.length === 0, regressions };
}
