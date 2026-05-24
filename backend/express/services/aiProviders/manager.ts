import { logger } from '../../config/logger';
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
import type { CompletionRequest, CompletionResult, ProviderHealth } from './types';

/** Cheapest → most expensive */
const PROVIDER_CHAIN: ProviderAdapter[] = [
  groqAdapter,
  geminiAdapter,
  openrouterAdapter,
  openaiAdapter,
];

export function getConfiguredProviders(): ProviderAdapter[] {
  return PROVIDER_CHAIN.filter((p) => p.isConfigured());
}

export function getProviderHealth(): ProviderHealth[] {
  return buildHealth(PROVIDER_CHAIN);
}

export function getProviderAnalyticsSnapshot() {
  return {
    health: getProviderHealth(),
    recentAttempts: getRecentAttempts(40),
    configuredCount: getConfiguredProviders().length,
    chain: PROVIDER_CHAIN.map((p) => ({
      id: p.id,
      model: p.model,
      configured: p.isConfigured(),
    })),
  };
}

/**
 * Multi-provider completion with cache, fallback, per-provider retries, and circuit breaker.
 */
export async function completeWithFallback(req: CompletionRequest): Promise<CompletionResult> {
  const agent = req.agent || 'default';
  const cached = getCached(agent, req.systemPrompt, req.userPrompt);
  if (cached) return cached;

  const errors: string[] = [];
  const chain = PROVIDER_CHAIN.filter((p) => p.isConfigured());

  if (!chain.length) {
    return {
      success: false,
      text: '',
      provider: 'groq',
      model: 'none',
      latencyMs: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costUsd: 0,
      error: 'No AI providers configured. Set GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in .env',
    };
  }

  for (const adapter of chain) {
    if (!isProviderAvailable(adapter.id)) {
      errors.push(`${adapter.id}: circuit open`);
      continue;
    }

    const result = await adapter.complete(req, 0);
    recordAttempt({
      provider: adapter.id,
      model: adapter.model,
      success: result.success,
      latencyMs: result.latencyMs,
      error: result.error,
      attempt: result.attempts || 1,
      timestamp: Date.now(),
    });

    if (result.success) {
      recordSuccessResult(result);
      setCached(agent, req.systemPrompt, req.userPrompt, result);
      logger.info('AI completion success', {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        tokens: result.usage.totalTokens,
        agent,
        cached: false,
      });
      return result;
    }

    errors.push(`${adapter.id}: ${result.error}`);
    logger.warn('AI provider failed, trying fallback', {
      provider: adapter.id,
      error: result.error,
      agent,
    });
  }

  const error = `All providers failed: ${errors.join(' | ')}`;
  logger.error('AI orchestration exhausted', { agent, errors });
  return {
    success: false,
    text: '',
    provider: chain[chain.length - 1].id,
    model: chain[chain.length - 1].model,
    latencyMs: 0,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    costUsd: 0,
    error,
  };
}
