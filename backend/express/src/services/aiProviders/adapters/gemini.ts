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

const MODEL = env.GEMINI_MODEL || PROVIDER_MODELS.gemini;
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

  const model = req.model || MODEL;
  let lastError = 'Unknown error';
  const systemText = (req.systemPrompt || '').trim().slice(0, 8000);
  const userText = (req.userPrompt || '').trim().slice(0, 12000);

  for (let i = startAttempt; i < MAX_ATTEMPTS; i++) {
    if (i > startAttempt) await sleep(backoffMs(i));
    const key = keys[i % keys.length];
    const start = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          ...(systemText
            ? { systemInstruction: { parts: [{ text: systemText }] } }
            : {}),
          contents: [{ role: 'user', parts: [{ text: userText || systemText }] }],
          generationConfig: {
            temperature: req.temperature ?? 0.7,
            maxOutputTokens: req.maxTokens ?? 2048,
            topP: req.topP ?? 0.95,
            // Gemini 2.5 uses "thinking" tokens inside maxOutputTokens — disable for full visible answers
            thinkingConfig: { thinkingBudget: 0 },
            ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: AbortSignal.timeout(req.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text();
        lastError = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
        if (isRetryableStatus(res.status)) continue;
        return fail('gemini', lastError, latencyMs);
      }

      const data = (await res.json()) as any;
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .map((p: { text?: string }) => p.text)
        .filter(Boolean)
        .join('\n')
        .trim();
      if (!text) {
        const finish = data.candidates?.[0]?.finishReason;
        lastError = finish ? `Empty response (${finish})` : 'Empty response';
        continue;
      }

      const meta = data.usageMetadata || {};
      const promptTokens =
        meta.promptTokenCount ?? Math.ceil((systemText.length + userText.length) / 4);
      const completionTokens = meta.candidatesTokenCount ?? Math.ceil(text.length / 4);
      const totalTokens = meta.totalTokenCount ?? promptTokens + completionTokens;

      return {
        success: true,
        text,
        provider: 'gemini',
        model,
        latencyMs,
        usage: { promptTokens, completionTokens, totalTokens },
        costUsd: estimateCostUsd(model, promptTokens, completionTokens),
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
