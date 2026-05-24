import { logger } from '../../config/logger';
import { appendTaskLog, getTaskById, updateTask } from './db';
import { setTaskPhase } from './taskMonitor';
import {
  buildSessionContext,
  detectContinueAction,
  ensureSessionForTask,
  extractBearerTokenFromMessage,
  getSessionByTaskId,
  insertSessionMessage,
  maybeCompressSessionSummary,
} from './taskSession';
import {
  runPostDeployVerification,
  runPreDeployVerification,
  buildVerificationReportSection,
} from './verificationPipeline';
import { prefersProductionVerification } from './taskIntent';
import { runVerificationOnlyTask } from './verificationRunner';
import { enqueueEngineeringTask } from './runner';
import { startProductionDeploy } from './deploymentService';

const continuingTasks = new Set<string>();

export function enqueueContinueTask(
  taskId: string,
  userId: number,
  message: string,
  actorUserId?: number
): void {
  setImmediate(() => {
    runContinueTask(taskId, userId, message, actorUserId).catch((e) =>
      logger.error('Continue task crash', { taskId, error: e })
    );
  });
}

export async function runContinueTask(
  taskId: string,
  userId: number,
  userMessage: string,
  actorUserId?: number
): Promise<void> {
  if (continuingTasks.has(taskId)) return;
  continuingTasks.add(taskId);

  try {
    const task = await getTaskById(taskId);
    if (!task || task.user_id !== userId) return;

    const session = await ensureSessionForTask(taskId, actorUserId ?? userId);
    await insertSessionMessage({
      sessionId: session.id,
      role: 'user',
      content: userMessage,
      metadata: { source: 'follow_up' },
    });

    await appendTaskLog(taskId, {
      eventType: 'session_continue',
      message: `Follow-up: ${userMessage.slice(0, 200)}`,
      payload: { action: 'pending' },
    });

    await updateTask(taskId, userId, {
      status: 'running',
      errorMessage: null,
      completedAt: undefined as unknown as Date,
    });
    await setTaskPhase(taskId, userId, 'planning', { status: 'running' });

    const action = detectContinueAction(userMessage, task);
    const context = await buildSessionContext(task);
    let assistantReply = '';
    let finalStatus = task.status;

    if (action === 'full_retry') {
      await insertSessionMessage({
        sessionId: session.id,
        role: 'assistant',
        content:
          'Retrying the full task from the beginning with the original prompt. Previous session context is preserved in this conversation.',
        metadata: { action: 'full_retry' },
      });
      enqueueEngineeringTask(taskId, userId);
      assistantReply = 'Full task retry queued. Watch Timeline and Activity for progress.';
      finalStatus = 'running';
    } else if (action === 'retry_verification' || action === 'retry_verification_with_token') {
      const token =
        action === 'retry_verification_with_token'
          ? extractBearerTokenFromMessage(userMessage)
          : null;
      if (token) {
        process.env.ENGINEERING_VERIFY_API_TOKEN = token;
      }

      await setTaskPhase(taskId, userId, 'verification_execution', { status: 'running' });
      await appendTaskLog(taskId, {
        eventType: 'verification',
        message: 'Follow-up: re-running verification with session context',
        payload: { hasToken: !!token },
      });

      const useProduction =
        prefersProductionVerification(task.prompt) ||
        prefersProductionVerification(userMessage) ||
        /production|admin jwt|admin token/i.test(userMessage);

      const verifyFn = useProduction ? runPostDeployVerification : runPreDeployVerification;
      const verifyResult = await verifyFn({
        taskId,
        prompt: `${task.prompt}\n\nFollow-up: ${userMessage}`,
        planSummary: context.slice(0, 3000),
        filesTouched: task.files_touched || [],
      });

      const section = buildVerificationReportSection(verifyResult);
      const passed = verifyResult.passed;
      finalStatus = passed ? 'completed' : 'verification_failed';

      await updateTask(taskId, userId, {
        status: finalStatus,
        resultReport: [task.result_report || '', section].filter(Boolean).join('\n\n'),
        completedAt: new Date(),
        errorMessage: passed ? null : `Verification failed: ${verifyResult.failedChecks.join(', ')}`,
      });
      await setTaskPhase(taskId, userId, passed ? 'completed' : 'verification_failed', {
        status: finalStatus,
      });

      assistantReply = [
        `## Verification re-run (${passed ? 'PASSED' : 'FAILED'})`,
        '',
        token ? 'Used admin JWT from your message for authenticated checks.' : 'No JWT in message — used server ENGINEERING_VERIFY_API_TOKEN if configured.',
        '',
        passed
          ? 'All checks passed. Task can proceed to deploy when other gates allow.'
          : `Failed checks: ${verifyResult.failedChecks.join(', ')}`,
        '',
        section,
      ].join('\n');
    } else if (action === 'deploy') {
      try {
        const { deploymentId } = await startProductionDeploy(taskId, {
          userId: actorUserId ?? userId,
          email: 'session-continue',
        });
        assistantReply = `Deployment started. Deployment ID: \`${deploymentId}\`. See Deployments tab for status.`;
        finalStatus = 'completed';
      } catch (err: unknown) {
        assistantReply = `Deployment failed: ${err instanceof Error ? err.message : 'unknown error'}`;
        finalStatus = 'review';
      }
      await updateTask(taskId, userId, {
        status: finalStatus,
        completedAt: new Date(),
        errorMessage: finalStatus === 'review' ? assistantReply : null,
      });
    } else {
      const executionMode = task.execution_mode || 'implementation';
      if (executionMode === 'verification' || /\b(verify|verification|audit)\b/i.test(userMessage)) {
        await runVerificationOnlyTask(taskId, userId);
        const updated = await getTaskById(taskId);
        assistantReply = [
          '## Continued verification',
          '',
          `Status: ${updated?.status}`,
          `Verification: ${(updated as { verification_status?: string })?.verification_status || 'n/a'}`,
          '',
          (updated?.result_report || '').slice(-3000),
        ].join('\n');
        finalStatus = updated?.status || task.status;
      } else {
        const { processEngineeringAI } = await import('./engineeringAI');
        const planRes = await processEngineeringAI({
          engineeringTask: 'continue_investigation',
          prompt: [
            'You are continuing an existing engineering task. Do NOT restart from scratch.',
            'Given the session context and follow-up instruction, respond with:',
            '1) What you will do next (minimal scope)',
            '2) Whether to re-run verification, fix build, or investigate only',
            '',
            'Follow-up instruction:',
            userMessage,
            '',
            context.slice(0, 12000),
          ].join('\n'),
          userId,
          taskId,
          overrides: { plainText: true, maxTokens: 2000 },
        });
        const planText = planRes.response || '';

        if (/re-?verify|verification|screenshot|dom|bundle/i.test(userMessage + planText)) {
          const verifyResult = await runPreDeployVerification({
            taskId,
            prompt: task.prompt,
            planSummary: planText,
            filesTouched: task.files_touched || [],
          });
          assistantReply = [
            '## Investigation + verification',
            '',
            planText.slice(0, 2000),
            '',
            buildVerificationReportSection(verifyResult),
          ].join('\n');
          finalStatus = verifyResult.passed ? 'completed' : 'verification_failed';
          await updateTask(taskId, userId, {
            status: finalStatus,
            completedAt: new Date(),
            errorMessage: verifyResult.passed
              ? null
              : `Verification failed: ${verifyResult.failedChecks.join(', ')}`,
          });
        } else {
          assistantReply = [
            '## Continue — investigation',
            '',
            planText,
            '',
            '_To apply code changes, send a specific fix instruction or use Retry for a full re-run._',
          ].join('\n');
          finalStatus = task.status === 'failed' ? 'review' : task.status;
          await updateTask(taskId, userId, {
            status: finalStatus,
            completedAt: new Date(),
          });
        }
      }
      await setTaskPhase(taskId, userId, finalStatus === 'completed' ? 'completed' : 'review', {
        status: finalStatus,
      });
    }

    await insertSessionMessage({
      sessionId: session.id,
      role: 'assistant',
      content: assistantReply,
      metadata: { action, finalStatus },
    });

    await appendTaskLog(taskId, {
      eventType: 'session_continue',
      message: `Follow-up completed (${action})`,
      payload: { action, finalStatus },
    });

    await maybeCompressSessionSummary(session.id, task);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Continue failed';
    logger.error('Continue task failed', { taskId, error: msg });
    const task = await getTaskById(taskId);
    if (task) {
      const session = await getSessionByTaskId(taskId);
      if (session) {
        await insertSessionMessage({
          sessionId: session.id,
          role: 'assistant',
          content: `Continue failed: ${msg}`,
          metadata: { error: true },
        });
      }
      await updateTask(taskId, task.user_id, {
        status: 'failed',
        errorMessage: msg,
        completedAt: new Date(),
      });
    }
  } finally {
    continuingTasks.delete(taskId);
  }
}
