import { listMemory } from './db';
import { searchCode } from './codeIndex';
import { ENGINEERING_AGENT_OPERATING_RULES, ENGINEERING_AGENT_WORKFLOW } from './operatingRules';
import { detectRepoLayout, sanitizeBuildCommand } from './repoLayout';
import {
  inferFileContentFromPrompt,
  inferFilesFromPrompt,
  mergeFileWrites,
  normalizeFilesToWrite,
  unwrapPlanPayload,
} from './planParse';
import { processEngineeringAI } from './engineeringAI';
import { rankFilesByRelevance } from './contextCompression';

export type ExecutionPlan = {
  summary: string;
  searchQueries: string[];
  filesToRead: string[];
  filesToWrite: Array<{ path: string; action: 'create' | 'modify'; description: string }>;
  buildCommand: string;
  testCommand?: string;
  /** Structured reasoning for admin monitor (not chain-of-thought) */
  fileSelectionRationale?: Array<{ path: string; reason: string }>;
  planningSummary?: string;
};

export async function createExecutionPlan(
  prompt: string,
  repoRoot: string,
  userId: number,
  taskId?: string | null
): Promise<ExecutionPlan> {
  const memoryRows = await listMemory('platform');
  const memoryContext = memoryRows
    .slice(0, 12)
    .map((m: { category: string; key: string; content: string }) => `- [${m.category}/${m.key}] ${m.content}`)
    .join('\n');

  const searchTerms = prompt
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);
  const searchHits: Array<{ file_path: string; summary: string }> = [];
  for (const term of searchTerms) {
    const rows = await searchCode(repoRoot, term, 8);
    for (const row of rows) {
      if (!searchHits.find((h) => h.file_path === row.file_path)) {
        searchHits.push({ file_path: row.file_path, summary: String(row.summary || '').slice(0, 200) });
      }
    }
    if (searchHits.length >= 15) break;
  }

  const layout = await detectRepoLayout(repoRoot);
  const ranked = rankFilesByRelevance(
    searchHits.map((h) => ({ path: h.file_path, summary: h.summary })),
    prompt
  );

  const corePrompt = `${ENGINEERING_AGENT_OPERATING_RULES}\n${ENGINEERING_AGENT_WORKFLOW}\n\nRepository layout:\n${layout.architectureSummary}\n${layout.buildInstructionsForPlanner}\n\nUser task:\n${prompt}\n\nReturn JSON only with this shape:\n{\n  "summary": "string",\n  "planningSummary": "string",\n  "searchQueries": ["string"],\n  "filesToRead": ["repo-relative paths"],\n  "filesToWrite": [{ "path": "repo-relative path", "action": "create|modify", "description": "what to change" }],\n  "buildCommand": "exact shell command from layout instructions above",\n  "testCommand": "optional shell command"\n}\n\nIf the user asks to create or modify files, filesToWrite MUST list every file with action create or modify. Never return an empty filesToWrite when file changes are requested.`;

  const aiRes = await processEngineeringAI({
    engineeringTask: 'implementation_plan',
    prompt: corePrompt,
    rawPrompt: corePrompt,
    userId,
    taskId,
    searchHits: searchHits.map((h) => ({ path: h.file_path, summary: h.summary })),
    implementationHistory: memoryContext,
    overrides: {
      jsonMode: true,
      structuredOutput: true,
      maxTokens: 4000,
      responseVerbosity: 'balanced',
    },
  });

  const promptInferred = inferFilesFromPrompt(prompt);

  const fallback: ExecutionPlan = {
    summary: 'Explore codebase, implement change, run build',
    searchQueries: searchTerms,
    filesToRead: ranked.slice(0, 5).map((f) => f.path),
    filesToWrite: promptInferred,
    buildCommand: layout.backendBuildCommand,
    testCommand: layout.backendBuildCommand,
  };

  if (aiRes.structured && typeof aiRes.structured === 'object') {
    const s = unwrapPlanPayload(aiRes.structured);
    const rawRead = s.filesToRead ?? s.files_to_read;
    const filesToRead = Array.isArray(rawRead) ? rawRead.map(String) : fallback.filesToRead;
    const aiWrites = normalizeFilesToWrite(
      s.filesToWrite ?? s.files_to_write ?? s.file_writes ?? s.writes
    );
    const filesToWrite = mergeFileWrites(aiWrites, promptInferred);
    return {
      summary: String(s.summary || fallback.summary),
      planningSummary: String(s.planningSummary || s.planning_summary || s.summary || fallback.summary),
      searchQueries: Array.isArray(s.searchQueries ?? s.search_queries)
        ? ((s.searchQueries ?? s.search_queries) as unknown[]).map(String)
        : fallback.searchQueries,
      filesToRead,
      filesToWrite,
      buildCommand: sanitizeBuildCommand(
        String(s.buildCommand || s.build_command || fallback.buildCommand),
        layout
      ),
      testCommand:
        s.testCommand || s.test_command
          ? sanitizeBuildCommand(String(s.testCommand || s.test_command), layout)
          : fallback.testCommand,
      fileSelectionRationale: Array.isArray(s.fileSelectionRationale ?? s.file_selection_rationale)
        ? ((s.fileSelectionRationale ?? s.file_selection_rationale) as ExecutionPlan['fileSelectionRationale'])
        : filesToRead.map((path) => ({
            path,
            reason: 'Matched code_index search for task keywords',
          })),
    };
  }

  return fallback;
}

export async function generateFilePatch(
  prompt: string,
  filePath: string,
  currentContent: string,
  planSummary: string,
  userId: number,
  options?: { isCreate?: boolean; writeHint?: string; taskId?: string | null }
): Promise<{ content: string; explanation: string }> {
  const isNew = options?.isCreate || !currentContent.trim();
  const excerpt = currentContent.slice(0, 2500);
  const fileSection = isNew
    ? 'This is a NEW file (empty). You MUST return the complete file content in JSON.'
    : `Current file (compressed excerpt, ${currentContent.length} chars total):\n\`\`\`\n${excerpt}${currentContent.length > 2500 ? '\n…(truncated for token budget)' : ''}\n\`\`\`\n\nPrefer minimal diff.`;

  const aiRes = await processEngineeringAI({
    engineeringTask: 'code_patch',
    prompt: `${ENGINEERING_AGENT_OPERATING_RULES}\n\nTask: ${prompt}\nPlan: ${planSummary}\nFile: ${filePath}\n${options?.writeHint ? `Hint: ${options.writeHint}\n` : ''}\n${fileSection}\n\nReturn JSON: { "content": "full new file content", "explanation": "brief change summary" }`,
    rawPrompt: `${prompt}\n${filePath}\n${currentContent.length} chars`,
    userId,
    taskId: options?.taskId,
    fileSnippets: [{ path: filePath, summary: excerpt }],
    overrides: { jsonMode: true, structuredOutput: true, maxTokens: 8000, responseVerbosity: 'concise' },
  });

  if (aiRes.structured && typeof aiRes.structured === 'object') {
    const raw = unwrapPlanPayload(aiRes.structured);
    const s = raw as { content?: string; file_content?: string; explanation?: string };
    const content = s.content ?? s.file_content;
    if (content != null && String(content).length > 0) {
      return { content: String(content), explanation: String(s.explanation || 'Updated file') };
    }
  }

  const inferred = inferFileContentFromPrompt(prompt, filePath);
  if (inferred) {
    return { content: inferred, explanation: 'Content taken from task prompt' };
  }

  return { content: currentContent, explanation: 'No changes generated' };
}
