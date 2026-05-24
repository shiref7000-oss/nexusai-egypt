import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { getAISettings } from '../aiSettings';
import { groqAdapter } from './adapters/groq';
import { geminiAdapter } from './adapters/gemini';
import { openrouterAdapter } from './adapters/openrouter';
import { openaiAdapter } from './adapters/openai';
import type { ProviderAdapter } from './adapters/base';
import { getCached, setCached } from './cache';
import {
  buildHealth,
  getRecentAttempts,
  isProviderAvailable,
  recordAttempt,
  recordSuccessResult,
} from './metrics';
import type { CompletionRequest, CompletionResult, ProviderHealth, ProviderId } from './types';
import { assertPlatformAIBudget } from './platformCost';

const ALL_ADAPTERS: ProviderAdapter[] = [
  geminiAdapter,
  groqAdapter,
  openrouterAdapter,
  openaiAdapter,
];

const ADAPTER_BY_ID: Record<ProviderId, ProviderAdapter> = {
  gemini: geminiAdapter,
  groq: groqAdapter,
  openrouter: openrouterAdapter,
  openai: openaiAdapter,
};

function resolveAdapter(id: string): ProviderAdapter | undefined {
  return ADAPTER_BY_ID[id as ProviderId];
}

export type ChainEntry = { adapter: ProviderAdapter; model: string; role: string };

/** Runtime provider chain from DB settings (hot-reloaded ~2s). */
export async function getInferenceChain(): Promise<ChainEntry[]> {
  const settings = await getAISettings();
  const chain: ChainEntry[] = [];

  const add = (id: string, model: string, role: string) => {
    if (id === 'openai' && !settings.openaiEnabled) return;
    const adapter = resolveAdapter(id);
    if (adapter?.isConfigured()) {
      chain.push({ adapter, model, role });
    }
  };

  add(settings.primaryProvider, settings.primaryModel, 'primary');
  if (settings.fallbackProvider !== settings.primaryProvider) {
    add(settings.fallbackProvider, settings.fallbackModel, 'fallback');
  }

  if (settings.extendedFallback) {
    for (const adapter of ALL_ADAPTERS) {
      if (!chain.some((c) => c.adapter.id === adapter.id) && adapter.isConfigured()) {
        if (adapter.id === 'openai' && !settings.openaiEnabled) continue;
        chain.push({ adapter, model: adapter.model, role: 'extended' });
      }
    }
  }

  return chain;
}

export function getConfiguredProviders(): ProviderAdapter[] {
  return ALL_ADAPTERS.filter((p) => p.isConfigured());
}

export function getProviderHealth(): ProviderHealth[] {
  return buildHealth(ALL_ADAPTERS);
}

export async function getProviderAnalyticsSnapshot() {
  const settings = await getAISettings();
  const chain = await getInferenceChain();
  return {
    health: getProviderHealth(),
    recentAttempts: getRecentAttempts(40),
    configuredCount: getConfiguredProviders().length,
    primaryProvider: settings.primaryProvider,
    fallbackProvider: settings.fallbackProvider,
    primaryModel: settings.primaryModel,
    fallbackModel: settings.fallbackModel,
    settings: {
      jsonMode: settings.jsonMode,
      structuredOutput: settings.structuredOutput,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    },
    chain: chain.map((p) => ({
      id: p.adapter.id,
      model: p.model,
      configured: p.adapter.isConfigured(),
      role: p.role,
    })),
    allProviders: ALL_ADAPTERS.map((p) => ({
      id: p.id,
      model: p.model,
      configured: p.isConfigured(),
    })),
  };
}

/**
 * Primary → fallback completion with cache, retries, circuit breaker, and platform budget guard.
 */
export async function completeWithFallback(req: CompletionRequest): Promise<CompletionResult> {
  await assertPlatformAIBudget();

  const settings = await getAISettings();
  const agent = req.agent || 'default';
  const skipCache = agent === 'ceo';
  const cached = skipCache ? null : getCached(agent, req.systemPrompt, req.userPrompt);
  if (cached) return cached;

  const errors: string[] = [];
  const chain = await getInferenceChain();
  const timeoutMs = req.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;

  if (!chain.length) {
    return {
      success: false,
      text: '',
      provider: settings.primaryProvider,
      model: 'none',
      latencyMs: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costUsd: 0,
      error: 'No AI providers configured. Set GEMINI_API_KEY (primary) and GROQ_API_KEY (fallback) in server .env',
    };
  }

  for (const entry of chain) {
    const { adapter, model } = entry;
    if (!isProviderAvailable(adapter.id)) {
      errors.push(`${adapter.id}: circuit open`);
      continue;
    }

    const result = await adapter.complete(
      {
        ...req,
        model: req.model || model,
        timeoutMs,
        temperature: req.temperature ?? settings.temperature,
        maxTokens: req.maxTokens ?? settings.maxTokens,
        topP: req.topP ?? settings.topP,
        jsonMode: req.jsonMode ?? settings.jsonMode,
      },
      0
    );

    recordAttempt({
      provider: adapter.id,
      model: result.model,
      success: result.success,
      latencyMs: result.latencyMs,
      error: result.error,
      attempt: result.attempts || 1,
      timestamp: Date.now(),
    });

    if (result.success) {
      recordSuccessResult(result);
      if (!skipCache) {
        setCached(agent, req.systemPrompt, req.userPrompt, result);
      }
      logger.info('AI completion success', {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        tokens: result.usage.totalTokens,
        costUsd: result.costUsd,
        agent,
        role: entry.role,
        jsonMode: req.jsonMode ?? settings.jsonMode,
      });
      return result;
    }

    errors.push(`${adapter.id}: ${result.error}`);
    logger.warn('AI provider failed, trying fallback', {
      provider: adapter.id,
      error: result.error,
      agent,
      next: chain[chain.indexOf(entry) + 1]?.adapter.id,
    });
  }

  const error = `All providers failed: ${errors.join(' | ')}`;
  logger.error('AI orchestration exhausted', { agent, errors, chain: chain.map((c) => c.adapter.id) });
  return {
    success: false,
    text: '',
    provider: chain[chain.length - 1].adapter.id,
    model: chain[chain.length - 1].model,
    latencyMs: 0,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    costUsd: 0,
    error,
  };
}
