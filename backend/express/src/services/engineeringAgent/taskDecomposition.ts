import { pool } from '../../config/db_pg';

const EPIC_PATTERNS: RegExp[] = [
  /\bphase\s*\d+/i,
  /\bepic\b/i,
  /\bupgrade\b/i,
  /\breliability\b/i,
  /\brefactor\s+(the\s+)?(entire|whole|full)/i,
  /\bimplement\s+(all|everything|full)/i,
  /\b\d+\.\s+\w+/,
];

export function shouldDecomposeTask(prompt: string, fileWriteCount: number): boolean {
  if (fileWriteCount > 5) return true;
  if (prompt.length > 400 && EPIC_PATTERNS.some((re) => re.test(prompt))) return true;
  const numbered = (prompt.match(/(?:^|\n)\s*\d+\./g) || []).length;
  if (numbered >= 3) return true;
  return false;
}

export function decomposePromptHeuristic(prompt: string): Array<{ title: string; prompt: string }> {
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  const re = /(?:^|\n)\s*(?:\d+\.|[-*])\s*(.+)/g;
  while ((m = re.exec(prompt))) {
    const text = m[1].trim();
    if (text.length > 10) lines.push(text);
  }
  if (lines.length >= 2) {
    return lines.slice(0, 6).map((line, i) => ({
      title: `Subtask ${i + 1}`,
      prompt: `${line}\n\nContext from parent task:\n${prompt.slice(0, 500)}`,
    }));
  }

  const keywords = [
    'Root cause analysis',
    'Implement core change',
    'Add verification and tests',
    'Update admin UI',
    'Documentation',
  ];
  if (EPIC_PATTERNS.some((re) => re.test(prompt))) {
    return keywords.map((k, i) => ({
      title: k,
      prompt: `${k} (scoped slice of parent work):\n${prompt.slice(0, 800)}`,
    }));
  }

  return [];
}

export async function createSubtasksAndRunFirst(
  parentTaskId: string,
  userId: number,
  repoRoot: string,
  parentPrompt: string,
  subtasks: Array<{ title: string; prompt: string }>
): Promise<{ firstSubtaskId: string | null; subtaskIds: string[] }> {
  const ids: string[] = [];
  for (let i = 0; i < subtasks.length; i++) {
    const st = subtasks[i];
    const r = await pool.query(
      `INSERT INTO agent_tasks (user_id, title, prompt, status, repo_root, parent_task_id, task_type, execution_mode)
       VALUES ($1, $2, $3, 'pending', $4, $5::uuid, 'implementation', 'implementation')
       RETURNING id`,
      [userId, st.title.slice(0, 500), st.prompt, repoRoot, parentTaskId]
    );
    ids.push(r.rows[0].id as string);
  }

  await pool.query(
    `UPDATE agent_tasks SET reliability_json = COALESCE(reliability_json, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [
      parentTaskId,
      JSON.stringify({
        decomposed: true,
        subtaskIds: ids,
        subtaskCount: ids.length,
        executedSubtaskIndex: 0,
      }),
    ]
  );

  return { firstSubtaskId: ids[0] || null, subtaskIds: ids };
}
