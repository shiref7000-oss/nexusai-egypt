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

const MODEL = PROVIDER_MODELS.gemini;
const MAX_ATTEMPTS = 3;

function geminiKeys(): string[] {
  return [env.GEMINI_API_KEY, env.GEMINI_KEY_1, env.GEMINI_KEY_2, env.GEMINI_KEY_3].filter(
    Boolean
  ) as string[];
}

export const geminiAdapter: ProviderAdapter = {
  id: 'gemini',
  model: MODEL,
  isConfigured: () => geminiKeys().length > 0,
  complete: (req, startAttempt) => completeGemini(req, startAttempt),
};

async function completeGemini(req: CompletionRequest, startAttempt: number): Promise<CompletionResult> {
  const keys = geminiKeys();
  if (!keys.length) {
    return fail('gemini', 'GEMINI_API_KEY not configured', 0);
  }

  let lastError = 'Unknown error';
  const compactUser = `${req.systemPrompt}\n\n${req.userPrompt}`.slice(0, 12000);

  for (let i = startAttempt; i < MAX_ATTEMPTS; i++) {
    if (i > startAttempt) await sleep(backoffMs(i));
    const key = keys[i % keys.length];
    const start = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: compactUser }] }],
          generationConfig: {
            temperature: req.temperature ?? 0.6,
            maxOutputTokens: req.maxTokens ?? 700,
            ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: AbortSignal.timeout(req.timeoutMs ?? 25000),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        lastError = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
        if (isRetryableStatus(res.status)) continue;
        return fail('gemini', lastError, latencyMs);
      }

      const data = (await res.json()) as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastError = 'Empty response';
        continue;
      }

      const meta = data.usageMetadata || {};
      const promptTokens = meta.promptTokenCount ?? Math.ceil(compactUser.length / 4);
      const completionTokens = meta.candidatesTokenCount ?? Math.ceil(text.length / 4);
      const totalTokens = meta.totalTokenCount ?? promptTokens + completionTokens;

      return {
        success: true,
        text,
        provider: 'gemini',
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
  return fail('gemini', lastError, 0);
}

function fail(provider: 'gemini', error: string, latencyMs: number): CompletionResult {
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
