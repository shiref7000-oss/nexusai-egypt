import { processEngineeringAI } from './engineeringAI';
import { pool } from '../../config/db_pg';
import { appendTaskLog } from './db';
import { classifyFileCategory, type RiskCategory } from './riskEngine';
import { createSubtasksAndRunFirst } from './taskDecomposition';
import { shouldDecomposeTask, decomposePromptHeuristic } from './taskDecomposition';

export type DeliveryPhase = {
  title: string;
  prompt: string;
  estimatedCategory: RiskCategory;
};

export async function analyzeAndDecomposeBeforeRisk(
  taskId: string,
  userId: number,
  prompt: string,
  repoRoot: string
): Promise<{
  decomposed: boolean;
  subtaskIds: string[];
  phases: DeliveryPhase[];
  parentPaused: boolean;
}> {
  const heuristic = decomposePromptHeuristic(prompt);
  let phases: DeliveryPhase[] = heuristic.map((s) => ({
    title: s.title,
    prompt: s.prompt,
    estimatedCategory: 'MEDIUM' as RiskCategory,
  }));

  if (phases.length < 2 && (prompt.length > 350 || shouldDecomposeTask(prompt, 8))) {
    try {
      const aiRes = await processEngineeringAI({
        engineeringTask: 'incremental_decompose',
        prompt: `Split this engineering objective into 3-6 incremental delivery phases. Each phase must be independently implementable and testable. Return JSON only: {"phases":[{"title":"string","prompt":"string"}]}\n\nObjective:\n${prompt.slice(0, 6000)}`,
        userId,
        taskId,
        overrides: { jsonMode: true, structuredOutput: true, maxTokens: 2000 },
      });
      const structured = aiRes.structured as { phases?: Array<{ title: string; prompt: string }> };
      if (structured?.phases?.length && structured.phases.length >= 2) {
        phases = structured.phases.slice(0, 6).map((p) => ({
          title: p.title,
          prompt: `${p.prompt}\n\nParent context:\n${prompt.slice(0, 400)}`,
          estimatedCategory: 'MEDIUM',
        }));
      }
    } catch {
      /* keep heuristic */
    }
  }

  for (const ph of phases) {
    const sample = ph.prompt.toLowerCase();
    if (/drop|truncate|delete all|auth|billing|migration/i.test(sample)) {
      ph.estimatedCategory = classifyFileCategory('migrations/000.sql', ph.prompt).category;
    } else if (/page|component|ui|dashboard|frontend/i.test(sample)) {
      ph.estimatedCategory = 'LOW';
    }
  }

  await appendTaskLog(taskId, {
    eventType: 'incremental_delivery',
    message:
      phases.length >= 2
        ? `Split into ${phases.length} delivery phases before risk evaluation`
        : 'Single-phase delivery (no decomposition required)',
    payload: { phases: phases.map((p) => ({ title: p.title, estimatedCategory: p.estimatedCategory })) },
  });

  if (phases.length < 2) {
    return { decomposed: false, subtaskIds: [], phases, parentPaused: false };
  }

  const { firstSubtaskId, subtaskIds } = await createSubtasksAndRunFirst(
    taskId,
    userId,
    repoRoot,
    prompt,
    phases.map((p) => ({ title: p.title, prompt: p.prompt }))
  );

  await pool.query(
    `UPDATE agent_tasks SET reliability_json = COALESCE(reliability_json, '{}'::jsonb) || $2::jsonb,
     status = 'running', updated_at = NOW() WHERE id = $1`,
    [
      taskId,
      JSON.stringify({
        incrementalDelivery: true,
        deliveryPhases: phases,
        subtaskIds,
        activePhaseIndex: 0,
      }),
    ]
  );

  return {
    decomposed: true,
    subtaskIds,
    phases,
    parentPaused: true,
  };
}
