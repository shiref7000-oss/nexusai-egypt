import { logger } from '../config/logger';
import { env } from '../config/env';
import {
  completeWithFallback,
  getProviderAnalyticsSnapshot,
  getProviderHealth,
} from './aiProviders';
import {
  PlatformBudgetExceededError,
  checkPlatformCostBudget,
} from './aiProviders/platformCost';
import { getAISettings } from './aiSettings';
import {
  composeOptimizedSystemPrompt,
  maxTokensForVerbosity,
  normalizeResponseVerbosity,
  type ResponseVerbosity,
} from './responseOptimization';

export { getProviderHealth, getProviderAnalyticsSnapshot, checkPlatformCostBudget };

export interface AIRequest {
  agent: string;
  prompt: string;
  context?: Record<string, any>;
  systemPrompt?: string;
  userId?: number;
  /** Admin / test overrides */
  overrides?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    jsonMode?: boolean;
    structuredOutput?: boolean;
    plainText?: boolean;
    responseVerbosity?: ResponseVerbosity;
  };
}

export interface AIResponse {
  success: boolean;
  response: string;
  agent: string;
  provider: string;
  model?: string;
  latency: number;
  structured?: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  error?: string;
  cached?: boolean;
  debug?: { rawText: string; jsonMode: boolean; structuredOutput: boolean };
}

/** CEO domain base — verbosity/structure applied by responseOptimization layer. */
export const CEO_CONSULTANT_SYSTEM = `مستشار أعمال أول (Fractional CEO) لمتاجر التجارة الإلكترونية في مصر: COD، ميتا، شحن، هامش، وفريق تشغيل صغير. عربية أعمال مصرية.`;

/** Agent registry — CEO, Ads, Support, Shipping, WhatsApp confirmation */
export const AGENT_PROMPTS: Record<string, { system: string; buildUser: (ctx: any) => string }> = {
  support: {
    system: `NexusAI Egyptian support. JSON only: {response_ar, response_en, intent, sentiment, escalation_needed, suggested_action, confidence}. Warm Egyptian dialect.`,
    buildUser: (ctx) =>
      `Msg: "${ctx.message || ctx.prompt || ''}" | ${ctx.customerName || 'عميل'} | Order: ${ctx.orderId || 'N/A'}`,
  },
  moderator: {
    system: `NexusAI support (WhatsApp). JSON: {response_ar, response_en, intent, sentiment, escalation_needed, suggested_action, confidence}.`,
    buildUser: (ctx) => `WhatsApp: "${ctx.message || ctx.prompt || ''}" | ${ctx.customerName || 'عميل'}`,
  },
  confirmation: {
    system: `WhatsApp order confirmation AI. JSON: {confirmation_message, english_version, delivery_estimate, risk_level, suggested_action, confidence}. Egyptian Arabic.`,
    buildUser: (ctx) =>
      `${ctx.customerName || 'عميل'} | ${ctx.amount || 0} EGP | ${ctx.city || 'Cairo'} | ${ctx.product || 'Item'}`,
  },
  ads: {
    system: `Egyptian ads AI. JSON: {variations:[{hook, primaryText, headline, cta, angle}]}. Franco-Arabic OK. Max 3 variations.`,
    buildUser: (ctx) =>
      `${ctx.product || 'product'} | ${ctx.platform || 'Facebook'} | ${ctx.audience || 'Egypt'}`,
  },
  shipping: {
    system: `Logistics AI. JSON: {headline, insight, recommendations[], alerts[], confidence}.`,
    buildUser: (ctx) => {
      const orders = ctx.orders || [];
      const delivered = orders.filter((o: any) => o.status === 'delivered').length;
      const delayed = orders.filter((o: any) => (o.daysInTransit || 0) > 3).length;
      return `Orders:${orders.length} Delivered:${delivered} Delayed:${delayed}`;
    },
  },
  meta: {
    system: `E-commerce analyst. JSON: {headline, grade, summary, insights[], recommendations[], alerts[], scaling_opportunities[], risks[], confidence}.`,
    buildUser: (ctx) =>
      `Rev:${ctx.totalRevenue || 0} Orders:${ctx.totalOrders || 0} ROAS:${ctx.roas || 0} CPA:${ctx.cpa || 0}`,
  },
  ceo: {
    system: CEO_CONSULTANT_SYSTEM,
    buildUser: (ctx) => buildCeoUserPrompt(ctx),
  },
  finance: {
    system: `Finance analyst. JSON: {headline, grade, summary, insights[], recommendations[], alerts[], confidence}.`,
    buildUser: (ctx) => `Rev:${ctx.totalRevenue || 0} Orders:${ctx.totalOrders || 0} ROAS:${ctx.roas || 0}`,
  },
  product: {
    system: `Product Hunter: trending SKUs, margin, demand, competition — Egypt ecommerce. Signal over research reports.`,
    buildUser: (ctx) => String(ctx.prompt || 'Product opportunity scan for Egypt market.'),
  },
  hr: {
    system: `Team operations: staffing, KPIs, accountability, throughput — Egyptian ecommerce scale-up.`,
    buildUser: (ctx) => String(ctx.prompt || ctx.message || 'Team performance review.'),
  },
  engineering: {
    system: `NexusAI Engineering Agent — Phase 1. Stack: React+Vite saas-frontend, Express TypeScript backend/express/src, PostgreSQL, Gemini.
You modify the existing codebase safely. Use ONLY file paths from code_index search — never invent paths.
Return JSON when requested for plans/patches.

ALWAYS: (1) search code_index first, (2) read only relevant files, (3) reuse existing patterns, (4) prefer editing existing modules, (5) strict TypeScript, (6) run build after changes, (7) markdown report.
NEVER: access secrets, modify deployed migrations, deploy, git push/commits, delete core infrastructure.`,
    buildUser: (ctx) => String(ctx.prompt || ctx.message || ''),
  },
};

export const AGENT_ALIASES: Record<string, string> = {
  'ceo agent': 'ceo',
  'ai ads engine': 'ads',
  'ai support': 'support',
  'shipping agent': 'shipping',
  'whatsapp confirmation agent': 'confirmation',
  'whatsapp confirmation': 'confirmation',
  hunter: 'product',
  'product hunter': 'product',
  developer: 'engineering',
  'engineering agent': 'engineering',
  'ai developer': 'engineering',
};

export function resolveAgentKey(agent: string): string {
  const key = agent.toLowerCase().trim();
  return AGENT_ALIASES[key] || key;
}

const GENERIC_CLIENT_SYSTEM_HINTS = [
  'helpful assistant',
  'you are a helpful',
  'assistant for egyptian',
];

function isGenericClientSystemPrompt(text?: string): boolean {
  if (!text?.trim()) return true;
  const lower = text.toLowerCase();
  return GENERIC_CLIENT_SYSTEM_HINTS.some((h) => lower.includes(h));
}

function buildCeoUserPrompt(ctx: Record<string, unknown>): string {
  const parts: string[] = [];
  const question = String(ctx.prompt || ctx.message || '').trim();
  if (question) {
    parts.push(`سؤال المشغّل:\n${question}`);
  }
  const metrics: string[] = [];
  if (ctx.totalRevenue != null) metrics.push(`الإيرادات: ${ctx.totalRevenue} جنيه`);
  if (ctx.totalOrders != null) metrics.push(`الطلبات: ${ctx.totalOrders}`);
  if (ctx.roas != null) metrics.push(`ROAS: ${ctx.roas}`);
  if (ctx.cpa != null) metrics.push(`CPA: ${ctx.cpa}`);
  if (ctx.aov != null) metrics.push(`متوسط قيمة الطلب: ${ctx.aov}`);
  if (ctx.margin != null) metrics.push(`هامش الربح: ${ctx.margin}`);
  if (metrics.length) {
    parts.push(`بيانات السياق المتاحة:\n${metrics.join('\n')}`);
  }
  if (ctx.contextNotes) {
    parts.push(`ملاحظات إضافية:\n${String(ctx.contextNotes)}`);
  }
  return parts.join('\n\n') || question || 'قدّم تقييماً استراتيجياً عاماً لمتجر تجارة إلكترونية مصري.';
}

export async function processAIRequest(req: AIRequest): Promise<AIResponse> {
  const start = Date.now();
  const settings = await getAISettings();
  const agentKey = resolveAgentKey(req.agent);
  const agentConfig = AGENT_PROMPTS[agentKey] || AGENT_PROMPTS.support;
  const ctx = req.context || {};
  const ov = req.overrides || {};

  const isCeoAgent = agentKey === 'ceo';
  const clientSystem =
    req.systemPrompt || (typeof ctx.systemPrompt === 'string' ? ctx.systemPrompt : undefined);

  const verbosity = normalizeResponseVerbosity(
    ov.responseVerbosity ?? ctx.responseVerbosity ?? settings.responseVerbosity
  );

  let useJsonMode = ov.jsonMode ?? settings.jsonMode;
  let useStructured = ov.structuredOutput ?? settings.structuredOutput;
  const preferPlainConsulting = new Set(['ceo', 'hr', 'product', 'meta', 'finance', 'shipping']);
  if (
    preferPlainConsulting.has(agentKey) &&
    ov.jsonMode === undefined &&
    ov.structuredOutput === undefined
  ) {
    useJsonMode = false;
    useStructured = false;
  }

  const plainText =
    ov.plainText === true || preferPlainConsulting.has(agentKey) || (!useJsonMode && !useStructured);

  let baseSystem = agentConfig.system;
  if (isCeoAgent) {
    baseSystem = agentConfig.system;
    if (clientSystem && !isGenericClientSystemPrompt(clientSystem)) {
      baseSystem = `${baseSystem}\nملاحظات المشغّل: ${clientSystem.trim()}`;
    }
  } else {
    baseSystem =
      clientSystem || (typeof ctx.systemPrompt === 'string' ? ctx.systemPrompt : undefined) || agentConfig.system;
  }

  let systemPrompt = composeOptimizedSystemPrompt({
    agentKey,
    baseSystem,
    verbosity,
    plainText,
    useJsonMode,
  });

  const userPrompt = isCeoAgent
    ? buildCeoUserPrompt({ prompt: req.prompt, ...ctx })
    : plainText
      ? req.prompt
      : agentConfig.buildUser({ prompt: req.prompt, ...ctx });

  const inferenceMaxTokens = maxTokensForVerbosity(
    verbosity,
    settings.maxTokens,
    ov.maxTokens
  );
  const inferenceTemperature = ov.temperature ?? settings.temperature;

  let completion;
  try {
    completion = await completeWithFallback({
      systemPrompt,
      userPrompt,
      agent: agentKey,
      model: ov.model,
      jsonMode: useJsonMode,
      maxTokens: inferenceMaxTokens,
      temperature: inferenceTemperature,
      topP: ov.topP ?? settings.topP,
      userId: req.userId,
      timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    });
  } catch (err: unknown) {
    if (err instanceof PlatformBudgetExceededError) {
      return {
        success: false,
        response: '',
        agent: agentKey,
        provider: 'none',
        latency: Date.now() - start,
        error: err.message,
      };
    }
    throw err;
  }

  if (!completion.success) {
    return {
      success: false,
      response: '',
      agent: agentKey,
      provider: completion.provider,
      model: completion.model,
      latency: Date.now() - start,
      error: completion.error || 'AI inference failed',
      usage: {
        promptTokens: completion.usage.promptTokens,
        completionTokens: completion.usage.completionTokens,
        totalTokens: completion.usage.totalTokens,
        costUsd: completion.costUsd,
      },
    };
  }

  let structured: any;
  let responseText: string;

  if (plainText || !useStructured) {
    responseText = completion.text.trim();
    if (useJsonMode && !plainText) {
      try {
        const jsonMatch =
          completion.text.match(/```json\s*([\s\S]*?)\s*```/) ||
          completion.text.match(/```\s*([\s\S]*?)\s*```/);
        const cleanJson = jsonMatch ? jsonMatch[1].trim() : completion.text.trim();
        structured = JSON.parse(cleanJson);
        const formatted = formatStructuredForDisplay(structured);
        if (formatted) responseText = formatted;
      } catch {
        structured = { raw: completion.text };
      }
    }
  } else {
    try {
      const jsonMatch =
        completion.text.match(/```json\s*([\s\S]*?)\s*```/) ||
        completion.text.match(/```\s*([\s\S]*?)\s*```/);
      const cleanJson = jsonMatch ? jsonMatch[1].trim() : completion.text.trim();
      structured = JSON.parse(cleanJson);
    } catch {
      structured = { raw: completion.text };
    }
    responseText = extractResponseText(agentKey, structured);
  }

  const debug = settings.debugMode
    ? { rawText: completion.text.slice(0, 2000), jsonMode: useJsonMode, structuredOutput: useStructured }
    : undefined;

  return {
    success: true,
    response: responseText,
    agent: agentKey,
    provider: completion.provider,
    model: completion.model,
    latency: completion.latencyMs || Date.now() - start,
    structured,
    cached: completion.cached,
    usage: {
      promptTokens: completion.usage.promptTokens,
      completionTokens: completion.usage.completionTokens,
      totalTokens: completion.usage.totalTokens,
      costUsd: completion.costUsd,
    },
    ...(debug ? { debug } : {}),
  };
}

function formatStructuredForDisplay(structured: unknown): string | null {
  if (structured == null) return null;
  if (typeof structured === 'string') return structured.trim() || null;
  if (typeof structured !== 'object') return String(structured);

  const obj = structured as Record<string, unknown>;
  if (typeof obj.raw === 'string' && Object.keys(obj).length === 1) {
    return obj.raw.trim() || null;
  }

  const lines: string[] = [];
  const headline =
    typeof obj.headline === 'string'
      ? obj.headline
      : typeof obj.title === 'string'
        ? obj.title
        : null;
  if (headline?.trim()) lines.push(`## ${headline.trim()}`);

  if (obj.grade != null) lines.push(`**Grade:** ${obj.grade}`);

  for (const key of [
    'summary',
    'insight',
    'problem_analysis',
    'root_cause',
    'financial_impact',
    'recommended_action',
    'priority_level',
    'تحليل_المشكلة',
    'السبب_الجذري',
    'الأثر_المالي',
    'التوصية_العملية',
    'مستوى_الأولوية',
    'response_ar',
    'response_en',
    'response',
    'confirmation_message',
    'english_version',
  ]) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) lines.push('', v.trim());
  }

  const sections: [string, string][] = [
    ['insights', 'Insights'],
    ['recommendations', 'Recommendations'],
    ['alerts', 'Alerts'],
    ['risks', 'Risks'],
    ['scaling_opportunities', 'Scaling opportunities'],
    ['trending_products', 'Trending products'],
    ['variations', 'Ad variations'],
    ['team_metrics', 'Team metrics'],
  ];

  for (const [key, label] of sections) {
    const arr = obj[key];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    lines.push('', `### ${label}`);
    const cap = 6;
    for (const item of arr.slice(0, cap)) {
      if (typeof item === 'string') lines.push(`- ${item}`);
      else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>;
        const hook =
          typeof row.hook === 'string'
            ? row.hook
            : typeof row.headline === 'string'
              ? row.headline
              : null;
        const body =
          typeof row.primaryText === 'string'
            ? row.primaryText
            : typeof row.text === 'string'
              ? row.text
              : null;
        if (hook) lines.push(`- **${hook}**${body ? ` — ${body}` : ''}`);
        else lines.push(`- ${JSON.stringify(item)}`);
      }
    }
    if (arr.length > cap) lines.push(`- _+${arr.length - cap} more_`);
  }

  if (obj.confidence != null) lines.push('', `_Confidence: ${obj.confidence}_`);

  return lines.length > 0 ? lines.join('\n').trim() : null;
}

function extractResponseText(agent: string, structured: any): string {
  if (typeof structured === 'string') return structured;
  const formatted = formatStructuredForDisplay(structured);
  if (formatted) return formatted;
  if (agent === 'support' || agent === 'moderator') {
    return structured.response_ar || structured.response_en || structured.response || JSON.stringify(structured);
  }
  if (agent === 'confirmation') {
    return structured.confirmation_message || structured.english_version || JSON.stringify(structured);
  }
  return JSON.stringify(structured, null, 2);
}
