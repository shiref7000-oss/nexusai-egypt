import axios from 'axios';
import * as cheerio from 'cheerio';
import type { VerificationTarget } from './verificationCriteria';

export type DomCheckResult = {
  name: string;
  ok: boolean;
  message: string;
  evidence: Record<string, unknown>;
};

function resolveUrl(baseUrl: string, path?: string): string {
  const p = path || '/';
  if (p.startsWith('http')) return p;
  return `${baseUrl.replace(/\/$/, '')}${p.startsWith('/') ? p : `/${p}`}`;
}

function isLikelyHidden($el: { attr: (n: string) => string | undefined; length: number }): boolean {
  const style = ($el.attr('style') || '').toLowerCase();
  if (style.includes('display:none') || style.includes('visibility:hidden')) return true;
  const hidden = $el.attr('hidden') ?? $el.attr('aria-hidden');
  if (hidden === 'true' || hidden === '') return true;
  return false;
}

export async function validateDomTargets(
  baseUrl: string,
  targets: VerificationTarget[],
  opts?: { label?: string }
): Promise<DomCheckResult[]> {
  const domTargets = targets.filter((t) => t.type === 'dom_text' || t.type === 'dom_selector');
  const results: DomCheckResult[] = [];

  const paths = [...new Set(domTargets.map((t) => t.urlPath || '/admin'))];
  const htmlByPath = new Map<string, { html: string; status: number }>();

  for (const path of paths) {
    const url = resolveUrl(baseUrl, path);
    try {
      const res = await axios.get(url, {
        timeout: 20000,
        validateStatus: () => true,
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      htmlByPath.set(path, { html: String(res.data || ''), status: res.status });
      if (res.status >= 400) {
        results.push({
          name: `route:${path}`,
          ok: false,
          message: `Page returned HTTP ${res.status}`,
          evidence: { url, status: res.status, label: opts?.label },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fetch failed';
      results.push({
        name: `route:${path}`,
        ok: false,
        message: msg,
        evidence: { url, label: opts?.label },
      });
      htmlByPath.set(path, { html: '', status: 0 });
    }
  }

  for (const t of domTargets) {
    const path = t.urlPath || '/admin';
    const cached = htmlByPath.get(path);
    const url = resolveUrl(baseUrl, path);
    if (!cached?.html) {
      results.push({
        name: `dom:${t.value}`,
        ok: false,
        message: 'Empty or unavailable HTML',
        evidence: { url, target: t.value },
      });
      continue;
    }

    const $ = cheerio.load(cached.html);
    const bodyText = $('body').text().replace(/\s+/g, ' ');

    if (t.type === 'dom_selector' && t.selector) {
      const el = $(t.selector).first();
      const ok = el.length > 0 && !isLikelyHidden(el);
      results.push({
        name: `selector:${t.selector}`,
        ok,
        message: ok ? 'Element found and visible' : 'Selector missing or hidden',
        evidence: { url, selector: t.selector, count: el.length },
      });
      continue;
    }

    const found = bodyText.toLowerCase().includes(t.value.toLowerCase());
    let visible = found;
    if (found) {
      $('*').each((_, node) => {
        const el = $(node);
        const txt = el.clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
        if (txt && txt.toLowerCase().includes(t.value.toLowerCase())) {
          if (isLikelyHidden(el)) visible = false;
        }
      });
    }

    const emptyPage = bodyText.trim().length < 20;
    results.push({
      name: `text:${t.value}`,
      ok: found && visible && !emptyPage,
      message: emptyPage
        ? 'Page appears empty (hydration or load failure suspected)'
        : !found
          ? `Text not found in DOM: "${t.value}"`
          : !visible
            ? `Text found but element may be hidden: "${t.value}"`
            : `Text visible: "${t.value}"`,
      evidence: {
        url,
        found,
        visible,
        emptyPage,
        snippet: bodyText.slice(0, 400),
        label: opts?.label,
      },
    });
  }

  return results;
}

export async function validateRouteAccessibility(
  apiBase: string,
  targets: VerificationTarget[],
  headers?: Record<string, string>
): Promise<DomCheckResult[]> {
  const routes = targets.filter((t) => t.type === 'route');
  const out: DomCheckResult[] = [];
  for (const t of routes) {
    const url = resolveUrl(apiBase, t.value);
    const expect = t.expectStatus ?? 200;
    try {
      const res = await axios.request({
        url,
        method: (t.method || 'GET').toUpperCase(),
        timeout: 15000,
        validateStatus: () => true,
        headers,
      });
      const isAdminRoute = t.value.includes('/api/admin/');
      let ok = res.status === expect;
      if (!ok && isAdminRoute && !headers) {
        ok = res.status === 401;
        if (ok) {
          out.push({
            name: `route:${t.value}`,
            ok: true,
            message: `HTTP 401 — route exists (auth required; set ENGINEERING_VERIFY_API_TOKEN for 200)`,
            evidence: { url, status: res.status, expect, hasAuth: false },
          });
          continue;
        }
      }
      out.push({
        name: `route:${t.value}`,
        ok,
        message: ok ? `HTTP ${res.status}` : `Expected ${expect}, got ${res.status}`,
        evidence: { url, status: res.status, expect, hasAuth: !!headers },
      });
    } catch (err: unknown) {
      out.push({
        name: `route:${t.value}`,
        ok: false,
        message: err instanceof Error ? err.message : 'Request failed',
        evidence: { url, expect },
      });
    }
  }
  return out;
}
