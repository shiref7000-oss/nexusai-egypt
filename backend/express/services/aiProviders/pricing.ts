import type { ProviderId } from './types';

/** USD per 1M tokens (input / output) — estimates for cost analytics */
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'llama-3.1-8b-instant': { inputPer1M: 0.05, outputPer1M: 0.08 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'deepseek/deepseek-chat': { inputPer1M: 0.14, outputPer1M: 0.28 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
};

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const rates = MODEL_PRICING[model] || { inputPer1M: 0.5, outputPer1M: 1.5 };
  return (
    (promptTokens / 1_000_000) * rates.inputPer1M +
    (completionTokens / 1_000_000) * rates.outputPer1M
  );
}

export const PROVIDER_MODELS: Record<ProviderId, string> = {
  groq: 'llama-3.1-8b-instant',
  gemini: 'gemini-1.5-flash',
  openrouter: 'deepseek/deepseek-chat',
  openai: 'gpt-4.1-mini',
};
