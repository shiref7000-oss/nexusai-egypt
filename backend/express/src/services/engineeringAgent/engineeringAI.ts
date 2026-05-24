/**
 * Engineering Agent AI gateway — model routing, context compression, telemetry.
 */
import { processAIRequest, type AIRequest, type AIResponse } from '../ai';
import { listMemory } from './db';
import { getBusinessMemoryBlock, seedBusinessMemory } from './businessMemory';
import { getCodeMemoryBlock } from './codeMemory';
import {
  buildCompressedPrompt,
  type FileSnippet,
} from './contextCompression';
import {
  routeEngineeringTask,
  type EngineeringAITask,
  type ModelTier,
} from './modelRouter';
import { recordEngineeringAICall } from './aiTelemetry';
import { appendTaskLog } from './db';

export type EngineeringAIRequest = {
  engineeringTask: EngineeringAITask;
  prompt: string;
  userId: number;
  taskId?: string | null;
  /** Raw user/task prompt before compression */
  rawPrompt?: string;
  searchHits?: Array<{ path: string; summary: string }>;
  fileSnippets?: FileSnippet[];
  implementationHistory?: string;
  systemPrompt?: string;
  overrides?: AIRequest['overrides'];
  skipCompression?: boolean;
};

export type EngineeringAIResponse = AIResponse & {
  engineeringTask: EngineeringAITask;
  modelTier: ModelTier;
  modelUsed: string;
  rawInputChars: number;
  compressedInputChars: number;
  compressionReductionPct: number;
};

export async function processEngineeringAI(
  req: EngineeringAIRequest
): Promise<EngineeringAIResponse> {
  const route = routeEngineeringTask(req.engineeringTask);
  const rawPrompt = req.rawPrompt || req.prompt;

  let businessMemory = '';
  let codeMemory = '';
  const needsBusiness =
    route.tier === 'pro' ||
    ['implementation_plan', 'project_manager_plan', 'architecture_design', 'understand_task'].includes(
      req.engineeringTask
    );
  if (needsBusiness) {
    await seedBusinessMemory().catch(() => undefined);
    businessMemory = await getBusinessMemoryBlock(3000);
    codeMemory = await getCodeMemoryBlock(3500);
  }

  const platformRows = await listMemory('platform');
  const platformMemory = platformRows
    .filter((r) => r.category !== 'business' && r.category !== 'code_memory')
    .slice(0, 8)
    .map((r) => `[${r.category}/${r.key}] ${String(r.content).slice(0, 200)}`)
    .join('\n');

  let finalPrompt = req.prompt;
  let rawChars = rawPrompt.length;
  let compressedChars = rawPrompt.length;
  let reductionPct = 0;

  if (!req.skipCompression && route.tier === 'pro') {
    const compressed = buildCompressedPrompt({
      taskPrompt: req.prompt,
      activeTask: req.taskId ? `Task ID: ${req.taskId}` : undefined,
      businessMemory,
      codeMemory,
      platformMemory,
      fileSnippets: req.fileSnippets,
      searchHits: req.searchHits,
      implementationHistory: req.implementationHistory,
    });
    finalPrompt = compressed.prompt;
    rawChars = compressed.rawChars;
    compressedChars = compressed.compressedChars;
    reductionPct = compressed.reductionPct;
  } else if (route.tier === 'flash' && (businessMemory || codeMemory)) {
    finalPrompt = [businessMemory, codeMemory, req.prompt].filter(Boolean).join('\n\n');
    compressedChars = finalPrompt.length;
  }

  const start = Date.now();
  const aiRes = await processAIRequest({
    agent: 'engineering',
    prompt: finalPrompt,
    userId: req.userId,
    systemPrompt: req.systemPrompt,
    context: { engineeringTask: req.engineeringTask, taskId: req.taskId },
    overrides: {
      model: route.model,
      maxTokens: route.maxTokens,
      responseVerbosity: route.verbosity,
      jsonMode: req.overrides?.jsonMode ?? true,
      structuredOutput: req.overrides?.structuredOutput ?? true,
      ...req.overrides,
    },
  });

  const latencyMs = aiRes.latency || Date.now() - start;

  await recordEngineeringAICall({
    taskId: req.taskId,
    userId: req.userId,
    engineeringTask: req.engineeringTask,
    model: aiRes.model || route.model,
    tier: route.tier,
    provider: aiRes.provider || 'gemini',
    usage: aiRes.usage,
    latencyMs,
    rawInputChars: rawChars,
    compressedInputChars: compressedChars,
    success: aiRes.success,
    errorMessage: aiRes.error,
  });

  if (req.taskId) {
    await appendTaskLog(req.taskId, {
      eventType: 'ai_model_call',
      message: `${req.engineeringTask} → ${route.tier} (${aiRes.model || route.model})`,
      payload: {
        engineeringTask: req.engineeringTask,
        model: aiRes.model || route.model,
        tier: route.tier,
        tokens: aiRes.usage?.totalTokens,
        costUsd: aiRes.usage?.costUsd,
        latencyMs,
        compressionReductionPct: reductionPct,
      },
    });
  }

  return {
    ...aiRes,
    engineeringTask: req.engineeringTask,
    modelTier: route.tier,
    modelUsed: aiRes.model || route.model,
    rawInputChars: rawChars,
    compressedInputChars: compressedChars,
    compressionReductionPct: reductionPct,
  };
}
