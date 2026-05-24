import { env } from '../../../config/env';
import { estimateCostUsd, PROVIDER_MODELS } from '../pricing';
import type { CompletionRequest, CompletionResult } from '../types';
import {
  backoffMs,
  isRetryableError,
  isRetryableStatus,
  sleep,
  type ProviderAdapter,
} from './base';

const MODEL = PROVIDER_MODELS.groq;
const MAX_ATTEMPTS = 3;

export const groqAdapter: ProviderAdapter = {
  id: 'groq',
  model: MODEL,
  isConfigured: () => Boolean(env.GROQ_API_KEY),
  complete: (req, startAttempt) => completeGroq(req, startAttempt),
};

async function completeGroq(req: CompletionRequest, startAttempt: number): Promise<CompletionResult> {
  const key = env.GROQ_API_KEY;
  if (!key) {
    return fail('groq', 'GROQ_API_KEY not configured', 0);
  }

  let lastError = 'Unknown error';
  for (let i = startAttempt; i < MAX_ATTEMPTS; i++) {
    if (i > startAttempt) await sleep(backoffMs(i));
    const start = Date.now();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
          temperature: req.temperature ?? 0.6,
          max_tokens: req.maxTokens ?? 700,
          ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(req.timeoutMs ?? 25000),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        lastError = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
        if (isRetryableStatus(res.status)) continue;
        return fail('groq', lastError, latencyMs);
      }

      const data = (await res.json()) as any;
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        lastError = 'Empty response';
        continue;
      }

      const usage = data.usage || {};
      const promptTokens = usage.prompt_tokens ?? Math.ceil(req.systemPrompt.length / 4);
      const completionTokens = usage.completion_tokens ?? Math.ceil(text.length / 4);
      const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

      return {
        success: true,
        text,
        provider: 'groq',
        model: MODEL,
        latencyMs,
        usage: { promptTokens, completionTokens, totalTokens },
        costUsd: estimateCostUsd(MODEL, promptTokens, completionTokens),
        attempts: i + 1,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      if (!isRetryableError(err)) break;
    }
  }
  return fail('groq', lastError, 0);
}

function fail(provider: 'groq', error: string, latencyMs: number): CompletionResult {
  return {
    success: false,
    text: '',
    provider,
    model: MODEL,
    latencyMs,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    costUsd: 0,
    error,
  };
}
