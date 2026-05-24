import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/env';

export type RepoLayout = {
  repoRoot: string;
  backendRel: string;
  frontendRel: string;
  backendDir: string;
  frontendDir: string;
  backendPackageName: string;
  frontendPackageName: string;
  backendBuildCommand: string;
  frontendBuildCommand: string;
  /** True only when root package.json defines npm workspaces. */
  npmWorkspacesEnabled: boolean;
  workspacePatterns: string[];
  architectureSummary: string;
  buildInstructionsForPlanner: string;
};

type PackageJson = {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasPackageJson(dir: string): Promise<boolean> {
  return exists(path.join(dir, 'package.json'));
}

async function readPackageJson(dir: string): Promise<PackageJson | null> {
  try {
    const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function getWorkspacesConfig(pkg: PackageJson | null): { enabled: boolean; patterns: string[] } {
  if (!pkg?.workspaces) return { enabled: false, patterns: [] };
  const ws = pkg.workspaces;
  if (Array.isArray(ws)) {
    return { enabled: ws.length > 0, patterns: ws.map(String) };
  }
  if (typeof ws === 'object' && Array.isArray(ws.packages)) {
    return { enabled: ws.packages.length > 0, patterns: ws.packages.map(String) };
  }
  return { enabled: false, patterns: [] };
}

function pathMatchesWorkspace(patterns: string[], relDir: string): boolean {
  const rel = relDir.replace(/\\/g, '/');
  for (const pattern of patterns) {
    const p = pattern.replace(/\\/g, '/');
    if (p === rel) return true;
    if (p.endsWith('/*') && rel.startsWith(p.slice(0, -2))) return true;
    if (p.endsWith('*') && rel.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

function buildCdCommand(workDir: string, repoRoot: string, script: string): string {
  const abs = path.resolve(workDir);
  const root = path.resolve(repoRoot);
  if (abs === root) return script;
  if (abs.startsWith(root + path.sep)) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    return `cd ${rel} && ${script}`;
  }
  return `cd ${abs} && ${script}`;
}

function isViteFrontendPackage(pkg: PackageJson | null): boolean {
  if (!pkg?.scripts?.build) return false;
  const deps = { ...pkg.devDependencies, ...pkg.dependencies };
  return Boolean(deps?.vite || deps?.['@vitejs/plugin-react']);
}

/**
 * Detect backend/frontend directories relative to ENGINEERING_REPO_ROOT.
 * Build commands use `cd <package> && npm run build` unless npm workspaces are configured at repo root.
 */
export async function detectRepoLayout(repoRootInput?: string): Promise<RepoLayout> {
  const repoRoot = path.resolve(repoRootInput || env.ENGINEERING_REPO_ROOT || process.cwd());
  const rootPkg = await readPackageJson(repoRoot);
  const { enabled: npmWorkspacesEnabled, patterns: workspacePatterns } = getWorkspacesConfig(rootPkg);

  let backendDir = '';
  const monorepoBackend = path.join(repoRoot, 'backend', 'express');
  const externalBackend = env.ENGINEERING_BACKEND_ROOT?.trim();

  if (await hasPackageJson(monorepoBackend)) {
    backendDir = monorepoBackend;
  } else if (externalBackend && (await hasPackageJson(externalBackend))) {
    backendDir = path.resolve(externalBackend);
  } else if (rootPkg && (rootPkg.name === 'nexusai-api' || (await exists(path.join(repoRoot, 'src', 'server.ts'))))) {
    backendDir = repoRoot;
  }

  let frontendDir = '';
  const monorepoFrontend = path.join(repoRoot, 'saas-frontend');
  if (await hasPackageJson(monorepoFrontend)) {
    frontendDir = monorepoFrontend;
  } else if (isViteFrontendPackage(rootPkg)) {
    frontendDir = repoRoot;
  }

  if (!backendDir) {
    throw new Error(
      'No backend package found. Expected backend/express/package.json in repo or set ENGINEERING_BACKEND_ROOT.'
    );
  }

  const backendPkg = (await readPackageJson(backendDir)) || {};
  const frontendPkg = frontendDir ? await readPackageJson(frontendDir) : null;

  const backendRel = path.relative(repoRoot, backendDir).replace(/\\/g, '/') || '.';
  const frontendRel = frontendDir
    ? path.relative(repoRoot, frontendDir).replace(/\\/g, '/') || '.'
    : '';

  const backendInWorkspace =
    npmWorkspacesEnabled && pathMatchesWorkspace(workspacePatterns, backendRel);
  const frontendInWorkspace =
    npmWorkspacesEnabled && frontendRel && pathMatchesWorkspace(workspacePatterns, frontendRel);

  let backendBuildCommand: string;
  if (backendInWorkspace && backendPkg.name) {
    backendBuildCommand = `npm run build --workspace=${backendPkg.name}`;
  } else {
    backendBuildCommand = buildCdCommand(backendDir, repoRoot, 'npm run build');
  }

  let frontendBuildCommand = '';
  if (frontendDir) {
    if (frontendInWorkspace && frontendPkg?.name) {
      frontendBuildCommand = `npm run build --workspace=${frontendPkg.name}`;
    } else {
      frontendBuildCommand = buildCdCommand(frontendDir, repoRoot, 'npm run build');
    }
  }

  const architectureSummary = [
    backendRel === '.'
      ? `Express API at repo root (${backendDir}).`
      : `Express API in ${backendRel}/.`,
    frontendRel ? `React + Vite SPA in ${frontendRel}/.` : 'Frontend package not detected.',
    npmWorkspacesEnabled
      ? `npm workspaces: ${workspacePatterns.join(', ')}.`
      : 'npm workspaces: not configured (use cd into package dirs).',
  ].join(' ');

  const buildInstructionsForPlanner = npmWorkspacesEnabled
    ? `Use workspace builds only for listed packages: backend \`${backendBuildCommand}\`${frontendBuildCommand ? `, frontend \`${frontendBuildCommand}\`` : ''}.`
    : `Do NOT use npm --workspace or -w (workspaces are not configured). Backend build: \`${backendBuildCommand}\`${frontendBuildCommand ? `. Frontend build: \`${frontendBuildCommand}\`` : ''}.`;

  return {
    repoRoot,
    backendRel,
    frontendRel,
    backendDir,
    frontendDir,
    backendPackageName: backendPkg.name || 'nexusai-api',
    frontendPackageName: frontendPkg?.name || 'nexusai-saas-frontend',
    backendBuildCommand,
    frontendBuildCommand,
    npmWorkspacesEnabled,
    workspacePatterns,
    architectureSummary,
    buildInstructionsForPlanner,
  };
}

/** Strip invalid workspace flags and map AI guesses to detected layout. */
export function sanitizeBuildCommand(command: string, layout: RepoLayout): string {
  let cmd = (command || '').trim();
  if (!cmd) return layout.backendBuildCommand;

  const usesWorkspaceFlag = /--workspace\b|-w\s+/i.test(cmd);

  if (usesWorkspaceFlag && !layout.npmWorkspacesEnabled) {
    if (/saas-frontend|frontend/i.test(cmd) && layout.frontendBuildCommand) {
      return layout.frontendBuildCommand;
    }
    return layout.backendBuildCommand;
  }

  if (usesWorkspaceFlag && layout.npmWorkspacesEnabled) {
    const wsMatch = cmd.match(/--workspace[=\s]+([^\s&;]+)/i) || cmd.match(/-w\s+([^\s&;]+)/i);
    const wsTarget = wsMatch?.[1]?.replace(/['"]/g, '');
    if (wsTarget) {
      const validNames = [layout.backendPackageName, layout.frontendPackageName].filter(Boolean);
      const validPaths = [layout.backendRel, layout.frontendRel].filter(Boolean);
      const ok =
        validNames.includes(wsTarget) ||
        validPaths.includes(wsTarget) ||
        validPaths.some((p) => wsTarget === p || wsTarget.startsWith(`${p}/`));
      if (!ok) {
        if (/saas-frontend|frontend/i.test(wsTarget) && layout.frontendBuildCommand) {
          return layout.frontendBuildCommand;
        }
        return layout.backendBuildCommand;
      }
    }
  }

  if (/^npm run build\s*$/i.test(cmd) && layout.backendRel !== '.') {
    return layout.backendBuildCommand;
  }

  if (cmd.includes('backend/express') && layout.backendRel !== 'backend/express') {
    return layout.backendBuildCommand;
  }

  if (/saas-frontend/.test(cmd) && layout.frontendRel && layout.frontendRel !== 'saas-frontend') {
    return layout.frontendBuildCommand || layout.backendBuildCommand;
  }

  return cmd;
}

/** @deprecated Use sanitizeBuildCommand */
export function normalizeBuildCommand(command: string, layout: RepoLayout): string {
  return sanitizeBuildCommand(command, layout);
}
