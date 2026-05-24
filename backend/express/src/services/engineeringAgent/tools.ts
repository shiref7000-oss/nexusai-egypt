import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  assertDeleteAllowed,
  assertPathInRepo,
  assertTerminalCommandAllowed,
  resolveRepoRoot,
} from './safety';
import { appendTaskLog } from './db';
import { isProtectedFile, taskTargetsEngineeringInfra } from './protectedFiles';

const execAsync = promisify(exec);

export type ToolResult = {
  ok: boolean;
  tool: string;
  output?: string;
  error?: string;
  data?: unknown;
};

async function logTool(
  taskId: string | null,
  tool: string,
  input: Record<string, unknown>,
  result: ToolResult
): Promise<void> {
  if (!taskId) return;
  await appendTaskLog(taskId, {
    eventType: 'tool_call',
    message: `${tool}: ${result.ok ? 'ok' : 'error'}`,
    payload: { tool, input, ok: result.ok, error: result.error, outputPreview: String(result.output || '').slice(0, 2000) },
  });
}

export async function readFile(
  repoRoot: string,
  filePath: string,
  taskId: string | null = null
): Promise<ToolResult> {
  try {
    const abs = assertPathInRepo(repoRoot, filePath);
    const content = await fs.readFile(abs, 'utf8');
    const result = { ok: true, tool: 'read_file', output: content, data: { path: filePath, size: content.length } };
    await logTool(taskId, 'read_file', { path: filePath }, result);
    return result;
  } catch (e: unknown) {
    const result = { ok: false, tool: 'read_file', error: e instanceof Error ? e.message : 'read failed' };
    await logTool(taskId, 'read_file', { path: filePath }, result);
    return result;
  }
}

export type WriteGuardOptions = { taskPrompt?: string };

function assertWriteAllowed(filePath: string, options?: WriteGuardOptions): void {
  const allowInfra = options?.taskPrompt ? taskTargetsEngineeringInfra(options.taskPrompt) : false;
  if (isProtectedFile(filePath, allowInfra)) {
    throw new Error(
      `Protected file blocked: ${filePath}. Task must explicitly target Engineering Agent infrastructure to modify this path.`
    );
  }
}

export async function writeFile(
  repoRoot: string,
  filePath: string,
  content: string,
  taskId: string | null = null,
  options?: WriteGuardOptions
): Promise<ToolResult> {
  try {
    assertWriteAllowed(filePath, options);
    const abs = assertPathInRepo(repoRoot, filePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
    const result = { ok: true, tool: 'write_file', data: { path: filePath, bytes: content.length } };
    await logTool(taskId, 'write_file', { path: filePath }, result);
    return result;
  } catch (e: unknown) {
    const result = { ok: false, tool: 'write_file', error: e instanceof Error ? e.message : 'write failed' };
    await logTool(taskId, 'write_file', { path: filePath }, result);
    return result;
  }
}

export async function createFile(
  repoRoot: string,
  filePath: string,
  content: string,
  taskId: string | null = null,
  options?: WriteGuardOptions
): Promise<ToolResult> {
  try {
    assertWriteAllowed(filePath, options);
    const abs = assertPathInRepo(repoRoot, filePath);
    if (
      await fs
        .access(abs)
        .then(() => true)
        .catch(() => false)
    ) {
      throw new Error('File already exists — use write_file to overwrite');
    }
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
    const result = { ok: true, tool: 'create_file', data: { path: filePath } };
    await logTool(taskId, 'create_file', { path: filePath }, result);
    return result;
  } catch (e: unknown) {
    const result = { ok: false, tool: 'create_file', error: e instanceof Error ? e.message : 'create failed' };
    await logTool(taskId, 'create_file', { path: filePath }, result);
    return result;
  }
}

export async function deleteFile(
  repoRoot: string,
  filePath: string,
  taskId: string | null = null
): Promise<ToolResult> {
  try {
    assertDeleteAllowed(repoRoot, filePath);
    const abs = assertPathInRepo(repoRoot, filePath);
    await fs.unlink(abs);
    const result = { ok: true, tool: 'delete_file', data: { path: filePath } };
    await logTool(taskId, 'delete_file', { path: filePath }, result);
    return result;
  } catch (e: unknown) {
    const result = { ok: false, tool: 'delete_file', error: e instanceof Error ? e.message : 'delete failed' };
    await logTool(taskId, 'delete_file', { path: filePath }, result);
    return result;
  }
}

export async function listDirectory(
  repoRoot: string,
  dirPath: string,
  taskId: string | null = null
): Promise<ToolResult> {
  try {
    const abs = assertPathInRepo(repoRoot, dirPath || '.');
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .slice(0, 200)
      .map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
    const result = { ok: true, tool: 'list_directory', data: { path: dirPath || '.', items } };
    await logTool(taskId, 'list_directory', { path: dirPath }, result);
    return result;
  } catch (e: unknown) {
    const result = { ok: false, tool: 'list_directory', error: e instanceof Error ? e.message : 'list failed' };
    await logTool(taskId, 'list_directory', { path: dirPath }, result);
    return result;
  }
}

export async function runTerminal(
  repoRoot: string,
  command: string,
  taskId: string | null = null
): Promise<ToolResult> {
  try {
    assertTerminalCommandAllowed(command);
    const root = resolveRepoRoot(repoRoot);
    const { stdout, stderr } = await execAsync(command, {
      cwd: root,
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, CI: 'true' },
    });
    const output = [stdout, stderr].filter(Boolean).join('\n');
    const result = { ok: true, tool: 'run_terminal', output, data: { command } };
    await logTool(taskId, 'run_terminal', { command }, result);
    return result;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = [err.stdout, err.stderr].filter(Boolean).join('\n');
    const result = {
      ok: false,
      tool: 'run_terminal',
      error: err.message || 'command failed',
      output,
      data: { command },
    };
    await logTool(taskId, 'run_terminal', { command }, result);
    return result;
  }
}

export async function gitStatus(repoRoot: string, taskId: string | null = null): Promise<ToolResult> {
  return runTerminal(repoRoot, 'git status --short', taskId);
}

export async function gitDiff(repoRoot: string, taskId: string | null = null): Promise<ToolResult> {
  return runTerminal(repoRoot, 'git diff --stat', taskId);
}
