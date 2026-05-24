import fs from 'fs';
import { join } from 'path';
import { pool } from '../config/db_pg';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { ProviderId } from './aiProviders/types';
import {
  DEFAULT_RESPONSE_VERBOSITY,
  normalizeResponseVerbosity,
  type ResponseVerbosity,
} from './responseOptimization';

export type AISettingsRecord = {
  primaryProvider: ProviderId;
  fallbackProvider: ProviderId;
  primaryModel: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  softLimitUsd: number;
  hardLimitUsd: number;
  jsonMode: boolean;
  structuredOutput: boolean;
  debugMode: boolean;
  openaiEnabled: boolean;
  extendedFallback: boolean;
  responseVerbosity: ResponseVerbosity;
  updatedAt: string;
};

export type AISettingsPublic = AISettingsRecord & {
  apiKeys: {
    gemini: { configured: boolean; masked: string | null };
    groq: { configured: boolean; masked: string | null };
    openai: { configured: boolean; masked: string | null };
  };
};

const DEFAULTS: AISettingsRecord = {
  primaryProvider: (env.AI_PRIMARY_PROVIDER as ProviderId) || 'gemini',
  fallbackProvider: (env.AI_FALLBACK_PROVIDER as ProviderId) || 'groq',
  primaryModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
  fallbackModel: 'llama-3.1-8b-instant',
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.95,
  softLimitUsd: env.AI_PLATFORM_COST_SOFT_USD,
  hardLimitUsd: env.AI_PLATFORM_COST_HARD_USD,
  jsonMode: false,
  structuredOutput: false,
  debugMode: false,
  openaiEnabled: false,
  extendedFallback: env.AI_EXTENDED_FALLBACK,
  responseVerbosity: DEFAULT_RESPONSE_VERBOSITY,
  updatedAt: new Date().toISOString(),
};

let cached: AISettingsRecord | null = null;
let cachedAt = 0;
const CACHE_MS = 2000;

export function maskApiKey(key: string | undefined | null): string | null {
  if (!key || key.length < 8) return null;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function rowToSettings(row: Record<string, unknown>): AISettingsRecord {
  return {
    primaryProvider: String(row.primary_provider) as ProviderId,
    fallbackProvider: String(row.fallback_provider) as ProviderId,
    primaryModel: String(row.primary_model),
    fallbackModel: String(row.fallback_model),
    temperature: Number(row.temperature),
    maxTokens: Number(row.max_tokens),
    topP: Number(row.top_p),
    softLimitUsd: Number(row.soft_limit_usd),
    hardLimitUsd: Number(row.hard_limit_usd),
    jsonMode: Boolean(row.json_mode),
    structuredOutput: Boolean(row.structured_output),
    debugMode: Boolean(row.debug_mode),
    openaiEnabled: Boolean(row.openai_enabled),
    extendedFallback: Boolean(row.extended_fallback),
    responseVerbosity: normalizeResponseVerbosity(row.response_verbosity),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getAISettings(force = false): Promise<AISettingsRecord> {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) {
    return cached;
  }
  try {
    const r = await pool.query('SELECT * FROM ai_settings WHERE id = 1');
    if (r.rows[0]) {
      cached = rowToSettings(r.rows[0]);
      cachedAt = Date.now();
      return cached;
    }
  } catch (err: unknown) {
    logger.warn('ai_settings table unavailable, using env defaults', {
      error: err instanceof Error ? err.message : err,
    });
  }
  cached = { ...DEFAULTS };
  cachedAt = Date.now();
  return cached;
}

export function invalidateAISettingsCache(): void {
  cached = null;
  cachedAt = 0;
}

export async function getAISettingsPublic(): Promise<AISettingsPublic> {
  const s = await getAISettings();
  return {
    ...s,
    apiKeys: {
      gemini: { configured: Boolean(env.GEMINI_API_KEY), masked: maskApiKey(env.GEMINI_API_KEY) },
      groq: { configured: Boolean(env.GROQ_API_KEY), masked: maskApiKey(env.GROQ_API_KEY) },
      openai: { configured: Boolean(env.OPENAI_API_KEY), masked: maskApiKey(env.OPENAI_API_KEY) },
    },
  };
}

const VALID_PROVIDERS = new Set(['gemini', 'groq', 'openai', 'openrouter']);

export type AISettingsPatch = Partial<{
  primaryProvider: string;
  fallbackProvider: string;
  primaryModel: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  softLimitUsd: number;
  hardLimitUsd: number;
  jsonMode: boolean;
  structuredOutput: boolean;
  debugMode: boolean;
  openaiEnabled: boolean;
  extendedFallback: boolean;
  responseVerbosity: ResponseVerbosity;
  apiKeys: Partial<{ gemini?: string; groq?: string; openai?: string }>;
}>;

export async function updateAISettings(patch: AISettingsPatch): Promise<AISettingsPublic> {
  const current = await getAISettings(true);

  if (patch.primaryProvider && !VALID_PROVIDERS.has(patch.primaryProvider)) {
    throw new Error('Invalid primary provider');
  }
  if (patch.fallbackProvider && !VALID_PROVIDERS.has(patch.fallbackProvider)) {
    throw new Error('Invalid fallback provider');
  }
  if (patch.openaiEnabled === false && patch.primaryProvider === 'openai') {
    throw new Error('OpenAI cannot be primary while disabled');
  }

  const next = {
    primary_provider: patch.primaryProvider ?? current.primaryProvider,
    fallback_provider: patch.fallbackProvider ?? current.fallbackProvider,
    primary_model: patch.primaryModel ?? current.primaryModel,
    fallback_model: patch.fallbackModel ?? current.fallbackModel,
    temperature: patch.temperature ?? current.temperature,
    max_tokens: patch.maxTokens ?? current.maxTokens,
    top_p: patch.topP ?? current.topP,
    soft_limit_usd: patch.softLimitUsd ?? current.softLimitUsd,
    hard_limit_usd: patch.hardLimitUsd ?? current.hardLimitUsd,
    json_mode: patch.jsonMode ?? current.jsonMode,
    structured_output: patch.structuredOutput ?? current.structuredOutput,
    debug_mode: patch.debugMode ?? current.debugMode,
    openai_enabled: patch.openaiEnabled ?? current.openaiEnabled,
    extended_fallback: patch.extendedFallback ?? current.extendedFallback,
    response_verbosity: patch.responseVerbosity ?? current.responseVerbosity,
  };

  await pool.query(
    `UPDATE ai_settings SET
      primary_provider = $1,
      fallback_provider = $2,
      primary_model = $3,
      fallback_model = $4,
      temperature = $5,
      max_tokens = $6,
      top_p = $7,
      soft_limit_usd = $8,
      hard_limit_usd = $9,
      json_mode = $10,
      structured_output = $11,
      debug_mode = $12,
      openai_enabled = $13,
      extended_fallback = $14,
      response_verbosity = $15,
      updated_at = NOW()
     WHERE id = 1`,
    [
      next.primary_provider,
      next.fallback_provider,
      next.primary_model,
      next.fallback_model,
      next.temperature,
      next.max_tokens,
      next.top_p,
      next.soft_limit_usd,
      next.hard_limit_usd,
      next.json_mode,
      next.structured_output,
      next.debug_mode,
      next.openai_enabled,
      next.extended_fallback,
      next.response_verbosity,
    ]
  );

  if (patch.apiKeys) {
    await updateEnvApiKeys(patch.apiKeys);
  }

  invalidateAISettingsCache();
  logger.info('AI settings updated', {
    primary: next.primary_provider,
    fallback: next.fallback_provider,
    jsonMode: next.json_mode,
    responseVerbosity: next.response_verbosity,
  });
  return getAISettingsPublic();
}

function updateEnvApiKeys(keys: Partial<{ gemini?: string; groq?: string; openai?: string }>): void {
  const envPath = join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  let content = fs.readFileSync(envPath, 'utf8');
  const setKey = (name: string, value: string) => {
    const re = new RegExp(`^${name}=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, `${name}=${value}`);
    else content += `\n${name}=${value}`;
    process.env[name] = value;
  };

  if (keys.gemini?.trim()) setKey('GEMINI_API_KEY', keys.gemini.trim());
  if (keys.groq?.trim()) setKey('GROQ_API_KEY', keys.groq.trim());
  if (keys.openai?.trim()) setKey('OPENAI_API_KEY', keys.openai.trim());

  fs.writeFileSync(envPath, content);
}

export const MODEL_OPTIONS: Record<string, { label: string; models: string[] }> = {
  gemini: {
    label: 'Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest'],
  },
  groq: {
    label: 'Groq',
    models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  },
  openai: {
    label: 'OpenAI',
    models: ['gpt-4.1-mini', 'gpt-4o-mini'],
  },
};
