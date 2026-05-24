import { logger } from '../../config/logger';
import { appendTaskLog, getTask, updateTask } from './db';
import { setTaskPhase, type ReasoningSummary } from './taskMonitor';
import {
  buildVerificationReportSection,
  runPostDeployVerification,
  runPreDeployVerification,
} from './verificationPipeline';
import {
  detectTaskIntent,
  prefersProductionVerification,
  taskTypeLabel,
} from './taskIntent';
import { parseVerificationPromptTargets } from './verificationCriteria';
import { listArtifacts, listVerifications } from './verificationDb';

/**
 * Verification-only execution: no build, git, patches, or file writes.
 */
export async function runVerificationOnlyTask(taskId: string, userId: number): Promise<void> {
  const task = await getTask(taskId, userId);
  if (!task) return;

  const intent = detectTaskIntent(task.prompt);
  const reasoning: ReasoningSummary = {
    planningSummary: `Verification mode: ${taskTypeLabel(intent.taskType)}. No code changes or builds will run.`,
    executionPlanSummary: 'Execute browser, DOM, API, and bundle checks; collect evidence and screenshots.',
    buildFixAttempts: 0,
    finalDecision: 'Pending verification execution.',
  };

  try {
    await appendTaskLog(taskId, {
      eventType: 'verification_mode',
      message: `Execution mode: VERIFICATION (${intent.taskType})`,
      payload: { taskType: intent.taskType, executionMode: 'verification' },
    });

    await setTaskPhase(taskId, userId, 'planning', {
      status: 'planning',
      buildStatus: null,
      reasoningSummary: reasoning,
    });
    await updateTask(taskId, userId, {
      status: 'running',
      startedAt: new Date(),
      planJson: {
        mode: 'verification',
        taskType: intent.taskType,
        summary: reasoning.executionPlanSummary,
        targets: parseVerificationPromptTargets(task.prompt),
      },
    });

    await setTaskPhase(taskId, userId, 'verification_execution', {
      status: 'running',
      reasoningSummary: reasoning,
    });
    await appendTaskLog(taskId, {
      eventType: 'verification',
      message: 'Starting verification execution (browser, DOM, API, bundle)',
    });

    const useProduction = prefersProductionVerification(task.prompt);
    const verifyResult = useProduction
      ? await runPostDeployVerification({
          taskId,
          prompt: task.prompt,
          planSummary: reasoning.executionPlanSummary,
          filesTouched: [],
        })
      : await runPreDeployVerification({
          taskId,
          prompt: task.prompt,
          planSummary: reasoning.executionPlanSummary,
          filesTouched: [],
        });

    await setTaskPhase(taskId, userId, 'evidence_collection', { status: 'running' });
    const checks = await listVerifications(taskId);
    const artifacts = await listArtifacts(taskId);
    const hasEvidence = checks.length > 0;
    const hasScreenshots = artifacts.some((a) => a.artifact_type.startsWith('screenshot'));

    await appendTaskLog(taskId, {
      eventType: 'evidence_collection',
      message: `Collected ${checks.length} checks, ${artifacts.length} artifacts`,
      payload: { checks: checks.length, artifacts: artifacts.length, hasScreenshots },
    });

    const evidenceComplete = hasEvidence && (hasScreenshots || process.env.ENGINEERING_VERIFY_STRICT === 'false');
    const passed = verifyResult.passed && evidenceComplete;

    reasoning.finalDecision = passed
      ? 'Verification completed with evidence.'
      : !verifyResult.passed
        ? `Verification checks failed: ${verifyResult.failedChecks.join(', ')}`
        : 'Verification incomplete — evidence or screenshots missing.';

    const blockers = [
      ...verifyResult.failedChecks,
      ...(!hasEvidence ? ['no_verification_checks_recorded'] : []),
      ...(!hasScreenshots && process.env.ENGINEERING_VERIFY_STRICT !== 'false'
        ? ['screenshots_not_captured']
        : []),
    ];

    const findings = checks
      .filter((c) => c.status === 'failed')
      .map((c) => `- **${c.name}**: ${c.message || 'failed'}`)
      .join('\n');

    const report = [
      `# Verification Report`,
      ``,
      `_Mode: VERIFICATION ONLY — no build, git, or code changes._`,
      ``,
      `## Task`,
      task.prompt,
      ``,
      `## Task type`,
      intent.taskType,
      ``,
      `## Environment`,
      useProduction ? 'Production / live URL' : 'Pre-deploy / local URL',
      ``,
      `## Result`,
      passed ? '✅ **PASSED**' : verifyResult.passed ? '⚠️ **INCOMPLETE**' : '❌ **FAILED**',
      ``,
      findings ? `## Findings\n${findings}` : '',
      blockers.length ? `## Blockers\n${blockers.map((b) => `- ${b}`).join('\n')}` : '',
      ``,
      buildVerificationReportSection(verifyResult),
      ``,
      `## Evidence`,
      `- Checks recorded: ${checks.length}`,
      `- Artifacts: ${artifacts.length}`,
      `- Screenshots: ${hasScreenshots ? 'yes' : 'no'}`,
    ]
      .filter(Boolean)
      .join('\n');

    await setTaskPhase(taskId, userId, passed ? 'verification_completed' : 'verification_failed', {
      status: passed ? 'completed' : verifyResult.passed ? 'verification_incomplete' : 'verification_failed',
      buildStatus: null,
      reasoningSummary: reasoning,
    });

    await updateTask(taskId, userId, {
      status: passed ? 'completed' : verifyResult.passed ? 'verification_incomplete' : 'verification_failed',
      resultReport: report,
      filesTouched: [],
      completedAt: new Date(),
      errorMessage: passed
        ? null
        : verifyResult.passed
          ? 'Verification incomplete — evidence not fully collected'
          : `Verification failed: ${verifyResult.failedChecks.slice(0, 5).join(', ')}`,
    });

    await appendTaskLog(taskId, {
      eventType: passed ? 'verification_completed' : 'verification_incomplete',
      level: passed ? 'info' : 'error',
      message: reasoning.finalDecision || 'Verification finished',
      payload: { passed, evidenceComplete, mode: useProduction ? 'post_deploy' : 'pre_deploy' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Verification task failed';
    logger.error('Verification-only task failed', { taskId, error: msg });
    await updateTask(taskId, userId, {
      status: 'verification_incomplete',
      errorMessage: msg,
      completedAt: new Date(),
    });
    await setTaskPhase(taskId, userId, 'verification_failed', {
      status: 'verification_incomplete',
      buildStatus: null,
    });
    await appendTaskLog(taskId, { eventType: 'error', level: 'error', message: msg });
  }
}
