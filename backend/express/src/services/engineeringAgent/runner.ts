import { logger } from '../../config/logger';
import { getTask } from './db';
import { isVerificationExecutionMode } from './taskIntent';
import { runVerificationOnlyTask } from './verificationRunner';
import { runImplementationPipeline } from './executionPipeline';

const runningTasks = new Set<string>();

export async function runEngineeringTask(taskId: string, userId: number): Promise<void> {
  if (runningTasks.has(taskId)) return;
  runningTasks.add(taskId);

  try {
    const task = await getTask(taskId, userId);
    if (!task) return;

    if (task.execution_mode === 'verification' || isVerificationExecutionMode(task.prompt)) {
      await runVerificationOnlyTask(taskId, userId);
      return;
    }

    await runImplementationPipeline(taskId, userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Task failed';
    logger.error('Engineering task failed', { taskId, error: msg });
    const { updateTask } = await import('./db');
    const { setTaskPhase } = await import('./taskMonitor');
    const { appendTaskLog } = await import('./db');
    await updateTask(taskId, userId, {
      status: 'failed',
      errorMessage: msg,
      completedAt: new Date(),
    });
    await setTaskPhase(taskId, userId, 'failed', { status: 'failed', buildStatus: 'failed' });
    await appendTaskLog(taskId, { eventType: 'error', level: 'error', message: msg });
  } finally {
    runningTasks.delete(taskId);
  }
}

export function enqueueEngineeringTask(taskId: string, userId: number): void {
  setImmediate(() => {
    runEngineeringTask(taskId, userId).catch((e) =>
      logger.error('Engineering task runner crash', { taskId, error: e })
    );
  });
}
