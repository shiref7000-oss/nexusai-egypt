import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../../config/db_pg';
import { assertPathInRepo } from './safety';
import { appendTaskLog } from './db';

const INDEX_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.sql',
  '.json',
  '.md',
  '.mjs',
  '.cjs',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cursor', 'coverage', 'public/legacy']);

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function inferModuleName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  if (filePath.includes('/routes/')) return `route:${base}`;
  if (filePath.includes('/services/')) return `service:${base}`;
  if (filePath.includes('/pages/')) return `page:${base}`;
  if (filePath.includes('/components/')) return `component:${base}`;
  return base;
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const re = /export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) exports.push(m[1]);
  return exports.slice(0, 30);
}

function extractImports(content: string): string[] {
  const deps: string[] = [];
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) deps.push(m[1]);
  return [...new Set(deps)].slice(0, 20);
}

function summarizeFile(filePath: string, content: string): string {
  const lines = content.split('\n').length;
  const exports = extractExports(content);
  const head = content.slice(0, 400).replace(/\s+/g, ' ').trim();
  return `${filePath} (${lines} lines)${exports.length ? ` exports: ${exports.join(', ')}` : ''}. ${head.slice(0, 200)}`;
}

async function walkDir(root: string, dir: string, files: string[]): Promise<void> {
  const abs = path.join(root, dir);
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const rel = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkDir(root, rel, files);
    } else if (INDEX_EXTENSIONS.has(path.extname(ent.name))) {
      files.push(rel);
    }
    if (files.length > 800) return;
  }
}

export async function indexRepository(
  repoRoot: string,
  taskId: string | null = null
): Promise<{ indexed: number }> {
  const root = path.resolve(repoRoot);
  const files: string[] = [];
  await walkDir(root, '.', files);

  let indexed = 0;
  for (const rel of files) {
    try {
      const abs = assertPathInRepo(root, rel);
      const content = await fs.readFile(abs, 'utf8');
      if (content.length > 200_000) continue;
      const summary = summarizeFile(rel.replace(/\\/g, '/'), content);
      const fileHash = hashContent(content);
      await pool.query(
        `INSERT INTO code_index (repo_root, file_path, module_name, summary, exports, dependencies, file_hash)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
         ON CONFLICT (repo_root, file_path)
         DO UPDATE SET module_name = EXCLUDED.module_name, summary = EXCLUDED.summary,
           exports = EXCLUDED.exports, dependencies = EXCLUDED.dependencies,
           file_hash = EXCLUDED.file_hash, indexed_at = NOW()`,
        [
          root,
          rel.replace(/\\/g, '/'),
          inferModuleName(rel),
          summary,
          JSON.stringify(extractExports(content)),
          JSON.stringify(extractImports(content)),
          fileHash,
        ]
      );
      indexed++;
    } catch {
      /* skip unreadable */
    }
  }

  if (taskId) {
    await appendTaskLog(taskId, {
      eventType: 'code_index',
      message: `Indexed ${indexed} files`,
      payload: { indexed },
    });
  }
  return { indexed };
}

export async function searchCode(repoRoot: string, query: string, limit = 20) {
  const root = path.resolve(repoRoot);
  const q = `%${query.replace(/%/g, '')}%`;
  const r = await pool.query(
    `SELECT file_path, module_name, summary, exports
     FROM code_index
     WHERE repo_root = $1 AND (summary ILIKE $2 OR file_path ILIKE $2 OR module_name ILIKE $2)
     ORDER BY indexed_at DESC
     LIMIT $3`,
    [root, q, limit]
  );
  return r.rows;
}

export async function searchCodeTool(
  repoRoot: string,
  query: string,
  taskId: string | null = null
) {
  const rows = await searchCode(repoRoot, query);
  if (taskId) {
    await appendTaskLog(taskId, {
      eventType: 'tool_call',
      message: `search_code: ${rows.length} hits`,
      payload: { tool: 'search_code', query, hits: rows.map((x: { file_path: string }) => x.file_path) },
    });
  }
  return { ok: true, tool: 'search_code', data: { query, results: rows } };
}
