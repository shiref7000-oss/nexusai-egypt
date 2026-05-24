import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { env, getDatabaseUrlForShell } from '../../config/env';
import { logger } from '../../config/logger';
import {
  appendDeploymentLog,
  createBackupRecord,
  createDeployment,
  getBackup,
  getDeployment,
  getDeploymentLogs,
  getLatestRunningDeployment,
  getTaskForDeploy,
  linkBackupToDeployment,
  listDeployments,
  setTaskDeployStage,
  updateDeployment,
} from './deploymentDb';
import { canDeployToProduction, type DeployStage } from './deployStages';
import { appendTaskLog } from './db';

const execAsync = promisify(exec);

export type CommandLogEntry = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  at: string;
};

export type HealthCheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
  at: string;
};

function deployConfig() {
  const apiDir = process.env.ENGINEERING_DEPLOY_API_DIR || '/var/www/nexusai-api';
  const frontDir = process.env.ENGINEERING_DEPLOY_FRONT_DIR || '/var/www/nexusai-frontend';
  const repoRoot =
    process.env.ENGINEERING_DEPLOY_REPO_ROOT ||
    env.ENGINEERING_REPO_ROOT ||
    process.cwd().replace(/\/backend\/express.*$/, '');
  const backupRoot = process.env.ENGINEERING_DEPLOY_BACKUP_ROOT || '/var/backups/nexusai';
  const pm2Name = process.env.ENGINEERING_DEPLOY_PM2_NAME || 'nexusai-api';
  const publicUrl = process.env.ENGINEERING_DEPLOY_PUBLIC_URL || env.API_BASE_URL || 'http://127.0.0.1:3001';
  const enabled =
    process.env.ENGINEERING_DEPLOY_ENABLED === 'true' ||
    (env.NODE_ENV === 'production' && process.env.ENGINEERING_DEPLOY_ENABLED !== 'false');
  const dryRun = process.env.ENGINEERING_DEPLOY_DRY_RUN === 'true';
  return { apiDir, frontDir, repoRoot, backupRoot, pm2Name, publicUrl, enabled, dryRun };
}

async function runShell(
  deploymentId: string,
  command: string,
  commandsLog: CommandLogEntry[],
  cwd?: string
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const cfg = deployConfig();
  await appendDeploymentLog(deploymentId, 'info', `Executing: ${command}`, { cwd: cwd || cfg.repoRoot });

  if (cfg.dryRun) {
    let mockStdout = '[DRY_RUN] skipped';
    if (command.includes('/health/ready')) mockStdout = '{"ready":true}';
    else if (command.includes('/health/runtime')) mockStdout = '{"success":true}';
    else if (command.includes('curl -sfI')) mockStdout = 'HTTP/1.1 200 OK';
    const entry: CommandLogEntry = {
      command,
      exitCode: 0,
      stdout: mockStdout,
      stderr: '',
      at: new Date().toISOString(),
    };
    commandsLog.push(entry);
    return { ok: true, stdout: entry.stdout, stderr: '' };
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || cfg.repoRoot,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 600_000,
      env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
    });
    const entry: CommandLogEntry = {
      command,
      exitCode: 0,
      stdout: (stdout || '').slice(0, 8000),
      stderr: (stderr || '').slice(0, 4000),
      at: new Date().toISOString(),
    };
    commandsLog.push(entry);
    return { ok: true, stdout: entry.stdout, stderr: entry.stderr };
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    const entry: CommandLogEntry = {
      command,
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: (e.stdout || '').slice(0, 8000),
      stderr: (e.stderr || e.message || 'Command failed').slice(0, 4000),
      at: new Date().toISOString(),
    };
    commandsLog.push(entry);
    return { ok: false, stdout: entry.stdout, stderr: entry.stderr };
  }
}

async function createPreDeployBackups(
  deploymentId: string,
  taskId: string,
  stamp: string,
  commandsLog: CommandLogEntry[],
  admin: { userId: number | null; email: string }
): Promise<{ backupId: string; appPath: string | null; dbPath: string | null }> {
  const cfg = deployConfig();
  const dest = join(cfg.backupRoot, 'engineering-agent', stamp);
  mkdirSync(dest, { recursive: true });

  const appPath = join(dest, 'app-snapshot');
  const dbPath = join(dest, 'postgres.sql.gz');

  await appendDeploymentLog(deploymentId, 'info', 'Creating application backup');
  const appCmd = `mkdir -p "${appPath}" && cp -a "${cfg.apiDir}/dist" "${appPath}/api-dist" 2>/dev/null || true && cp -a "${cfg.frontDir}/index.html" "${appPath}/index.html" 2>/dev/null || true && cp -a "${cfg.frontDir}/assets" "${appPath}/fe-assets" 2>/dev/null || true`;
  const appRes = await runShell(deploymentId, appCmd, commandsLog);
  if (!appRes.ok) throw new Error('Application backup failed');

  await appendDeploymentLog(deploymentId, 'info', 'Creating database backup');
  const dbUrl = getDatabaseUrlForShell();
  const dbCmd = `pg_dump "${dbUrl.replace(/"/g, '\\"')}" | gzip -9 > "${dbPath}"`;
  const dbRes = await runShell(deploymentId, dbCmd, commandsLog);
  if (!dbRes.ok) throw new Error('Database backup failed');

  const metadata = {
    stamp,
    hostname: process.env.HOSTNAME || 'unknown',
    apiDir: cfg.apiDir,
    frontDir: cfg.frontDir,
    repoRoot: cfg.repoRoot,
    createdAt: new Date().toISOString(),
  };

  const backupId = await createBackupRecord({
    taskId,
    deploymentId,
    stamp,
    appBackupPath: appPath,
    dbBackupPath: dbPath,
    metadata,
    createdByUserId: admin.userId,
    createdByEmail: admin.email,
  });

  return { backupId, appPath, dbPath };
}

async function runHealthChecks(
  deploymentId: string,
  commandsLog: CommandLogEntry[]
): Promise<HealthCheckResult[]> {
  const cfg = deployConfig();
  const checks: HealthCheckResult[] = [];
  const at = () => new Date().toISOString();

  const localReady = await runShell(
    deploymentId,
    'curl -sf http://127.0.0.1:3001/health/ready',
    commandsLog
  );
  checks.push({
    name: 'api_health_ready',
    ok: localReady.ok && localReady.stdout.includes('"ready":true'),
    detail: localReady.stdout.slice(0, 500) || localReady.stderr,
    at: at(),
  });

  const localRuntime = await runShell(
    deploymentId,
    'curl -sf http://127.0.0.1:3001/health/runtime',
    commandsLog
  );
  checks.push({
    name: 'api_health_runtime',
    ok: localRuntime.ok && localRuntime.stdout.includes('"success":true'),
    detail: localRuntime.stdout.slice(0, 500) || localRuntime.stderr,
    at: at(),
  });

  const feCheck = await runShell(
    deploymentId,
    `curl -sfI "${cfg.publicUrl.replace(/\/$/, '')}/" | head -n 1`,
    commandsLog
  );
  checks.push({
    name: 'frontend_availability',
    ok: feCheck.ok && /HTTP\/\d\.\d\s+[23]/.test(feCheck.stdout),
    detail: feCheck.stdout.trim() || feCheck.stderr,
    at: at(),
  });

  const apiPublic = await runShell(
    deploymentId,
    `curl -sf "${cfg.publicUrl.replace(/\/$/, '')}/health/ready"`,
    commandsLog
  );
  checks.push({
    name: 'public_api_availability',
    ok: apiPublic.ok,
    detail: apiPublic.stdout.slice(0, 500) || apiPublic.stderr,
    at: at(),
  });

  return checks;
}

export async function syncDeployStageOnBuildStart(taskId: string): Promise<void> {
  await setTaskDeployStage(taskId, 'build');
}

export async function syncDeployStageOnTaskComplete(
  taskId: string,
  buildPassed: boolean
): Promise<void> {
  if (!buildPassed) {
    await setTaskDeployStage(taskId, null);
    return;
  }
  await setTaskDeployStage(taskId, 'verification');
  await appendTaskLog(taskId, {
    eventType: 'deploy_stage',
    message: 'Verification complete — ready for admin deploy',
    payload: { deployStage: 'ready_for_deploy' },
  });
  await setTaskDeployStage(taskId, 'ready_for_deploy');
}

export function mapDeploymentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    taskStatus: row.task_status,
    taskBuildStatus: row.task_build_status,
    status: row.status,
    deployStage: row.deploy_stage,
    startedByUserId: row.started_by_user_id,
    startedByEmail: row.started_by_email,
    backupId: row.backup_id,
    healthChecks: row.health_checks || [],
    commandsLog: row.commands_log || [],
    errorMessage: row.error_message,
    rollbackOfDeploymentId: row.rollback_of_deployment_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export async function getDeploymentsList(limit = 50, offset = 0) {
  const rows = await listDeployments(limit, offset);
  return rows.map((r) => mapDeploymentRow(r as Record<string, unknown>));
}

export async function getDeploymentDetail(id: string) {
  const dep = await getDeployment(id);
  if (!dep) return null;
  const logs = await getDeploymentLogs(id);
  let backup: {
    id: string;
    stamp: string;
    appBackupPath: string | null;
    dbBackupPath: string | null;
    metadata: unknown;
    createdByEmail: string;
    createdAt: Date;
  } | null = null;
  if (dep.backup_id) {
    const b = await getBackup(dep.backup_id);
    if (b) {
      backup = {
        id: b.id,
        stamp: b.stamp,
        appBackupPath: b.app_backup_path,
        dbBackupPath: b.db_backup_path,
        metadata: b.metadata,
        createdByEmail: b.created_by_email,
        createdAt: b.created_at,
      };
    }
  }
  return {
    deployment: mapDeploymentRow(dep as Record<string, unknown>),
    logs: logs.map((l) => ({
      id: l.id,
      level: l.level,
      message: l.message,
      payload: l.payload,
      createdAt: l.created_at,
    })),
    backup,
  };
}

export async function getCurrentDeploymentStatus() {
  const running = await getLatestRunningDeployment();
  const recent = await listDeployments(1, 0);
  return {
    running: running ? mapDeploymentRow(running as Record<string, unknown>) : null,
    latest: recent[0] ? mapDeploymentRow(recent[0] as Record<string, unknown>) : null,
  };
}

export async function startProductionDeploy(
  taskId: string,
  admin: { userId: number | null; email: string }
): Promise<{ deploymentId: string }> {
  const cfg = deployConfig();
  if (!cfg.enabled && !cfg.dryRun) {
    throw new Error(
      'Production deployment is disabled. Set ENGINEERING_DEPLOY_ENABLED=true on the API server.'
    );
  }

  const existing = await getLatestRunningDeployment();
  if (existing) {
    throw new Error('Another deployment is already in progress');
  }

  const task = await getTaskForDeploy(taskId);
  if (!task) throw new Error('Task not found');
  if (!canDeployToProduction(task)) {
    throw new Error(
      'Task must be completed with a passed build and deploy stage ready_for_deploy before deploying'
    );
  }

  const deploymentId = crypto.randomUUID();
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const commandsLog: CommandLogEntry[] = [];
  let healthChecks: HealthCheckResult[] = [];

  await createDeployment({
    id: deploymentId,
    taskId,
    startedByUserId: admin.userId,
    startedByEmail: admin.email,
    deployStage: 'deploying',
  });
  await setTaskDeployStage(taskId, 'deploying');
  await appendDeploymentLog(deploymentId, 'info', 'Deployment started', {
    startedBy: admin.email,
    taskId,
  });

  try {
    const { backupId } = await createPreDeployBackups(
      deploymentId,
      taskId,
      stamp,
      commandsLog,
      admin
    );
    await updateDeployment(deploymentId, { backupId });
    await linkBackupToDeployment(backupId, deploymentId);

    const backendSrc = join(cfg.repoRoot, 'backend/express');
    const feSrc = join(cfg.repoRoot, 'saas-frontend');

    await appendDeploymentLog(deploymentId, 'info', 'Deploying backend build');
    const beSteps = [
      `rsync -a --delete "${backendSrc}/src/" "${cfg.apiDir}/src/"`,
      `cp "${backendSrc}/package.json" "${cfg.apiDir}/package.json"`,
      `cp "${backendSrc}/tsconfig.json" "${cfg.apiDir}/tsconfig.json" 2>/dev/null || true`,
      `cd "${cfg.apiDir}" && npm install --omit=dev 2>/dev/null || npm install`,
      `cd "${cfg.apiDir}" && npm run build`,
      `cd "${cfg.apiDir}" && npm run migrate`,
    ];
    for (const cmd of beSteps) {
      const res = await runShell(deploymentId, cmd, commandsLog, cfg.apiDir);
      if (!res.ok) throw new Error(`Backend deploy failed: ${cmd}`);
    }

    await appendDeploymentLog(deploymentId, 'info', 'Restarting application services');
    const restart = await runShell(
      deploymentId,
      `pm2 restart ${cfg.pm2Name} || pm2 restart nexusai-backend`,
      commandsLog
    );
    if (!restart.ok) throw new Error('Failed to restart API process');

    await runShell(deploymentId, 'sleep 3', commandsLog);

    await appendDeploymentLog(deploymentId, 'info', 'Deploying frontend build');
    const feSteps = [
      `cd "${feSrc}" && npm install`,
      `cd "${feSrc}" && npm run build`,
      `rsync -a "${feSrc}/dist/assets/" "${cfg.frontDir}/assets/"`,
      `cp "${feSrc}/dist/index.html" "${cfg.frontDir}/index.html"`,
    ];
    for (const cmd of feSteps) {
      const res = await runShell(deploymentId, cmd, commandsLog, feSrc);
      if (!res.ok) throw new Error(`Frontend deploy failed: ${cmd}`);
    }

    await appendDeploymentLog(deploymentId, 'info', 'Running health checks');
    healthChecks = await runHealthChecks(deploymentId, commandsLog);
    const allOk = healthChecks.every((h) => h.ok);
    if (!allOk) {
      const failed = healthChecks.filter((h) => !h.ok).map((h) => h.name);
      throw new Error(`Health checks failed: ${failed.join(', ')}`);
    }

    await updateDeployment(deploymentId, {
      status: 'success',
      healthChecks,
      commandsLog,
      completedAt: new Date(),
    });
    await appendTaskLog(taskId, {
      eventType: 'deployed',
      message: `Deployed to production by ${admin.email}`,
      payload: { deploymentId },
    });
    await appendDeploymentLog(deploymentId, 'info', 'Running post-deploy validation');
    const { runPostDeployVerification } = await import('./verificationPipeline');
    const taskRow = await getTaskForDeploy(taskId);
    const postVerify = await runPostDeployVerification({
      taskId,
      prompt: taskRow?.prompt || '',
      planSummary: (taskRow?.plan_json as { summary?: string } | null)?.summary,
      filesTouched: (taskRow?.files_touched as string[]) || [],
    });
    if (!postVerify.passed) {
      await setTaskDeployStage(taskId, 'deploy_failed');
      throw new Error(`Post-deploy validation failed: ${postVerify.failedChecks.join(', ')}`);
    }
    await setTaskDeployStage(taskId, 'deployed');
    await appendDeploymentLog(deploymentId, 'info', 'Deployment completed successfully');

    return { deploymentId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Deployment failed';
    logger.error('Engineering deployment failed', { deploymentId, taskId, error: msg });
    await updateDeployment(deploymentId, {
      status: 'failed',
      healthChecks,
      commandsLog,
      errorMessage: msg,
      completedAt: new Date(),
    });
    await setTaskDeployStage(taskId, 'deploy_failed');
    await appendDeploymentLog(deploymentId, 'error', msg);
    throw err;
  }
}

export async function rollbackDeployment(
  deploymentId: string,
  admin: { userId: number | null; email: string }
): Promise<{ rollbackDeploymentId: string }> {
  const cfg = deployConfig();
  if (!cfg.enabled && !cfg.dryRun) {
    throw new Error('Production deployment/rollback is disabled on this server');
  }

  const source = await getDeployment(deploymentId);
  if (!source) throw new Error('Deployment not found');
  if (!source.backup_id) throw new Error('No backup associated with this deployment');

  const backup = await getBackup(source.backup_id);
  if (!backup) throw new Error('Backup record not found');

  const rollbackId = crypto.randomUUID();
  const commandsLog: CommandLogEntry[] = [];
  let healthChecks: HealthCheckResult[] = [];

  await createDeployment({
    id: rollbackId,
    taskId: source.task_id,
    startedByUserId: admin.userId,
    startedByEmail: admin.email,
    deployStage: 'deploying',
  });
  await poolUpdateRollbackMeta(rollbackId, deploymentId);
  await appendDeploymentLog(rollbackId, 'info', `Rollback started for deployment ${deploymentId}`, {
    startedBy: admin.email,
  });

  try {
    const appPath = backup.app_backup_path as string | null;
    const dbPath = backup.db_backup_path as string | null;

    if (appPath && existsSync(appPath)) {
      await appendDeploymentLog(rollbackId, 'info', 'Restoring application backup');
      const restoreApp = `cp -a "${appPath}/api-dist" "${cfg.apiDir}/dist" 2>/dev/null || true && cp "${appPath}/index.html" "${cfg.frontDir}/index.html" 2>/dev/null || true && rsync -a "${appPath}/fe-assets/" "${cfg.frontDir}/assets/" 2>/dev/null || true`;
      const r = await runShell(rollbackId, restoreApp, commandsLog);
      if (!r.ok) throw new Error('Application restore failed');
    }

    if (dbPath && existsSync(dbPath)) {
      await appendDeploymentLog(rollbackId, 'info', 'Restoring database backup');
      const dbUrl = getDatabaseUrlForShell();
      const restoreDb = `gunzip -c "${dbPath}" | psql "${dbUrl.replace(/"/g, '\\"')}"`;
      const r = await runShell(rollbackId, restoreDb, commandsLog);
      if (!r.ok) throw new Error('Database restore failed');
    }

    await appendDeploymentLog(rollbackId, 'info', 'Restarting services after rollback');
    const restart = await runShell(
      rollbackId,
      `pm2 restart ${cfg.pm2Name} || pm2 restart nexusai-backend`,
      commandsLog
    );
    if (!restart.ok) throw new Error('Service restart failed after rollback');

    await runShell(rollbackId, 'sleep 3', commandsLog);
    healthChecks = await runHealthChecks(rollbackId, commandsLog);
    const allOk = healthChecks.every((h) => h.ok);
    if (!allOk) throw new Error('Post-rollback health checks failed');

    await updateDeployment(rollbackId, {
      status: 'rolled_back',
      healthChecks,
      commandsLog,
      completedAt: new Date(),
    });
    await updateDeployment(deploymentId, { status: 'rolled_back' });
    await setTaskDeployStage(source.task_id, 'ready_for_deploy');
    await appendDeploymentLog(rollbackId, 'info', 'Rollback completed successfully');

    return { rollbackDeploymentId: rollbackId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Rollback failed';
    await updateDeployment(rollbackId, {
      status: 'failed',
      healthChecks,
      commandsLog,
      errorMessage: msg,
      completedAt: new Date(),
    });
    await appendDeploymentLog(rollbackId, 'error', msg);
    throw err;
  }
}

async function poolUpdateRollbackMeta(rollbackId: string, sourceDeploymentId: string) {
  const { pool } = await import('../../config/db_pg');
  await pool.query(
    `UPDATE engineering_deployments SET rollback_of_deployment_id = $2 WHERE id = $1`,
    [rollbackId, sourceDeploymentId]
  );
}
