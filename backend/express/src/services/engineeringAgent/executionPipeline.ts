/**
 * Mandatory Engineering Agent pipeline — phases 1–4 complete before any file writes.
 */
import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env';
import { appendTaskLog, getTask, updateTask, type AgentTaskRow } from './db';
import { indexRepository, searchCode } from './codeIndex';
import { createExecutionPlan, generateFilePatch } from './planner';
import { readFile, writeFile, createFile, runTerminal, gitDiff, gitStatus } from './tools';
import { resolveRepoRoot } from './safety';
import { seedPlatformMemory } from './db';
import { setTaskPhase, type ReasoningSummary } from './taskMonitor';
import { syncDeployStageOnBuildStart } from './deploymentService';
import {
  buildVerificationReportSection,
  runPreDeployVerification,
  getVerificationConfig,
} from './verificationPipeline';
import { detectRepoLayout, sanitizeBuildCommand } from './repoLayout';
import { inferFileContentFromPrompt, inferFilesFromPrompt } from './planParse';
import {
  applyBudgetToFileWrites,
  budgetExceeded,
  budgetUsageSnapshot,
  createBudgetUsage,
  DEFAULT_CHANGE_BUDGET,
  recordFileChange,
} from './changeBudget';
import { buildDryRunAssessment } from './dryRunPlan';
import { analyzeAndDecomposeBeforeRisk } from './incrementalDelivery';
import { getEngineeringRiskSettings } from './riskSettings';
import {
  isRiskApprovedForResume,
  persistRiskReport,
  requestRiskApproval,
} from './riskApproval';
import { agentBranchName, captureBranchDiffSummary, ensureAgentBranch } from './branchIsolation';
import { captureRegressionBaseline, compareRegression } from './regressionBaseline';
import { computeConfidenceScores, computePipelineConfidence } from './confidenceScoring';
import {
  analyzeBuildFailure,
  buildFixPromptFromRca,
  enrichBuildFailureWithFlash,
} from './rootCauseAnalysis';
import { runLightweightCodeReview } from './codeReviewEngine';
import {
  mergeReliabilityJson,
  setConfidenceAndBlock,
  recordIncident,
  findSimilarIncidents,
} from './reliabilityDb';
import { requiresElevatedVerification } from './fileRisk';
import { classifyFileCategory, type RiskCategory } from './riskEngine';
import { listVerifications } from './verificationDb';
import { processEngineeringAI } from './engineeringAI';
import { syncCodeMemoryFromIndex } from './codeMemory';
import { setPipelinePhase, assertPreImplementationComplete, getPipelineState } from './pipelineDb';
import type { PipelinePhase } from './pipelinePhases';
import {
  filterApprovedFileWrites,
  taskTargetsEngineeringInfra,
} from './protectedFiles';
import type { ExecutionPlan } from './planner';

function detectRepoRoot(task: AgentTaskRow): string {
  const configured = task.repo_root || env.ENGINEERING_REPO_ROOT;
  if (configured) return resolveRepoRoot(configured);
  const cwd = process.cwd();
  if (cwd.includes('backend/express')) {
    return resolveRepoRoot(cwd.replace(/\/backend\/express.*$/, ''));
  }
  return resolveRepoRoot(cwd);
}

async function listRepoRelativeFiles(repoRoot: string, subdir: string, ext: string): Promise<string[]> {
  const base = path.join(repoRoot, subdir);
  const out: string[] = [];
  async function walk(dir: string, prefix: string) {
    let entries: { name: string; isDirectory: () => boolean }[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, rel);
      else if (e.name.endsWith(ext)) out.push(`${subdir}/${rel}`.replace(/\\/g, '/'));
    }
  }
  await walk(base, '');
  return out.slice(0, 80);
}

export async function runUnderstandTaskPhase(
  taskId: string,
  userId: number,
  prompt: string
): Promise<{
  restatement: string;
  requirements: string[];
  successCriteria: string[];
  constraints: string[];
  confidence: number;
}> {
  let data: Record<string, unknown> = {};
  const evidence: string[] = ['source:task_prompt'];

  try {
    const aiRes = await processEngineeringAI({
      engineeringTask: 'understand_task',
      prompt: `Analyze this engineering task. Return JSON only:\n{"restatement":"one paragraph","requirements":["..."],"successCriteria":["..."],"constraints":["..."],"confidence":0-100}\n\nTask:\n${prompt.slice(0, 8000)}`,
      userId,
      taskId,
      overrides: { jsonMode: true, structuredOutput: true, maxTokens: 1500 },
    });
    if (aiRes.structured && typeof aiRes.structured === 'object') {
      data = aiRes.structured as Record<string, unknown>;
      evidence.push('source:gemini_understanding');
    }
  } catch {
    evidence.push('source:heuristic_fallback');
  }

  const lines = prompt.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const restatement =
    String(data.restatement || '').trim() ||
    (lines[0]?.slice(0, 500) || prompt.slice(0, 500));
  const requirements = Array.isArray(data.requirements)
    ? (data.requirements as string[]).map(String)
    : lines.filter((l) => /^[-*•\d]/.test(l) || /must|should|need/i.test(l)).slice(0, 12);
  if (!requirements.length && prompt.length > 20) requirements.push(prompt.slice(0, 300));

  const successCriteria = Array.isArray(data.successCriteria)
    ? (data.successCriteria as string[]).map(String)
    : [
        /verify|verification|test/i.test(prompt) ? 'Verification checks pass' : null,
        /deploy/i.test(prompt) ? 'Deployment-ready build' : null,
        /fix|bug/i.test(prompt) ? 'Root cause fixed with evidence' : null,
        'Build passes without unrelated file changes',
      ].filter(Boolean) as string[];

  const constraints = Array.isArray(data.constraints)
    ? (data.constraints as string[]).map(String)
    : [
        'No code before impact analysis and implementation plan',
        'Protected infrastructure files require explicit task scope',
        'Max 3 files per iteration (change budget)',
        'No secrets or deployed migrations',
      ];

  let confidence = Number(data.confidence);
  if (!Number.isFinite(confidence)) {
    confidence = 35;
    if (restatement.length > 40) confidence += 20;
    if (requirements.length >= 2) confidence += 15;
    if (successCriteria.length >= 2) confidence += 15;
    if (constraints.length >= 2) confidence += 15;
  }
  confidence = Math.min(100, Math.max(0, Math.round(confidence)));

  await setPipelinePhase(
    taskId,
    userId,
    'UNDERSTAND_TASK',
    {
      evidence,
      data: { restatement, requirements, successCriteria, constraints, confidence },
    },
    { understanding: confidence }
  );

  return { restatement, requirements, successCriteria, constraints, confidence };
}

export async function runArchitectureMappingPhase(
  taskId: string,
  userId: number,
  repoRoot: string,
  prompt: string
): Promise<Record<string, unknown>> {
  const layout = await detectRepoLayout(repoRoot);
  const evidence: string[] = [`repoRoot:${repoRoot}`, 'source:detectRepoLayout'];

  const [routes, services, migrations, pages] = await Promise.all([
    listRepoRelativeFiles(repoRoot, path.join(layout.backendRel, 'src/routes'), '.ts').catch(() => []),
    listRepoRelativeFiles(repoRoot, path.join(layout.backendRel, 'src/services'), '.ts').catch(() => []),
    listRepoRelativeFiles(repoRoot, path.join(layout.backendRel, 'src/db/migrations'), '.sql').catch(() => []),
    listRepoRelativeFiles(repoRoot, path.join(layout.frontendRel, 'src/pages'), '.tsx').catch(() => []),
  ]);

  const terms = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 4);
  const searchHits: Array<{ file_path: string; summary: string }> = [];
  for (const term of terms) {
    const rows = await searchCode(repoRoot, term, 6);
    for (const row of rows) {
      if (!searchHits.find((h) => h.file_path === row.file_path)) {
        searchHits.push({
          file_path: row.file_path,
          summary: String(row.summary || '').slice(0, 160),
        });
      }
    }
  }
  evidence.push(`code_index_hits:${searchHits.length}`);

  const map = {
    routes: routes.slice(0, 40),
    apis: routes.filter((r) => r.includes('routes/')).map((r) => `/api/${r.split('/').pop()?.replace('.ts', '')}`),
    services: services.slice(0, 40),
    databaseTables: migrations.slice(-15),
    frontendPages: pages.slice(0, 40),
    dependencies: {
      backendPackage: layout.backendPackageName,
      frontendPackage: layout.frontendPackageName,
      workspaces: layout.npmWorkspacesEnabled,
    },
    architectureSummary: layout.architectureSummary,
    searchHits,
  };

  await setPipelinePhase(taskId, userId, 'ARCHITECTURE_MAPPING', { evidence, data: map });
  return map;
}

export async function runImpactAnalysisPhase(
  taskId: string,
  userId: number,
  prompt: string,
  architecture: Record<string, unknown>
): Promise<{
  likelyFiles: string[];
  approvedFilePaths: string[];
  risk: {
    estimatedRiskScore: number;
    level: string;
    highRiskFiles: string[];
    requiresApproval: boolean;
  };
  blockedProtected: string[];
}> {
  const inferred = inferFilesFromPrompt(prompt).map((f) => f.path);
  const hits = ((architecture.searchHits as Array<{ file_path: string }>) || []).map((h) => h.file_path);
  const likelyFiles = [...new Set([...inferred, ...hits])].slice(0, 20);
  const fileCats = likelyFiles.map((p) => classifyFileCategory(p));
  const catOrder: RiskCategory[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const maxCat = fileCats.reduce<RiskCategory>(
    (m, f) => (catOrder.indexOf(f.category) > catOrder.indexOf(m) ? f.category : m),
    'LOW'
  );
  const risk = {
    estimatedRiskScore: { LOW: 15, MEDIUM: 35, HIGH: 55, CRITICAL: 75 }[maxCat],
    level: maxCat.toLowerCase(),
    highRiskFiles: likelyFiles.filter((p) => {
      const c = classifyFileCategory(p).category;
      return c === 'HIGH' || c === 'CRITICAL';
    }),
    requiresApproval: maxCat === 'HIGH' || maxCat === 'CRITICAL',
  };
  const allowInfra = taskTargetsEngineeringInfra(prompt);
  const blockedProtected = likelyFiles.filter((f) => {
    const { blocked } = filterApprovedFileWrites(
      [{ path: f, action: 'modify', description: 'probe' }],
      new Set(likelyFiles),
      allowInfra
    );
    return blocked.length > 0;
  });

  const approvedFilePaths = likelyFiles.filter((f) => !blockedProtected.includes(f));

  const evidence = [
    `inferred_files:${inferred.length}`,
    `search_hits:${hits.length}`,
    `risk_score:${risk.estimatedRiskScore}`,
    `high_risk:${risk.highRiskFiles.join(',') || 'none'}`,
    `allow_engineering_infra:${allowInfra}`,
  ];

  const implConf = Math.max(
    0,
    Math.min(100, 100 - risk.estimatedRiskScore - blockedProtected.length * 10)
  );
  await setPipelinePhase(
    taskId,
    userId,
    'IMPACT_ANALYSIS',
    {
      evidence,
      data: {
        likelyFiles,
        approvedFilePaths,
        reasons: likelyFiles.map((p) => ({
          path: p,
          why: inferred.includes(p) ? 'Prompt/file inference' : 'Code search relevance',
        })),
        risk,
        blockedProtected,
      },
    },
    { implementation: implConf }
  );

  return { likelyFiles, approvedFilePaths, risk, blockedProtected };
}

export async function runImplementationPlanPhase(
  taskId: string,
  userId: number,
  prompt: string,
  repoRoot: string,
  approvedFilePaths: string[]
): Promise<{ plan: ExecutionPlan; dryRun: ReturnType<typeof buildDryRunAssessment> }> {
  await setTaskPhase(taskId, userId, 'generating_plan', { status: 'running' });
  const plan = await createExecutionPlan(prompt, repoRoot, userId, taskId);

  const planPaths = plan.filesToWrite.map((f) => f.path.replace(/\\/g, '/'));
  const outOfScope = planPaths.filter((p) => approvedFilePaths.length && !approvedFilePaths.includes(p));
  if (outOfScope.length) {
    await appendTaskLog(taskId, {
      eventType: 'impact_scope_warning',
      level: 'warn',
      message: `Plan includes ${outOfScope.length} file(s) outside impact-approved list — will be blocked at implementation`,
      payload: { outOfScope },
    });
  }

  const riskSettings = await getEngineeringRiskSettings();
  const branchName = riskSettings.branchIsolationEnabled ? agentBranchName(taskId) : null;
  const alreadyApproved = await isRiskApprovedForResume(taskId);
  const dryRun = buildDryRunAssessment(plan, {
    prompt,
    rollbackAvailable: riskSettings.branchIsolationEnabled,
    branchName,
    allowHighRiskExecution: riskSettings.allowHighRiskExecution,
    alreadyApproved,
  });
  const evidence = [
    `plan_files_read:${plan.filesToRead.length}`,
    `plan_files_write:${plan.filesToWrite.length}`,
    `dry_run_risk:${dryRun.riskScore}`,
    `dry_run_blocked:${dryRun.blocked}`,
  ];

  const implConf = Math.max(0, Math.min(100, 70 - dryRun.riskScore));
  await setPipelinePhase(
    taskId,
    userId,
    'IMPLEMENTATION_PLAN',
    {
      evidence,
      data: {
        summary: plan.summary,
        filesToRead: plan.filesToRead,
        filesToWrite: plan.filesToWrite,
        buildCommand: plan.buildCommand,
        dryRun,
        approvedFilePaths,
        outOfScope,
      },
    },
    { implementation: implConf }
  );

  return { plan, dryRun };
}

export type ImplementationPipelineContext = {
  taskId: string;
  userId: number;
  task: AgentTaskRow;
  repoRoot: string;
  allowInfra: boolean;
};

export async function runImplementationPipeline(
  taskId: string,
  userId: number
): Promise<void> {
  let filesReadCount = 0;
  let filesWrittenCount = 0;
  let buildFixAttempts = 0;
  const budgetUsage = createBudgetUsage();

  const task = await getTask(taskId, userId);
  if (!task) return;

  const repoRoot = detectRepoRoot(task);
  await appendTaskLog(taskId, { eventType: 'task_created', message: 'Task created (mandatory pipeline)' });
  await setTaskPhase(taskId, userId, 'planning', { status: 'planning', buildStatus: 'pending' });
  await updateTask(taskId, userId, { startedAt: new Date() });
  await seedPlatformMemory().catch(() => undefined);

  const understanding = await runUnderstandTaskPhase(taskId, userId, task.prompt);
  await setTaskPhase(taskId, userId, 'searching_code', { status: 'running' });
  const indexResult = await indexRepository(repoRoot, taskId);
  const codeMem = await syncCodeMemoryFromIndex(repoRoot).catch(() => ({ updated: 0 }));
  await appendTaskLog(taskId, {
    eventType: 'code_index',
    message: `Repository indexed (${indexResult.indexed} files)`,
    payload: { evidence: `indexed=${indexResult.indexed}`, codeMemoryKeys: codeMem.updated },
  });

  const architecture = await runArchitectureMappingPhase(taskId, userId, repoRoot, task.prompt);

  const delivery = await analyzeAndDecomposeBeforeRisk(taskId, userId, task.prompt, repoRoot);
  if (delivery.decomposed && delivery.subtaskIds[0]) {
    const { enqueueEngineeringTask } = await import('./runner');
    enqueueEngineeringTask(delivery.subtaskIds[0], userId);
    await updateTask(taskId, userId, {
      status: 'running',
      resultReport: `# Incremental delivery\n\n${delivery.phases.length} phases. Running phase 1 as subtask \`${delivery.subtaskIds[0]}\`.\n\n${delivery.phases.map((p, i) => `${i + 1}. ${p.title} (${p.estimatedCategory})`).join('\n')}`,
    });
    await appendTaskLog(taskId, {
      eventType: 'incremental_delivery',
      message: `Parent task orchestrating ${delivery.subtaskIds.length} phases — subtask ${delivery.subtaskIds[0]} started`,
      payload: { subtaskIds: delivery.subtaskIds },
    });
    return;
  }

  const impact = await runImpactAnalysisPhase(taskId, userId, task.prompt, architecture);
  const allowInfra = taskTargetsEngineeringInfra(task.prompt);
  const approvedSet = new Set(impact.approvedFilePaths);

  const { plan, dryRun } = await runImplementationPlanPhase(
    taskId,
    userId,
    task.prompt,
    repoRoot,
    impact.approvedFilePaths
  );
  await mergeReliabilityJson(taskId, { dryRun, pipeline: true });

  const riskSettings = await getEngineeringRiskSettings();
  const approvalStatus =
    dryRun.safeExecutionMode && !dryRun.requiresApproval
      ? 'auto_approved'
      : dryRun.requiresApproval
        ? 'pending'
        : 'not_required';

  if (dryRun.blocked) {
    await requestRiskApproval(taskId, userId, dryRun, plan);
    return;
  }

  if (dryRun.requiresApproval && !(await isRiskApprovedForResume(taskId))) {
    await requestRiskApproval(taskId, userId, dryRun, plan);
    return;
  }

  await persistRiskReport(
    taskId,
    dryRun,
    (await isRiskApprovedForResume(taskId)) ? 'approved' : approvalStatus
  );

  await assertPreImplementationComplete(taskId);

  const riskSettings2 = riskSettings;
  if (riskSettings2.branchIsolationEnabled) {
    await ensureAgentBranch(repoRoot, taskId);
  }

  const reasoning: ReasoningSummary = {
    planningSummary: plan.planningSummary || plan.summary,
    selectedFiles: plan.fileSelectionRationale || plan.filesToRead.map((p) => ({
      path: p,
      reason: 'Impact-approved / plan',
    })),
    executionPlanSummary: plan.summary,
    buildFixAttempts: 0,
  };
  await updateTask(taskId, userId, { status: 'running', planJson: plan });

  let regressionBaseline: Awaited<ReturnType<typeof captureRegressionBaseline>> | null = null;
  try {
    const cfg = getVerificationConfig();
    regressionBaseline = await captureRegressionBaseline({
      taskId,
      publicUrl: cfg.localUrl,
      apiBase: cfg.apiBase,
      authHeaders: cfg.authHeaders,
    });
  } catch {
    /* optional */
  }

  for (const q of plan.searchQueries.slice(0, 3)) {
    const { searchCodeTool } = await import('./codeIndex');
    await searchCodeTool(repoRoot, q, taskId);
  }

  await setPipelinePhase(taskId, userId, 'IMPLEMENTATION', {
    evidence: ['gate:pre_implementation_phases_complete'],
    data: { message: 'Starting file writes — approved scope only' },
  });
  await setTaskPhase(taskId, userId, 'reading_files');

  const toRead = [...new Set([...plan.filesToRead, ...plan.filesToWrite.map((f) => f.path)])].slice(0, 8);
  for (const fp of toRead) {
    const res = await readFile(repoRoot, fp, taskId);
    if (res.ok) filesReadCount++;
  }

  const { allowed: budgetedWrites, deferred: deferredWrites } = applyBudgetToFileWrites(plan.filesToWrite);
  const { allowed: filesToWrite, blocked: scopeBlocked } = filterApprovedFileWrites(
    budgetedWrites,
    approvedSet,
    allowInfra
  );

  if (scopeBlocked.length) {
    await appendTaskLog(taskId, {
      eventType: 'scope_blocked',
      level: 'warn',
      message: `Blocked ${scopeBlocked.length} file(s) outside approved/protected scope`,
      payload: { blocked: scopeBlocked },
    });
  }
  if (deferredWrites.length) {
    await appendTaskLog(taskId, {
      eventType: 'budget_deferred',
      level: 'warn',
      message: `Deferred ${deferredWrites.length} files (budget)`,
    });
  }

  const filesTouched: string[] = [];
  const fileContentsForReview = new Map<string, string>();
  await setTaskPhase(taskId, userId, 'generating_patches');

  for (const fw of filesToWrite) {
    if (budgetExceeded(budgetUsage).length) break;

    const existing = await readFile(repoRoot, fw.path, taskId);
    const current = existing.ok && existing.output ? existing.output : '';
    const isCreate = fw.action === 'create' && !existing.ok;
    const patch = await generateFilePatch(task.prompt, fw.path, current, plan.summary, userId, {
      taskId,
      isCreate,
      writeHint: fw.description,
    });

    let contentToWrite = patch.content;
    if (!contentToWrite.trim() || contentToWrite === current) {
      const inferred = inferFileContentFromPrompt(task.prompt, fw.path);
      if (inferred) contentToWrite = inferred;
    }
    if (!isCreate && contentToWrite === current) continue;
    if (!contentToWrite.trim()) continue;

    recordFileChange(budgetUsage, fw.path, current, contentToWrite);
    fileContentsForReview.set(fw.path, contentToWrite);

    await setTaskPhase(taskId, userId, 'writing_files');
    const toolRes = isCreate
      ? await createFile(repoRoot, fw.path, contentToWrite, taskId, { taskPrompt: task.prompt })
      : await writeFile(repoRoot, fw.path, contentToWrite, taskId, { taskPrompt: task.prompt });

    if (toolRes.ok) {
      filesTouched.push(fw.path);
      filesWrittenCount++;
      await appendTaskLog(taskId, {
        eventType: 'file_edit',
        message: `${fw.action} ${fw.path}`,
        payload: { path: fw.path, evidence: 'write_ok' },
      });
    }
  }

  await mergeReliabilityJson(taskId, { budget: budgetUsageSnapshot(budgetUsage) });
  await setTaskPhase(taskId, userId, 'writing_files', { filesWrittenCount, filesReadCount });

  await setPipelinePhase(taskId, userId, 'BUILD', {
    evidence: [`files_touched:${filesTouched.length}`],
    data: { filesTouched },
  });
  await setTaskPhase(taskId, userId, 'running_build', { buildStatus: 'running' });
  await syncDeployStageOnBuildStart(taskId);

  const layout = await detectRepoLayout(repoRoot);
  const buildCmd = sanitizeBuildCommand(plan.buildCommand || layout.backendBuildCommand, layout);
  const buildStart = Date.now();
  let buildRes = await runTerminal(repoRoot, buildCmd, taskId);

  if (plan.testCommand && buildRes.ok) {
    await setTaskPhase(taskId, userId, 'running_tests');
    await runTerminal(repoRoot, sanitizeBuildCommand(plan.testCommand, layout), taskId);
  }

  while (!buildRes.ok && buildFixAttempts < DEFAULT_CHANGE_BUDGET.maxBuildFixAttempts) {
    buildFixAttempts++;
    let rca = analyzeBuildFailure(buildRes.output || buildRes.error || '');
    rca = await enrichBuildFailureWithFlash(
      buildRes.output || buildRes.error || '',
      rca,
      userId,
      taskId
    );
    await recordIncident({
      taskId,
      incidentType: 'build_failure',
      severity: 'medium',
      summary: rca.rootCause,
      rootCause: rca.rootCause,
      evidence: { evidence: rca.evidence },
      filesInvolved: rca.impactedFiles,
    });
    await mergeReliabilityJson(taskId, { rca, pipelineBuildFix: buildFixAttempts });
    await appendTaskLog(taskId, {
      eventType: 'build_error',
      level: 'warn',
      message: `Build failed — RCA before fix (attempt ${buildFixAttempts})`,
      payload: { rootCause: rca.rootCause, evidence: rca.evidence },
    });

    const fixPrompt = buildFixPromptFromRca(task.prompt, rca, buildRes.output || buildRes.error || '');
    const fixPlan = await createExecutionPlan(fixPrompt, repoRoot, userId, taskId);
    const fixFiles = filterApprovedFileWrites(
      fixPlan.filesToWrite.slice(0, DEFAULT_CHANGE_BUDGET.maxFixFilesPerAttempt),
      approvedSet,
      allowInfra
    ).allowed;

    for (const fw of fixFiles) {
      const existing = await readFile(repoRoot, fw.path, taskId);
      const current = existing.ok && existing.output ? existing.output : '';
      const patch = await generateFilePatch(fixPrompt, fw.path, current, fixPlan.summary, userId, {
        taskId,
      });
      if (patch.content && patch.content !== current) {
        await writeFile(repoRoot, fw.path, patch.content, taskId, { taskPrompt: task.prompt });
        if (!filesTouched.includes(fw.path)) filesTouched.push(fw.path);
        filesWrittenCount++;
      }
    }
    buildRes = await runTerminal(repoRoot, buildCmd, taskId);
  }

  const buildDurationMs = Date.now() - buildStart;
  const buildStatus = buildRes.ok ? 'passed' : 'failed';
  const { pool } = await import('../../config/db_pg');
  await pool.query(
    `UPDATE agent_tasks SET build_status = $3, build_duration_ms = $4, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [taskId, userId, buildStatus, buildDurationMs]
  );

  let gitStOutput = '';
  let gitDfOutput = '';
  if (buildRes.ok) {
    gitStOutput = (await gitStatus(repoRoot, taskId)).output || '';
    gitDfOutput = (await gitDiff(repoRoot, taskId)).output || '';
  }

  const codeReview = runLightweightCodeReview(filesTouched, fileContentsForReview);
  let verifyPassed = false;
  let regressionPassed = true;
  let regressionRegressions: string[] = [];
  let verificationSection = '';

  if (buildRes.ok) {
    await setPipelinePhase(taskId, userId, 'VERIFICATION', {
      evidence: ['build_passed'],
      data: { buildStatus },
    });
    await setTaskPhase(taskId, userId, 'verification', { buildStatus: 'passed' });
    const verifyResult = await runPreDeployVerification({
      taskId,
      prompt: task.prompt,
      planSummary: plan.summary,
      filesTouched,
    });
    verifyPassed = verifyResult.passed;
    verificationSection = buildVerificationReportSection(verifyResult);

    await setPipelinePhase(taskId, userId, 'REGRESSION_TESTING', {
      evidence: [`verify_passed:${verifyPassed}`],
      data: { verifySummary: verifyResult.summary },
    });

    if (regressionBaseline) {
      const checks = (await listVerifications(taskId)).map((c) => ({
        name: c.name,
        ok: c.status === 'passed',
        message: c.message || '',
      }));
      const cmp = compareRegression(regressionBaseline, checks);
      regressionPassed = cmp.passed;
      regressionRegressions = cmp.regressions;
    }
  }

  const elevated = filesTouched.some((f) => requiresElevatedVerification(f));
  const scores = computeConfidenceScores({
    buildPassed: buildRes.ok,
    verifyPassed,
    regressionPassed,
    reviewScore: codeReview.reviewScore,
    reviewCritical: codeReview.criticalCount,
    budgetViolations: budgetExceeded(budgetUsage),
      approvalRequired: dryRun.requiresApproval && !dryRun.safeExecutionMode,
    elevatedVerificationRequired: elevated,
  });

  const stateBeforeEvidence = await getPipelineState(taskId);
  const impactRisk = (stateBeforeEvidence.phases.IMPACT_ANALYSIS?.data as { risk?: { estimatedRiskScore?: number } })
    ?.risk?.estimatedRiskScore;
  const impactImplConf =
    impactRisk != null ? Math.max(0, Math.min(100, 100 - impactRisk)) : 50;

  const pipelineConf = computePipelineConfidence({
    understandingConfidence: understanding.confidence,
    implementationConfidence: impactImplConf,
    verificationPassed: verifyPassed,
    buildPassed: buildRes.ok,
    regressionPassed,
  });

  await setConfidenceAndBlock(taskId, {
    confidenceScore: scores.confidenceScore,
    deploymentBlocked: scores.deploymentBlocked,
  });
  await pool.query(
    `UPDATE agent_tasks SET understanding_confidence = $2, implementation_confidence = $3,
     verification_confidence_pct = $4, updated_at = NOW() WHERE id = $1`,
    [
      taskId,
      understanding.confidence,
      pipelineConf.implementationConfidence,
      pipelineConf.verificationConfidence,
    ]
  );

  if (buildRes.ok && verifyPassed && regressionPassed && !scores.deploymentBlocked) {
    await setPipelinePhase(taskId, userId, 'DEPLOYMENT', {
      evidence: ['gates_passed'],
      data: { deployStage: 'ready_for_deploy', deploymentBlocked: false },
    });
    await pool.query(
      `UPDATE agent_tasks SET deploy_stage = 'ready_for_deploy' WHERE id = $1`,
      [taskId]
    );
  }

  const branchDiff = await captureBranchDiffSummary(repoRoot, taskId);
  if (branchDiff.changedFiles.length) {
    await mergeReliabilityJson(taskId, { branchDiff });
  }

  const pipelineState = await getPipelineState(taskId);
  const buildLogs = await import('./db').then((m) => m.listTaskLogs(taskId, 50));
  const terminalEvidence = buildLogs
    .filter((l) => l.event_type === 'tool_call')
    .map((l) => ({
      at: l.created_at,
      message: l.message,
      ok: (l.payload as { ok?: boolean })?.ok,
    }));

  await setPipelinePhase(taskId, userId, 'EVIDENCE', {
    evidence: [
      `build:${buildStatus}`,
      `verify:${verifyPassed}`,
      `regression:${regressionPassed}`,
      `files:${filesTouched.length}`,
    ],
    data: {
      filesChanged: filesTouched,
      buildOutput: (buildRes.output || buildRes.error || '').slice(0, 6000),
      verificationSection: verificationSection.slice(0, 4000),
      deploymentOutput: buildRes.ok && verifyPassed ? 'ready_for_deploy' : 'blocked',
      logsUsedAsEvidence: terminalEvidence.slice(0, 20),
      pipelinePhasesCompleted: Object.keys(pipelineState.phases || {}),
      confidence: { scores, pipelineConf, understanding: understanding.confidence },
    },
  });

  const report = [
    `# Engineering Agent Report`,
    ``,
    `## Pipeline`,
    `Phases completed: ${Object.keys(pipelineState.phases || {}).join(' → ')}`,
    `Understanding confidence: ${understanding.confidence}%`,
    `Implementation confidence: ${pipelineConf.implementationConfidence}%`,
    `Verification confidence: ${pipelineConf.verificationConfidence}%`,
    ``,
    `## Task understanding`,
    understanding.restatement,
    ``,
    `### Requirements`,
    ...understanding.requirements.map((r) => `- ${r}`),
    ``,
    `## Plan`,
    plan.summary,
    ``,
    `## Files modified`,
    filesTouched.length ? filesTouched.map((f) => `- ${f}`).join('\n') : '_none_',
    ``,
    `## Build`,
    buildRes.ok ? '✅' : '❌',
    '```',
    (buildRes.output || buildRes.error || '').slice(0, 4000),
    '```',
    verificationSection,
  ].join('\n');

  const taskComplete =
    buildRes.ok && verifyPassed && regressionPassed && !scores.deploymentBlocked;
  const finalStatus = taskComplete ? 'completed' : buildRes.ok ? 'verification_failed' : 'review';
  const finalPhase = taskComplete ? 'completed' : buildRes.ok ? 'verification_failed' : 'review';

  await updateTask(taskId, userId, {
    status: finalStatus,
    resultReport: report,
    filesTouched,
    completedAt: new Date(),
    errorMessage: taskComplete ? null : scores.blockReasons.join('; ') || 'Pipeline blocked',
  });
  await setTaskPhase(taskId, userId, finalPhase, {
    status: finalStatus,
    buildStatus,
    reasoningSummary: { ...reasoning, buildFixAttempts, finalDecision: report.slice(0, 500) },
    filesReadCount,
    filesWrittenCount,
  });
  await appendTaskLog(taskId, {
    eventType: taskComplete ? 'completed' : 'verification_failed',
    message: taskComplete ? 'Pipeline complete with evidence' : 'Pipeline blocked',
    payload: { buildStatus, verifyPassed, confidenceScore: scores.confidenceScore },
  });
}
