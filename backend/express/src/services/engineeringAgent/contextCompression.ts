/**
 * Context compression before Gemini Pro calls — target 70%+ token reduction.
 */
import { readFile } from './tools';

export type FileSnippet = { path: string; summary: string; score?: number };

const CHARS_PER_TOKEN_EST = 4;
const DEFAULT_MAX_PRO_CHARS = 28_000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_EST);
}

export function rankFilesByRelevance(
  paths: Array<{ path: string; summary?: string }>,
  prompt: string,
  limit = 12
): FileSnippet[] {
  const terms = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  const scored = paths.map((p) => {
    const hay = `${p.path} ${p.summary || ''}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 2;
    }
    if (p.path.includes('/routes/')) score += 1;
    if (p.path.includes('/services/')) score += 1;
    return { path: p.path, summary: p.summary || p.path, score };
  });
  return scored.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
}

export async function loadCompressedFileSnippets(
  repoRoot: string,
  ranked: FileSnippet[],
  opts?: { maxFiles?: number; maxCharsPerFile?: number }
): Promise<FileSnippet[]> {
  const maxFiles = opts?.maxFiles ?? 6;
  const maxChars = opts?.maxCharsPerFile ?? 2500;
  const out: FileSnippet[] = [];

  for (const f of ranked.slice(0, maxFiles)) {
    const res = await readFile(repoRoot, f.path, null);
    if (!res.ok || !res.output) {
      out.push({ path: f.path, summary: f.summary || '(unreadable)' });
      continue;
    }
    const content = res.output;
    const summary =
      content.length <= maxChars
        ? content
        : `${content.slice(0, maxChars)}\n… [${content.length} chars total, truncated for Pro context]`;
    out.push({ path: f.path, summary, score: f.score });
  }
  return out;
}

export function buildCompressedPrompt(input: {
  taskPrompt: string;
  activeTask?: string;
  businessMemory?: string;
  codeMemory?: string;
  platformMemory?: string;
  fileSnippets?: FileSnippet[];
  searchHits?: Array<{ path: string; summary: string }>;
  implementationHistory?: string;
  maxChars?: number;
}): { prompt: string; rawChars: number; compressedChars: number; reductionPct: number } {
  const sections: string[] = [];
  if (input.activeTask) sections.push(`## Active task\n${input.activeTask}`);
  sections.push(`## Request\n${input.taskPrompt}`);
  if (input.businessMemory) sections.push(input.businessMemory);
  if (input.codeMemory) sections.push(input.codeMemory);
  if (input.platformMemory) sections.push(`## Platform memory\n${input.platformMemory.slice(0, 2000)}`);
  if (input.implementationHistory) {
    sections.push(`## Related history\n${input.implementationHistory.slice(0, 1500)}`);
  }
  if (input.searchHits?.length) {
    sections.push(
      `## Code index hits (paths only — do not invent paths)\n${input.searchHits
        .map((h) => `- ${h.path}: ${h.summary.slice(0, 160)}`)
        .join('\n')}`
    );
  }
  if (input.fileSnippets?.length) {
    sections.push(
      `## Relevant file excerpts\n${input.fileSnippets
        .map((f) => `### ${f.path}\n\`\`\`\n${f.summary}\n\`\`\``)
        .join('\n\n')}`
    );
  }

  const rawChars =
    input.taskPrompt.length +
    (input.businessMemory?.length || 0) +
    (input.codeMemory?.length || 0) +
    (input.fileSnippets?.reduce((n, f) => n + f.summary.length, 0) || 0);

  let prompt = sections.join('\n\n');
  const maxChars = input.maxChars ?? DEFAULT_MAX_PRO_CHARS;
  if (prompt.length > maxChars) {
    prompt = prompt.slice(0, maxChars) + '\n\n…(context truncated for token budget)';
  }

  const compressedChars = prompt.length;
  const reductionPct =
    rawChars > 0 ? Math.round((1 - compressedChars / Math.max(rawChars, 1)) * 100) : 0;

  return { prompt, rawChars, compressedChars, reductionPct };
}
