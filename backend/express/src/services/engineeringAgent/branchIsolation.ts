import { exec } from 'child_process';
import { promisify } from 'util';
import { appendTaskLog } from './db';
import { pool } from '../../config/db_pg';

const execAsync = promisify(exec);

export function agentBranchName(taskId: string): string {
  return `agent/task-${taskId.replace(/-/g, '').slice(0, 12)}`;
}

export async function ensureAgentBranch(
  repoRoot: string,
  taskId: string
): Promise<{ branch: string; created: boolean; ok: boolean; output: string }> {
  const branch = agentBranchName(taskId);
  try {
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: repoRoot, timeout: 8000 });
  } catch {
    return { branch, created: false, ok: false, output: 'Not a git repository — branch isolation skipped' };
  }

  try {
    const { stdout: branches } = await execAsync('git branch --list', { cwd: repoRoot, timeout: 8000 });
    const exists = branches.split('\n').some((b) => b.replace(/^\*?\s*/, '').trim() === branch);
    if (exists) {
      await execAsync(`git checkout ${branch}`, { cwd: repoRoot, timeout: 15000 });
      await pool.query(
        `UPDATE agent_tasks SET agent_git_branch = $2, rollback_available = true, updated_at = NOW() WHERE id = $1`,
        [taskId, branch]
      );
      await appendTaskLog(taskId, {
        eventType: 'branch_isolation',
        message: `Checked out existing branch ${branch}`,
      });
      return { branch, created: false, ok: true, output: `checkout ${branch}` };
    }

    await execAsync(`git checkout -b ${branch}`, { cwd: repoRoot, timeout: 15000 });
    await pool.query(
      `UPDATE agent_tasks SET agent_git_branch = $2, rollback_available = true, updated_at = NOW() WHERE id = $1`,
      [taskId, branch]
    );
    await appendTaskLog(taskId, {
      eventType: 'branch_isolation',
      message: `Created and checked out branch ${branch}`,
      payload: { branch, created: true },
    });
    return { branch, created: true, ok: true, output: `created ${branch}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'git branch failed';
    await appendTaskLog(taskId, {
      eventType: 'branch_isolation',
      level: 'warn',
      message: msg,
    });
    return { branch, created: false, ok: false, output: msg };
  }
}

export async function captureBranchDiffSummary(
  repoRoot: string,
  taskId: string,
  baseRef = 'HEAD'
): Promise<{ diffStat: string; changedFiles: string[] }> {
  try {
    const diff = await execAsync(`git diff --stat ${baseRef}`, { cwd: repoRoot, timeout: 20000 });
    const nameOnly = await execAsync(`git diff --name-only ${baseRef}`, { cwd: repoRoot, timeout: 20000 });
    const changedFiles = nameOnly.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return { diffStat: diff.stdout.slice(0, 4000), changedFiles };
  } catch {
    return { diffStat: '', changedFiles: [] };
  }
}
