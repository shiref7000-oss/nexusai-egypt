/**
 * Engineering Agent multi-model routing — Gemini 2.5 Flash vs Pro.
 */
import { env } from '../../config/env';

export const GEMINI_MODEL_FLASH =
  env.GEMINI_MODEL_FLASH || env.GEMINI_MODEL || 'gemini-2.5-flash';
export const GEMINI_MODEL_PRO = env.GEMINI_MODEL_PRO || 'gemini-2.5-pro';

export type ModelTier = 'flash' | 'pro';

/** Task kinds routed through processEngineeringAI */
export type EngineeringAITask =
  | 'code_index_classify'
  | 'memory_search'
  | 'file_classification'
  | 'semantic_search_rank'
  | 'summarization'
  | 'log_analysis'
  | 'task_categorization'
  | 'risk_pre_analysis'
  | 'conversation_compression'
  | 'understand_task'
  | 'incremental_decompose'
  | 'project_manager_plan'
  | 'implementation_plan'
  | 'architecture_design'
  | 'code_patch'
  | 'refactoring'
  | 'debug_fix'
  | 'build_error_parse'
  | 'build_error_fix'
  | 'code_review'
  | 'multi_file_plan'
  | 'continue_investigation'
  | 'chat_qa_light'
  | 'chat_qa_deep'
  | 'verification_summary';

const FLASH_TASKS = new Set<EngineeringAITask>([
  'code_index_classify',
  'memory_search',
  'file_classification',
  'semantic_search_rank',
  'summarization',
  'log_analysis',
  'task_categorization',
  'risk_pre_analysis',
  'conversation_compression',
  'understand_task',
  'incremental_decompose',
  'build_error_parse',
  'verification_summary',
  'chat_qa_light',
]);

const PRO_TASKS = new Set<EngineeringAITask>([
  'project_manager_plan',
  'implementation_plan',
  'architecture_design',
  'code_patch',
  'refactoring',
  'debug_fix',
  'build_error_fix',
  'code_review',
  'multi_file_plan',
  'continue_investigation',
  'chat_qa_deep',
]);

export function routeEngineeringTask(task: EngineeringAITask): {
  model: string;
  tier: ModelTier;
  maxTokens: number;
  verbosity: 'concise' | 'balanced';
} {
  const usePro = PRO_TASKS.has(task) && !FLASH_TASKS.has(task);
  const tier: ModelTier = usePro ? 'pro' : 'flash';
  const model = tier === 'pro' ? GEMINI_MODEL_PRO : GEMINI_MODEL_FLASH;

  const maxTokens =
    task === 'code_patch' || task === 'refactoring'
      ? 8000
      : task === 'implementation_plan' || task === 'project_manager_plan'
        ? 4000
        : task === 'conversation_compression'
          ? 1500
          : tier === 'pro'
            ? 4000
            : 2000;

  const verbosity =
    task === 'code_patch' || task === 'implementation_plan' ? 'concise' : 'balanced';

  return { model, tier, maxTokens, verbosity };
}

export function taskLabel(task: EngineeringAITask): string {
  return task.replace(/_/g, ' ');
}
