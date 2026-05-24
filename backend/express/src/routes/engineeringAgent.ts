import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { env } from '../config/env';
import {
  createTask,
  getTask,
  listTasks,
  listTaskLogs,
  listMemory,
  upsertMemory,
  seedPlatformMemory,
} from '../services/engineeringAgent/db';
import { enqueueEngineeringTask } from '../services/engineeringAgent/runner';
import { indexRepository, searchCode } from '../services/engineeringAgent/codeIndex';
import { resolveRepoRoot } from '../services/engineeringAgent/safety';
import {
  readFile,
  writeFile,
  listDirectory,
  runTerminal,
  gitDiff,
  gitStatus,
} from '../services/engineeringAgent/tools';
import { processAIRequest } from '../services/ai';
import { paramStr } from '../utils/httpParam';

const router = Router();

function requirePgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

function detectRepoRoot(): string {
  const configured = env.ENGINEERING_REPO_ROOT;
  if (configured) return resolveRepoRoot(configured);
  const cwd = process.cwd();
  if (cwd.includes('backend/express')) {
    return resolveRepoRoot(cwd.replace(/\/backend\/express.*$/, ''));
  }
  return resolveRepoRoot(cwd);
}

router.use(authenticate);

router.get('/status', async (_req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: {
      enabled: env.ENGINEERING_AGENT_ENABLED,
      repoRoot: detectRepoRoot(),
      phase: 1,
      agent: 'developer',
    },
  });
});

/** Natural language chat — creates a task and starts the developer agent. */
router.post('/chat', [
  body('message').trim().isLength({ min: 3, max: 8000 }),
  body('title').optional().trim().isLength({ max: 500 }),
], async (req: AuthenticatedRequest, res) => {
  if (!env.ENGINEERING_AGENT_ENABLED) {
    return res.status(503).json({ success: false, error: 'Engineering agent is disabled' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });

  const repoRoot = detectRepoRoot();
  const message = String(req.body.message);
  const title = String(req.body.title || message.slice(0, 80));

  const task = await createTask(userId, { title, prompt: message, repoRoot });
  enqueueEngineeringTask(task.id, userId);

  res.status(201).json({
    success: true,
    data: {
      taskId: task.id,
      status: task.status,
      message: 'Task queued. Track progress in Tasks and Activity.',
    },
  });
});

/** Quick Gemini Q&A without running full tool pipeline. */
router.post('/ask', [
  body('message').trim().isLength({ min: 1, max: 4000 }),
], async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });

  const repoRoot = detectRepoRoot();
  const hits = await searchCode(repoRoot, req.body.message, 5);
  const context = hits.map((h: { file_path: string; summary: string }) => `- ${h.file_path}: ${h.summary}`).join('\n');

  const result = await processAIRequest({
    agent: 'engineering',
    prompt: `${req.body.message}\n\nRelevant files:\n${context || '(run Reindex first)'}`,
    userId,
    overrides: { plainText: true, responseVerbosity: 'balanced', maxTokens: 2000 },
  });

  res.json({ success: true, data: { response: result.response, provider: result.provider } });
});

router.get('/tasks', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const tasks = await listTasks(userId);
  res.json({ success: true, data: tasks });
});

router.get('/tasks/:id', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const task = await getTask(paramStr(req.params.id), userId);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
  res.json({ success: true, data: task });
});

router.get('/tasks/:id/logs', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const task = await getTask(paramStr(req.params.id), userId);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
  const logs = await listTaskLogs(task.id);
  res.json({ success: true, data: logs });
});

router.post('/tasks/:id/retry', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  if (!userId) return res.status(400).json({ success: false, error: 'Account not linked' });
  const task = await getTask(paramStr(req.params.id), userId);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
  enqueueEngineeringTask(task.id, userId);
  res.json({ success: true, data: { taskId: task.id, status: 'pending' } });
});

router.get('/memory', async (req: AuthenticatedRequest, res) => {
  const userId = requirePgUserId(req);
  const scope = (req.query.scope as string) || 'platform';
  const rows = await listMemory(scope as 'platform' | 'user' | 'project', userId || undefined);
  res.json({ success: true, data: rows });
});

router.post('/memory', [
  body('category').trim().isLength({ min: 1, max: 64 }),
  body('key').trim().isLength({ min: 1, max: 255 }),
  body('content').trim().isLength({ min: 1, max: 8000 }),
], async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });
  const userId = requirePgUserId(req);
  const row = await upsertMemory({
    scope: req.body.scope || 'user',
    userId: userId || undefined,
    category: req.body.category,
    key: req.body.key,
    content: req.body.content,
    metadata: req.body.metadata,
  });
  res.json({ success: true, data: row });
});

router.post('/index', requireRole('admin', 'superadmin'), async (req: AuthenticatedRequest, res) => {
  const repoRoot = detectRepoRoot();
  const result = await indexRepository(repoRoot, null);
  res.json({ success: true, data: result });
});

router.post('/seed-memory', requireRole('admin', 'superadmin'), async (_req, res) => {
  await seedPlatformMemory();
  res.json({ success: true, data: { seeded: true } });
});

/** Manual tool invocation (admin only — debugging). */
router.post('/tools/invoke', requireRole('admin', 'superadmin'), [
  body('tool').isIn([
    'read_file',
    'write_file',
    'list_directory',
    'search_code',
    'run_terminal',
    'git_status',
    'git_diff',
  ]),
], async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: errors.array()[0].msg });

  const repoRoot = detectRepoRoot();
  const { tool, path, content, query, command } = req.body;

  let result;
  switch (tool) {
    case 'read_file':
      result = await readFile(repoRoot, path);
      break;
    case 'write_file':
      result = await writeFile(repoRoot, path, content);
      break;
    case 'list_directory':
      result = await listDirectory(repoRoot, path || '.');
      break;
    case 'search_code': {
      const { searchCodeTool } = await import('../services/engineeringAgent/codeIndex');
      result = await searchCodeTool(repoRoot, query || path);
      break;
    }
    case 'run_terminal':
      result = await runTerminal(repoRoot, command);
      break;
    case 'git_status':
      result = await gitStatus(repoRoot);
      break;
    case 'git_diff':
      result = await gitDiff(repoRoot);
      break;
    default:
      return res.status(400).json({ success: false, error: 'Unknown tool' });
  }
  res.json({ success: true, data: result });
});

export default router;
