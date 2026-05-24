import { logger } from '../config/logger';
import {
  completeWithFallback,
  getProviderAnalyticsSnapshot,
  getProviderHealth,
} from './aiProviders';

export { getProviderHealth, getProviderAnalyticsSnapshot };

export interface AIRequest {
  agent: string;
  prompt: string;
  context?: Record<string, any>;
  systemPrompt?: string;
  userId?: number;
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
}

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
    system: `CEO business analyst. JSON: {headline, grade, summary, insights[], recommendations[], alerts[], scaling_opportunities[], risks[], confidence}.`,
    buildUser: (ctx) =>
      `Rev:${ctx.totalRevenue || 0} Orders:${ctx.totalOrders || 0} ROAS:${ctx.roas || 0} CPA:${ctx.cpa || 0}`,
  },
  finance: {
    system: `Finance analyst. JSON: {headline, grade, summary, insights[], recommendations[], alerts[], confidence}.`,
    buildUser: (ctx) => `Rev:${ctx.totalRevenue || 0} Orders:${ctx.totalOrders || 0} ROAS:${ctx.roas || 0}`,
  },
  product: {
    system: `Product research AI. JSON: {headline, insights[], recommendations[], trending_products[], confidence}.`,
    buildUser: () => `Egypt e-commerce product opportunities.`,
  },
  hr: {
    system: `HR assistant. JSON: {headline, insights[], recommendations[], team_metrics, confidence}.`,
    buildUser: () => `Team performance.`,
  },
};

export const AGENT_ALIASES: Record<string, string> = {
  'ceo agent': 'ceo',
  'ai ads engine': 'ads',
  'ai support': 'support',
  'shipping agent': 'shipping',
  'whatsapp confirmation agent': 'confirmation',
  'whatsapp confirmation': 'confirmation',
};

export function resolveAgentKey(agent: string): string {
  const key = agent.toLowerCase().trim();
  return AGENT_ALIASES[key] || key;
}

export async function processAIRequest(req: AIRequest): Promise<AIResponse> {
  const start = Date.now();
  const agentKey = resolveAgentKey(req.agent);
  const agentConfig = AGENT_PROMPTS[agentKey] || AGENT_PROMPTS.support;
  const systemPrompt = req.systemPrompt || agentConfig.system;
  const userPrompt = agentConfig.buildUser({ prompt: req.prompt, ...req.context });

  const completion = await completeWithFallback({
    systemPrompt,
    userPrompt,
    agent: agentKey,
    jsonMode: true,
    maxTokens: 700,
    temperature: 0.6,
    userId: req.userId,
    timeoutMs: 28000,
  });

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
  try {
    const jsonMatch =
      completion.text.match(/```json\s*([\s\S]*?)\s*```/) ||
      completion.text.match(/```\s*([\s\S]*?)\s*```/);
    const cleanJson = jsonMatch ? jsonMatch[1].trim() : completion.text.trim();
    structured = JSON.parse(cleanJson);
  } catch {
    structured = { raw: completion.text };
  }

  const responseText = extractResponseText(agentKey, structured);

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
  };
}

function extractResponseText(agent: string, structured: any): string {
  if (typeof structured === 'string') return structured;
  if (agent === 'support' || agent === 'moderator') {
    return structured.response_ar || structured.response_en || structured.response || JSON.stringify(structured);
  }
  if (agent === 'confirmation') {
    return structured.confirmation_message || structured.english_version || JSON.stringify(structured);
  }
  if (agent === 'ads') {
    return (
      structured.variations?.map((v: any) => `${v.hook}: ${v.headline}`).join('\n') ||
      JSON.stringify(structured)
    );
  }
  if (['shipping', 'meta', 'ceo', 'finance'].includes(agent)) {
    return structured.headline || structured.summary || JSON.stringify(structured);
  }
  return JSON.stringify(structured);
}
