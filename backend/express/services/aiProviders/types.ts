export type ProviderId = 'groq' | 'gemini' | 'openrouter' | 'openai';

export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  agent?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  userId?: number;
  timeoutMs?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResult {
  success: boolean;
  text: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  usage: TokenUsage;
  costUsd: number;
  cached?: boolean;
  attempts?: number;
  error?: string;
}

export interface ProviderHealth {
  id: ProviderId;
  model: string;
  enabled: boolean;
  healthy: boolean;
  configured: boolean;
  failures: number;
  lastError: string | null;
  lastSuccessAt: number | null;
  avgLatencyMs: number;
  callCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface ProviderAttemptLog {
  provider: ProviderId;
  model: string;
  success: boolean;
  latencyMs: number;
  error?: string;
  statusCode?: number;
  attempt: number;
  timestamp: number;
}
