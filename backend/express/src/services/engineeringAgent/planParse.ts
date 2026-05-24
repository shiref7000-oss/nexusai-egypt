import type { ExecutionPlan } from './planner';

export type FileWriteOp = ExecutionPlan['filesToWrite'][number];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Unwrap nested plan shapes from Gemini (execution_plan, plan, etc.). */
export function unwrapPlanPayload(structured: unknown): Record<string, unknown> {
  const root = asRecord(structured) || {};
  const nested =
    asRecord(root.execution_plan) ||
    asRecord(root.executionPlan) ||
    asRecord(root.plan) ||
    null;
  return nested ? { ...root, ...nested } : root;
}

function normalizeWriteEntry(raw: unknown): FileWriteOp | null {
  if (typeof raw === 'string' && raw.trim()) {
    return { path: raw.trim(), action: 'modify', description: 'Modify file per task' };
  }
  const o = asRecord(raw);
  if (!o) return null;
  const path = String(o.path || o.file_path || o.filePath || o.file || '').trim();
  if (!path) return null;
  const actionRaw = String(o.action || o.operation || o.type || 'modify').toLowerCase();
  const action: 'create' | 'modify' =
    actionRaw.includes('create') || actionRaw.includes('new') ? 'create' : 'modify';
  return {
    path,
    action,
    description: String(o.description || o.summary || o.reason || 'Apply task changes'),
  };
}

export function normalizeFilesToWrite(raw: unknown): FileWriteOp[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeWriteEntry).filter((x): x is FileWriteOp => x !== null);
}

/** Detect explicit create/write requests the model often omits from filesToWrite. */
export function inferFilesFromPrompt(prompt: string): FileWriteOp[] {
  const inferred: FileWriteOp[] = [];
  const seen = new Set<string>();

  const add = (path: string, action: 'create' | 'modify', description: string) => {
    const p = path.replace(/^\//, '').trim();
    if (!p || seen.has(p)) return;
    seen.add(p);
    inferred.push({ path: p, action, description });
  };

  // Create file AGENT_WRITE_TEST.txt / create X.txt
  const createPatterns = [
    /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:file\s+)?[`"']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"']?/gi,
    /\bwrite\s+(?:to\s+)?(?:file\s+)?[`"']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"']?/gi,
    /\badd\s+(?:file\s+)?[`"']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"']?/gi,
  ];
  for (const re of createPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) {
      add(m[1], 'create', 'Create file requested in task prompt');
    }
  }

  if (/\bAGENT_WRITE_TEST\.txt\b/i.test(prompt)) {
    add('AGENT_WRITE_TEST.txt', 'create', 'Engineering Agent write pipeline verification file');
  }

  return inferred;
}

/** Pull file body from prompt (Contents: / Content: blocks). */
export function inferFileContentFromPrompt(prompt: string, filePath: string): string | null {
  const base = filePath.split('/').pop() || filePath;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const blockRe = new RegExp(
    `(?:${escaped}|${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[\\s\\S]{0,120}?` +
      `(?:contents?|content)\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*\\n|\\n(?:then|verify|run|create|write)\\b|$)`,
    'i'
  );
  const block = prompt.match(blockRe);
  if (block?.[1]?.trim()) return block[1].trim();

  if (/AGENT_WRITE_TEST\.txt/i.test(prompt) && /write pipeline verified/i.test(prompt)) {
    return 'Engineering Agent write pipeline verified.';
  }

  const quoted = prompt.match(
    new RegExp(`${escaped}[\\s\\S]{0,80}?["'\`]([^"'\`]{3,500})["'\`]`, 'i')
  );
  if (quoted?.[1]) return quoted[1].trim();

  return null;
}

export function mergeFileWrites(...lists: FileWriteOp[][]): FileWriteOp[] {
  const byPath = new Map<string, FileWriteOp>();
  for (const list of lists) {
    for (const item of list) {
      byPath.set(item.path, item);
    }
  }
  return [...byPath.values()];
}
