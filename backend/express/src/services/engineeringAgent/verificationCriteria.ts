export type VerificationTarget = {
  type: 'dom_text' | 'dom_selector' | 'bundle_string' | 'api' | 'route' | 'health';
  value: string;
  urlPath?: string;
  selector?: string;
  expectStatus?: number;
  method?: string;
};

export function extractVerificationTargets(input: {
  prompt: string;
  planSummary?: string;
  filesTouched?: string[];
}): VerificationTarget[] {
  const targets: VerificationTarget[] = [];
  const seen = new Set<string>();

  const add = (t: VerificationTarget) => {
    const key = `${t.type}:${t.value}:${t.urlPath || ''}:${t.selector || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(t);
  };

  const quoted = input.prompt.match(/["']([^"']{3,80})["']/g) || [];
  for (const q of quoted) {
    const text = q.replace(/^["']|["']$/g, '').trim();
    if (text.length >= 3) add({ type: 'dom_text', value: text, urlPath: '/admin' });
  }

  const addCard = input.prompt.match(/add\s+(?:an?\s+)?(.+?)\s+(?:card|component|page|tab|button)/i);
  if (addCard?.[1]) {
    const label = addCard[1].trim();
    if (label.length >= 3) add({ type: 'dom_text', value: label, urlPath: '/admin' });
  }

  const smoke = input.prompt.match(/smoke\s+test/i);
  if (smoke) add({ type: 'dom_text', value: 'Agent Smoke Test', urlPath: '/admin' });

  for (const fp of input.filesTouched || []) {
    const base = fp.split('/').pop()?.replace(/\.(tsx|ts|jsx|js)$/, '') || '';
    if (!base || base.length < 3) continue;
    const pascal = base.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
    add({ type: 'bundle_string', value: pascal });
    if (base.includes('Card') || base.includes('card')) {
      add({ type: 'dom_text', value: pascal.replace(/Card$/, ' Card').replace(/([A-Z])/g, ' $1').trim() });
    }
  }

  if (input.planSummary) {
    const planQuoted = input.planSummary.match(/["']([^"']{3,60})["']/g) || [];
    for (const q of planQuoted) {
      const text = q.replace(/^["']|["']$/g, '').trim();
      add({ type: 'dom_text', value: text, urlPath: '/admin' });
    }
  }

  add({ type: 'health', value: '/health/ready', expectStatus: 200 });
  add({ type: 'api', value: '/api/admin/engineering-agent/tasks', expectStatus: 200 });
  add({ type: 'api', value: '/api/admin/engineering-agent/metrics', expectStatus: 200 });

  for (const t of parseVerificationPromptTargets(input.prompt)) {
    add(t);
  }

  return targets.slice(0, 32);
}

/** Targets inferred from verification-only prompts (tabs, admin pages, production). */
export function parseVerificationPromptTargets(prompt: string): VerificationTarget[] {
  const targets: VerificationTarget[] = [];
  const p = prompt.toLowerCase();

  const adminBase = '/admin/engineering-agent';
  const taskDetailPath = '/admin/engineering-agent';

  if (/engineering\s+agent|live\s+tasks|system\s+status/i.test(prompt)) {
    targets.push({ type: 'bundle_string', value: 'Engineering Agent' });
    targets.push({ type: 'bundle_string', value: 'Live tasks' });
    targets.push({
      type: 'route',
      value: '/api/admin/engineering-agent/metrics',
      expectStatus: 200,
      method: 'GET',
    });
  }

  if (/verification\s+tabs?|confirm\s+tabs?|task\s+details?/i.test(prompt)) {
    const tabs = [
      'Verification',
      'Browser Evidence',
      'Screenshots',
      'DOM Search',
      'Bundle Validation',
      'API Checks',
    ];
    for (const tab of tabs) {
      targets.push({ type: 'dom_text', value: tab, urlPath: taskDetailPath });
      targets.push({ type: 'bundle_string', value: tab });
    }
    targets.push({ type: 'api', value: '/api/admin/engineering-agent/tasks', expectStatus: 200 });
    targets.push({
      type: 'route',
      value: '/api/admin/engineering-agent/deployments',
      expectStatus: 200,
      method: 'GET',
    });
  }

  if (/health|runtime/i.test(prompt)) {
    targets.push({ type: 'health', value: '/health/ready', expectStatus: 200 });
    targets.push({ type: 'api', value: '/health/runtime', expectStatus: 200 });
  }

  if (/production|live|deployed/i.test(prompt)) {
    targets.push({ type: 'bundle_string', value: 'Engineering Agent' });
  }

  return targets;
}

export function parseRegressionTargets(raw: unknown): VerificationTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === 'object')
    .map((t) => {
      const o = t as Record<string, unknown>;
      return {
        type: String(o.type || 'dom_text') as VerificationTarget['type'],
        value: String(o.value || ''),
        urlPath: o.urlPath ? String(o.urlPath) : undefined,
        selector: o.selector ? String(o.selector) : undefined,
        expectStatus: o.expectStatus != null ? Number(o.expectStatus) : undefined,
        method: o.method ? String(o.method) : undefined,
      };
    })
    .filter((t) => t.value.length > 0);
}
