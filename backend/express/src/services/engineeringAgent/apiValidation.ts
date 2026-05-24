import axios from 'axios';
import type { VerificationTarget } from './verificationCriteria';

export type ApiCheckResult = {
  name: string;
  ok: boolean;
  message: string;
  evidence: Record<string, unknown>;
};

export async function validateApiTargets(input: {
  apiBase: string;
  targets: VerificationTarget[];
  authHeaders?: Record<string, string>;
}): Promise<ApiCheckResult[]> {
  const results: ApiCheckResult[] = [];
  const apiTargets = input.targets.filter((t) => t.type === 'api' || t.type === 'health');

  for (const t of apiTargets) {
    const path = t.value.startsWith('/') ? t.value : `/${t.value}`;
    const url = `${input.apiBase.replace(/\/$/, '')}${path}`;
    const expect = t.expectStatus ?? 200;
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        validateStatus: () => true,
        headers: input.authHeaders,
      });
      let schemaOk = true;
      let schemaNote = '';
      if (t.type === 'health' && path.includes('ready')) {
        schemaOk = typeof res.data === 'object' && res.data !== null;
        schemaNote = schemaOk ? 'JSON body present' : 'Invalid health JSON';
      }
      if (path.includes('engineering-agent/tasks') && res.status === 200) {
        const body = res.data as { success?: boolean; data?: unknown };
        schemaOk = body?.success === true && Array.isArray(body.data);
        schemaNote = schemaOk ? 'tasks list schema ok' : 'Unexpected tasks response shape';
      }
      if (path.includes('engineering-agent/metrics') && res.status === 200) {
        const body = res.data as { success?: boolean; data?: Record<string, unknown> };
        schemaOk = body?.success === true && typeof body.data === 'object';
        schemaNote = schemaOk ? 'engineering metrics schema ok' : 'Unexpected metrics response shape';
      }
      if (path.includes('/api/admin/engineering-agent') && !input.authHeaders && res.status === 401) {
        schemaOk = true;
        schemaNote = 'admin route reachable (401 without token — set ENGINEERING_VERIFY_API_TOKEN for full check)';
      }
      const ok =
        (res.status === expect && schemaOk) ||
        (!input.authHeaders && path.includes('/api/admin/') && res.status === 401 && schemaOk);
      results.push({
        name: `api:${path}`,
        ok,
        message: ok ? `HTTP ${res.status} — ${schemaNote || 'ok'}` : `HTTP ${res.status} (expected ${expect}) ${schemaNote}`,
        evidence: {
          url,
          status: res.status,
          expect,
          bodyPreview: JSON.stringify(res.data).slice(0, 500),
        },
      });
    } catch (err: unknown) {
      results.push({
        name: `api:${path}`,
        ok: false,
        message: err instanceof Error ? err.message : 'API request failed',
        evidence: { url, expect },
      });
    }
  }

  return results;
}
