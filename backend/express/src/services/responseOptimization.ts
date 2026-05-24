/**
 * Global response optimization — high-signal operational intelligence, not essays.
 */

export type ResponseVerbosity = 'concise' | 'balanced' | 'deep-analysis';

export const RESPONSE_VERBOSITY_MODES: ResponseVerbosity[] = ['concise', 'balanced', 'deep-analysis'];

export const DEFAULT_RESPONSE_VERBOSITY: ResponseVerbosity = 'balanced';

export function normalizeResponseVerbosity(value: unknown): ResponseVerbosity {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'concise' || v === 'short') return 'concise';
  if (v === 'deep' || v === 'deep-analysis' || v === 'deep_analysis') return 'deep-analysis';
  return 'balanced';
}

/** Token ceiling per verbosity (hard cap for cost/latency). */
export function maxTokensForVerbosity(
  verbosity: ResponseVerbosity,
  settingsCap: number,
  override?: number
): number {
  if (override != null) return override;
  const modeCap =
    verbosity === 'concise' ? 600 : verbosity === 'deep-analysis' ? 2048 : 900;
  return Math.min(settingsCap, modeCap);
}

const ANTI_BLOAT_RULES = `ANTI-BLOAT (mandatory):
- Do NOT repeat or paraphrase the user's question.
- No motivational filler, greetings fluff, or "great question" phrasing.
- No generic textbook definitions.
- No long introductions — start with signal.
- Prefer short paragraphs (max 2–3 sentences each) and compact bullets.
- Every sentence must add operational value.`;

const FORMAT_STANDARDS = `FORMAT:
- Operational founder/operator tone — direct, specific, confident.
- Use clear section headings and blank lines between sections.
- Bullets for actions and lists; prose only when needed for reasoning.
- Arabic business tone when responding in Arabic (Egyptian ecommerce context).`;

function modeRules(verbosity: ResponseVerbosity): string {
  if (verbosity === 'concise') {
    return `VERBOSITY: CONCISE
- Target ~120–250 words unless user asks for more.
- Maximum signal density; cut all non-essential context.
- Executive summary = 1–2 lines only.`;
  }
  if (verbosity === 'deep-analysis') {
    return `VERBOSITY: DEEP ANALYSIS
- Target ~500–900 words; still no filler.
- Go deeper on causality, trade-offs, and numbers — not length for its own sake.
- Keep sections structured; expand Analysis only where insight is needed.`;
  }
  return `VERBOSITY: BALANCED (default)
- Hard cap ~550 words unless user explicitly asks for more.
- High signal density; reduce filler and repetition.
- Executive-style: decisions, numbers, and next steps over narrative.`;
}

function structureRules(verbosity: ResponseVerbosity, plainText: boolean): string {
  if (!plainText) {
    return `${modeRules(verbosity)}
${ANTI_BLOAT_RULES}
- JSON fields must be compact strings/arrays — no essays inside values.
- Prefer short headline + bullet arrays over long prose in JSON.`;
  }

  const analysisHint =
    verbosity === 'concise'
      ? '2–4 tight bullets or 1 short paragraph'
      : verbosity === 'deep-analysis'
        ? 'structured bullets or short paragraphs; depth on causality and EGP/% impact'
        : '3–6 bullets or 2 short paragraphs max';

  return `${modeRules(verbosity)}

REQUIRED STRUCTURE (plain text):
## Executive summary
(2–4 lines: decision-ready takeaway)

## Analysis
(${analysisHint})

## Action items
(3–7 bullets: **Owner** — action — why in one line)

${ANTI_BLOAT_RULES}
${FORMAT_STANDARDS}`;
}

const AGENT_TUNING: Record<string, string> = {
  ceo: `AGENT: CEO / Strategy
- Strategic operator for Egyptian ecommerce founders — not a consultant essayist.
- Lead with the decision and trade-off; quantify in EGP/% when possible.
- Explain WHY briefly inline with each recommendation (one clause, not a lecture).`,

  hr: `AGENT: HR / Team ops
- Operational people management (schedules, KPIs, accountability, hiring pace) — NOT corporate HR policy essays.
- Focus on what to do this week with the team.`,

  product: `AGENT: Product Hunter
- Fast, punchy, trend-led — winning products, margin, demand signals in Egypt.
- Lead with opportunity score and risk in bullets; skip market research preambles.`,

  hunter: `AGENT: Product Hunter
- Fast, punchy, trend-led — winning products, margin, demand signals in Egypt.
- Lead with opportunity score and risk in bullets.`,

  support: `AGENT: Support
- Short, warm Egyptian Arabic customer reply — ready to send.
- If bilingual: Arabic first (2–4 sentences), optional one-line English summary.
- No internal analysis visible to customer.`,

  moderator: `AGENT: Support (WhatsApp)
- Same as support: short, sendable, Egyptian dialect.`,

  confirmation: `AGENT: Order confirmation
- WhatsApp-ready confirmation: brief, clear COD/delivery info — under 3 sentences Arabic.`,

  ads: `AGENT: Ads
- Hooks and angles only — max 3 tight variations, no strategy essay.`,

  shipping: `AGENT: Logistics
- SLA risks, delays, carrier actions — bullet ops format.`,

  finance: `AGENT: Finance
- Cash, margin, ROAS, CAC — numbers first, then actions.`,

  meta: `AGENT: Growth / Meta analytics
- Performance diagnosis in ops bullets; no platform tutorial text.`,

  default: `AGENT: Operations
- Founder-style operational intelligence — actionable and scannable.`,
};

export function getAgentTuning(agentKey: string): string {
  return AGENT_TUNING[agentKey] || AGENT_TUNING.default;
}

export type ComposePromptInput = {
  agentKey: string;
  baseSystem: string;
  verbosity: ResponseVerbosity;
  plainText: boolean;
  useJsonMode: boolean;
};

/**
 * Wraps any agent system prompt with global optimization + agent tuning.
 */
export function composeOptimizedSystemPrompt(input: ComposePromptInput): string {
  const { agentKey, baseSystem, verbosity, plainText, useJsonMode } = input;
  const parts = [
    getAgentTuning(agentKey),
    structureRules(verbosity, plainText),
    '---',
    'Domain instructions:',
    baseSystem.trim(),
  ];

  if (plainText) {
    parts.push(
      '\nOutput: natural language only (not JSON). Follow the three-section structure exactly.'
    );
  } else if (useJsonMode) {
    parts.push('\nOutput: valid JSON only. Keep every string field concise.');
  }

  return parts.join('\n\n');
}
