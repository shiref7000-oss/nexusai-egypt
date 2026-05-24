/**
 * Business domain memory — injected into Pro planning / PM tasks.
 */
import { listMemory, upsertMemory } from './db';

const BUSINESS_SEEDS: Array<{ key: string; content: string }> = [
  {
    key: 'ecommerce_cod',
    content:
      'Egypt COD ecommerce: orders start as new → pending_confirmation via WhatsApp template; customer replies تأكيد/confirm to confirm. Phone numbers must be E.164 (20...).',
  },
  {
    key: 'whatsapp_automation',
    content:
      'WhatsApp Cloud API: outbound only via BullMQ queue; templates in whatsapp_templates; webhooks update message status. Meta error 133010 = phone not registered.',
  },
  {
    key: 'delivery_metrics',
    content: 'Track delivery rate, confirmation rate, return rate, and time-to-ship for COD merchants.',
  },
  {
    key: 'roas_cac',
    content:
      'ROAS = revenue/ad spend; CAC = ad spend/new customers; profit = revenue - COGS - ad - shipping - returns.',
  },
  {
    key: 'cost_analyzer',
    content:
      'Cost Analyzer module: extracts ad spend from Meta/TikTok, compares to revenue, surfaces waste and scaling opportunities.',
  },
  {
    key: 'wesell_integration',
    content:
      'WeSell / integration_orders: incoming webhooks create orders; engineering agent must not break order status enum or webhook handlers.',
  },
  {
    key: 'engineering_agent',
    content:
      'Engineering Agent: mandatory pipeline (understand → map → impact → plan → implement). Risk v2 uses approval not hard-block for large features.',
  },
];

export async function seedBusinessMemory(): Promise<void> {
  for (const s of BUSINESS_SEEDS) {
    await upsertMemory({
      scope: 'platform',
      category: 'business',
      key: s.key,
      content: s.content,
      metadata: { source: 'business_memory_v1' },
    });
  }
}

export async function getBusinessMemoryBlock(maxChars = 3500): Promise<string> {
  const rows = await listMemory('platform');
  const business = rows.filter((r) => r.category === 'business');
  if (!business.length) {
    await seedBusinessMemory();
    return getBusinessMemoryBlock(maxChars);
  }
  const lines = business.map((r) => `- **${r.key}**: ${String(r.content).slice(0, 400)}`);
  let block = `## Business context (NexusAI Egypt)\n${lines.join('\n')}`;
  if (block.length > maxChars) {
    block = block.slice(0, maxChars) + '\n…(truncated)';
  }
  return block;
}
