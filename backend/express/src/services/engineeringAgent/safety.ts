import path from 'path';
import { env } from '../../config/env';

const BLOCKED_PATH_SEGMENTS = [
  '.env',
  '.git',
  'node_modules',
  'dist',
  '.pem',
  'id_rsa',
  'credentials',
  'secrets',
];

const BLOCKED_DELETE_PATTERNS = [
  /^\.env/i,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\/migrations\//i,
  /server\.ts$/,
  /docker-compose/i,
  /nginx/i,
  /deploy\//i,
];

const ALLOWED_TERMINAL_PREFIXES = [
  'npm run build',
  'npm run test',
  'npm test',
  'npm run lint',
  'npm run typecheck',
  'npx tsc',
  'npm run build --',
  'git status',
  'git diff',
  'cd ',
];

const BLOCKED_TERMINAL_PATTERNS = [
  /git\s+push/i,
  /git\s+commit/i,
  /deploy/i,
  /pm2\s+restart/i,
  /rm\s+-rf/i,
  /curl.*\|.*sh/i,
  /ssh\s+/i,
  /scp\s+/i,
  /kubectl/i,
  /docker\s+push/i,
  /DROP\s+TABLE/i,
  /truncate/i,
  /--force/i,
  /main|master/,
];

export function resolveRepoRoot(override?: string): string {
  const raw = override || env.ENGINEERING_REPO_ROOT || process.cwd();
  return path.resolve(raw);
}

export function assertPathInRepo(repoRoot: string, targetPath: string): string {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, targetPath.replace(/^\//, ''));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(`Path escapes repository root: ${targetPath}`);
  }
  const rel = path.relative(root, resolved);
  for (const seg of BLOCKED_PATH_SEGMENTS) {
    if (rel.split(path.sep).includes(seg)) {
      throw new Error(`Access denied to protected path segment: ${seg}`);
    }
  }
  return resolved;
}

export function assertDeleteAllowed(repoRoot: string, targetPath: string): void {
  const resolved = assertPathInRepo(repoRoot, targetPath);
  const rel = path.relative(repoRoot, resolved).replace(/\\/g, '/');
  for (const pat of BLOCKED_DELETE_PATTERNS) {
    if (pat.test(rel)) {
      throw new Error(`Delete not allowed for protected path: ${rel}`);
    }
  }
}

export function assertTerminalCommandAllowed(command: string): void {
  const trimmed = command.trim();
  for (const pat of BLOCKED_TERMINAL_PATTERNS) {
    if (pat.test(trimmed)) {
      throw new Error(`Terminal command blocked by safety policy: ${trimmed.slice(0, 80)}`);
    }
  }
  const allowed = ALLOWED_TERMINAL_PREFIXES.some((p) => trimmed.startsWith(p));
  if (!allowed) {
    throw new Error(
      `Terminal command not in allowlist. Allowed prefixes: ${ALLOWED_TERMINAL_PREFIXES.join(', ')}`
    );
  }
}

export function requiresManualApproval(action: string): boolean {
  return ['deploy', 'git_push', 'delete_production', 'modify_secrets'].includes(action);
}
