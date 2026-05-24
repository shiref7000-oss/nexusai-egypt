import { join } from 'path';
import { existsSync } from 'fs';
import { env } from '../../config/env';
import { appendTaskLog } from './db';
import {
  extractVerificationTargets,
  parseRegressionTargets,
  type VerificationTarget,
} from './verificationCriteria';
import { validateDomTargets, validateRouteAccessibility } from './domValidation';
import { validateBundleStrings } from './bundleVerification';
import { validateApiTargets } from './apiValidation';
import { captureVerificationScreenshot, detectHydrationIssues } from './browserVerification';
import {
  getEnabledRegressionRules,
  insertArtifact,
  insertVerificationCheck,
  setTaskVerificationStatus,
} from './verificationDb';
import { setTaskDeployStage } from './deploymentDb';

export type VerificationRunResult = {
  passed: boolean;
  summary: Record<string, unknown>;
  failedChecks: string[];
};

export function getVerificationConfig() {
  const publicUrl =
    process.env.ENGINEERING_VERIFY_PUBLIC_URL ||
    process.env.ENGINEERING_DEPLOY_PUBLIC_URL ||
    env.FRONTEND_URL ||
    'http://127.0.0.1:5173';
  const localUrl = process.env.ENGINEERING_VERIFY_LOCAL_URL || env.FRONTEND_URL || 'http://127.0.0.1:5173';
  const apiBase =
    process.env.ENGINEERING_VERIFY_API_URL ||
    process.env.API_BASE_URL ||
    'http://127.0.0.1:3001';
  const strict = process.env.ENGINEERING_VERIFY_STRICT !== 'false';
  const repoRoot =
    process.env.ENGINEERING_DEPLOY_REPO_ROOT ||
    env.ENGINEERING_REPO_ROOT ||
    process.cwd().replace(/\/backend\/express.*$/, '');
  const localDist = join(repoRoot, 'saas-frontend', 'dist');
  const token = process.env.ENGINEERING_VERIFY_API_TOKEN || process.env.ADMIN_VERIFY_JWT || '';
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
  return { publicUrl, localUrl, apiBase, strict, localDist, authHeaders };
}

async function recordCheck(
  taskId: string,
  checkType: string,
  name: string,
  ok: boolean,
  message: string,
  evidence: Record<string, unknown>
): Promise<void> {
  await insertVerificationCheck({
    taskId,
    checkType,
    name,
    status: ok ? 'passed' : 'failed',
    message,
    evidence,
  });
}

async function storeScreenshotArtifact(
  taskId: string,
  capture: { ok: boolean; path?: string; message: string; artifactType: string; evidence: Record<string, unknown> }
): Promise<void> {
  if (!capture.path) return;
  await insertArtifact({
    taskId,
    artifactType: capture.artifactType,
    label: capture.artifactType,
    filePath: capture.path,
    metadata: { ...capture.evidence, message: capture.message },
  });
}

export async function runTaskVerification(input: {
  taskId: string;
  prompt: string;
  planSummary?: string;
  filesTouched?: string[];
  mode: 'pre_deploy' | 'post_deploy';
}): Promise<VerificationRunResult> {
  const cfg = getVerificationConfig();
  const targets = extractVerificationTargets({
    prompt: input.prompt,
    planSummary: input.planSummary,
    filesTouched: input.filesTouched,
  });

  if (input.mode === 'post_deploy') {
    const rules = await getEnabledRegressionRules();
    for (const rule of rules) {
      targets.push(...parseRegressionTargets(rule.targets));
    }
  }

  const failedChecks: string[] = [];
  const pushFailed = (name: string) => {
    if (!failedChecks.includes(name)) failedChecks.push(name);
  };
  const baseUrl = input.mode === 'post_deploy' ? cfg.publicUrl : cfg.localUrl;
  const adminPageUrl = `${baseUrl.replace(/\/$/, '')}/admin/engineering-agent`;
  const authToken = cfg.authHeaders?.Authorization?.replace(/^Bearer\s+/i, '') || '';

  await appendTaskLog(input.taskId, {
    eventType: 'verification',
    message: `Starting ${input.mode} verification`,
    payload: { mode: input.mode, targetCount: targets.length, adminPageUrl, hasAuth: !!authToken },
  });

  const beforeShot = await captureVerificationScreenshot({
    taskId: input.taskId,
    url: adminPageUrl,
    label: input.mode === 'post_deploy' ? 'production_before' : 'local_before',
    artifactType: 'screenshot_before',
    strict: cfg.strict,
    authToken: authToken || undefined,
  });
  await storeScreenshotArtifact(input.taskId, beforeShot);
  await recordCheck(
    input.taskId,
    'browser',
    'screenshot_before',
    beforeShot.ok,
    beforeShot.message,
    beforeShot.evidence
  );
  if (!beforeShot.ok) pushFailed('screenshot_before');

  const hydration = await detectHydrationIssues(adminPageUrl);
  await recordCheck(input.taskId, 'browser', 'hydration', hydration.ok, hydration.message, hydration.evidence);
  if (!hydration.ok) pushFailed('hydration');

  const spaShellOnly = (t: VerificationTarget) =>
    t.type === 'dom_text' &&
    (t.urlPath || '').startsWith('/admin') &&
    ['Engineering Agent', 'Live tasks', 'System status'].some((label) =>
      t.value.toLowerCase().includes(label.toLowerCase())
    );
  const domTargets = targets.filter((t) => !spaShellOnly(t));

  const domResults = await validateDomTargets(baseUrl, domTargets, { label: input.mode });
  for (const r of domResults) {
    await recordCheck(input.taskId, 'dom', r.name, r.ok, r.message, r.evidence);
    if (!r.ok) pushFailed(r.name);
  }

  const routeResults = await validateRouteAccessibility(cfg.apiBase, targets, cfg.authHeaders);
  for (const r of routeResults) {
    await recordCheck(input.taskId, 'route', r.name, r.ok, r.message, r.evidence);
    if (!r.ok) pushFailed(r.name);
  }

  const apiResults = await validateApiTargets({
    apiBase: cfg.apiBase,
    targets,
    authHeaders: cfg.authHeaders,
  });
  for (const r of apiResults) {
    await recordCheck(input.taskId, 'api', r.name, r.ok, r.message, r.evidence);
    if (!r.ok) pushFailed(r.name);
  }

  const bundleResults = await validateBundleStrings({
    targets,
    publicUrl: cfg.publicUrl,
    localDistDir: existsSync(cfg.localDist) ? cfg.localDist : undefined,
    label: input.mode,
  });
  for (const r of bundleResults) {
    await recordCheck(input.taskId, 'bundle', r.name, r.ok, r.message, r.evidence);
    if (!r.ok) pushFailed(r.name);
  }

  const afterShot = await captureVerificationScreenshot({
    taskId: input.taskId,
    url: adminPageUrl,
    label: input.mode === 'post_deploy' ? 'production_after' : 'local_after',
    artifactType: input.mode === 'post_deploy' ? 'screenshot_production' : 'screenshot_after',
    strict: cfg.strict,
    authToken: authToken || undefined,
  });
  await storeScreenshotArtifact(input.taskId, afterShot);
  await recordCheck(
    input.taskId,
    'browser',
    afterShot.artifactType || 'screenshot_after',
    afterShot.ok,
    afterShot.message,
    afterShot.evidence
  );
  if (!afterShot.ok) pushFailed(afterShot.artifactType || 'screenshot_after');

  const passed = failedChecks.length === 0;
  const summary = {
    mode: input.mode,
    passed,
    failedChecks,
    targets: targets.length,
    checkedAt: new Date().toISOString(),
    baseUrl,
    apiBase: cfg.apiBase,
  };

  await setTaskVerificationStatus(input.taskId, passed ? 'passed' : 'failed', summary);
  await appendTaskLog(input.taskId, {
    eventType: 'verification',
    level: passed ? 'info' : 'error',
    message: passed ? 'Verification passed' : 'Verification failed',
    payload: summary,
  });

  return { passed, summary, failedChecks };
}

export async function runPreDeployVerification(input: {
  taskId: string;
  prompt: string;
  planSummary?: string;
  filesTouched?: string[];
}): Promise<VerificationRunResult> {
  await setTaskDeployStage(input.taskId, 'verification');
  const result = await runTaskVerification({ ...input, mode: 'pre_deploy' });
  if (result.passed) {
    await setTaskDeployStage(input.taskId, 'ready_for_deploy');
  }
  return result;
}

export async function runPostDeployVerification(input: {
  taskId: string;
  prompt: string;
  planSummary?: string;
  filesTouched?: string[];
}): Promise<VerificationRunResult> {
  await setTaskDeployStage(input.taskId, 'post_deploy_validation');
  return runTaskVerification({ ...input, mode: 'post_deploy' });
}

export function canCompleteTask(input: {
  buildStatus: string | null;
  verificationStatus: string | null;
}): boolean {
  return input.buildStatus === 'passed' && input.verificationStatus === 'passed';
}

export function buildVerificationReportSection(result: VerificationRunResult): string {
  return [
    `## Verification`,
    result.passed ? '✅ All checks passed' : `❌ Failed (${result.failedChecks.length} checks)`,
    result.failedChecks.length ? `Failed: ${result.failedChecks.join(', ')}` : '',
    '```json',
    JSON.stringify(result.summary, null, 2).slice(0, 2000),
    '```',
  ].join('\n');
}
