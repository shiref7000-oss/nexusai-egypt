import { createHash } from 'crypto';
import type { CompletionResult } from './types';

const MAX_ENTRIES = 400;
const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  result: CompletionResult;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

function cacheKey(agent: string, system: string, user: string): string {
  return createHash('sha256')
    .update(`${agent}|${system.slice(0, 2000)}|${user.slice(0, 4000)}`)
    .digest('hex');
}

export function getCached(
  agent: string,
  systemPrompt: string,
  userPrompt: string
): CompletionResult | null {
  const key = cacheKey(agent, systemPrompt, userPrompt);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

export function setCached(
  agent: string,
  systemPrompt: string,
  userPrompt: string,
  result: CompletionResult
): void {
  if (!result.success) return;
  if (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  const key = cacheKey(agent, systemPrompt, userPrompt);
  store.set(key, { result, expiresAt: Date.now() + TTL_MS });
}

export function cacheStats(): { size: number; maxEntries: number } {
  return { size: store.size, maxEntries: MAX_ENTRIES };
}
