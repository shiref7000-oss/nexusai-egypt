/**
 * Persistent code memory — architecture summaries reused across tasks.
 */
import { pool } from '../../config/db_pg';
import { listMemory, upsertMemory } from './db';
import { detectRepoLayout } from './repoLayout';

export async function syncCodeMemoryFromIndex(repoRoot: string): Promise<{ updated: number }> {
  const layout = await detectRepoLayout(repoRoot);
  let updated = 0;

  const archSummary = layout.architectureSummary;
  await upsertMemory({
    scope: 'platform',
    category: 'code_memory',
    key: 'architecture_summary',
    content: archSummary,
    metadata: { repoRoot, syncedAt: new Date().toISOString() },
  });
  updated++;

  const routes = await pool.query(
    `SELECT file_path, summary, module_name FROM code_index
     WHERE repo_root = $1 AND file_path LIKE '%/routes/%' ORDER BY file_path LIMIT 40`,
    [repoRoot]
  );
  if (routes.rows.length) {
    const content = routes.rows
      .map((r) => `- ${r.file_path}: ${String(r.summary || r.module_name).slice(0, 120)}`)
      .join('\n');
    await upsertMemory({
      scope: 'platform',
      category: 'code_memory',
      key: 'routes',
      content,
      metadata: { count: routes.rows.length },
    });
    updated++;
  }

  const services = await pool.query(
    `SELECT file_path, summary FROM code_index
     WHERE repo_root = $1 AND file_path LIKE '%/services/%' ORDER BY file_path LIMIT 50`,
    [repoRoot]
  );
  if (services.rows.length) {
    await upsertMemory({
      scope: 'platform',
      category: 'code_memory',
      key: 'services',
      content: services.rows.map((r) => `- ${r.file_path}`).join('\n').slice(0, 6000),
      metadata: { count: services.rows.length },
    });
    updated++;
  }

  const migrations = await pool.query(
    `SELECT file_path FROM code_index
     WHERE repo_root = $1 AND file_path LIKE '%/migrations/%' ORDER BY file_path DESC LIMIT 15`,
    [repoRoot]
  );
  if (migrations.rows.length) {
    await upsertMemory({
      scope: 'platform',
      category: 'code_memory',
      key: 'database_tables',
      content: migrations.rows.map((r) => `- ${r.file_path}`).join('\n'),
      metadata: { count: migrations.rows.length },
    });
    updated++;
  }

  const pages = await pool.query(
    `SELECT file_path FROM code_index
     WHERE repo_root = $1 AND (file_path LIKE '%/pages/%' OR file_path LIKE '%/components/%')
     ORDER BY file_path LIMIT 40`,
    [repoRoot]
  );
  if (pages.rows.length) {
    await upsertMemory({
      scope: 'platform',
      category: 'code_memory',
      key: 'frontend_pages',
      content: pages.rows.map((r) => `- ${r.file_path}`).join('\n').slice(0, 4000),
      metadata: { count: pages.rows.length },
    });
    updated++;
  }

  return { updated };
}

export async function getCodeMemoryBlock(maxChars = 4000): Promise<string> {
  const rows = await listMemory('platform');
  const code = rows.filter((r) => r.category === 'code_memory');
  if (!code.length) return '';
  const parts = code.map((r) => `### ${r.key}\n${String(r.content).slice(0, 1200)}`);
  let block = `## Code memory\n${parts.join('\n\n')}`;
  if (block.length > maxChars) block = block.slice(0, maxChars) + '\n…';
  return block;
}
