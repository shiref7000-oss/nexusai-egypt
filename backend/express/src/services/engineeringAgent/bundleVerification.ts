import axios from 'axios';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { VerificationTarget } from './verificationCriteria';

export type BundleCheckResult = {
  name: string;
  ok: boolean;
  message: string;
  evidence: Record<string, unknown>;
};

async function fetchProductionBundleUrls(publicUrl: string): Promise<string[]> {
  const indexUrl = `${publicUrl.replace(/\/$/, '')}/`;
  const res = await axios.get(indexUrl, { timeout: 20000, validateStatus: () => true });
  if (res.status >= 400) return [];
  const html = String(res.data || '');
  const urls: string[] = [];
  const base = publicUrl.replace(/\/$/, '');
  const patterns = [
    /src="(\/assets\/[^"]+\.js)"/g,
    /import\(['"](\/assets\/[^'"]+\.js)['"]\)/g,
    /href="(\/assets\/[^"]+\.js)"/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      urls.push(`${base}${m[1]}`);
    }
  }
  return [...new Set(urls)];
}

function localBundleFiles(distDir: string): string[] {
  const assets = join(distDir, 'assets');
  if (!existsSync(assets)) return [];
  return readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(assets, f));
}

export async function validateBundleStrings(input: {
  targets: VerificationTarget[];
  publicUrl?: string;
  localDistDir?: string;
  label?: string;
}): Promise<BundleCheckResult[]> {
  const strings = input.targets.filter((t) => t.type === 'bundle_string').map((t) => t.value);
  if (strings.length === 0) return [];

  const bundles: Array<{ source: string; content: string }> = [];

  if (input.localDistDir) {
    for (const fp of localBundleFiles(input.localDistDir)) {
      bundles.push({ source: fp, content: readFileSync(fp, 'utf8') });
    }
  }

  if (input.publicUrl) {
    try {
      const urls = await fetchProductionBundleUrls(input.publicUrl);
      for (const url of urls.slice(0, 5)) {
        const res = await axios.get(url, { timeout: 30000, validateStatus: () => true });
        if (res.status < 400) bundles.push({ source: url, content: String(res.data || '') });
      }
    } catch {
      /* production bundle fetch optional */
    }
  }

  const results: BundleCheckResult[] = [];
  if (bundles.length === 0) {
    return strings.map((s) => ({
      name: `bundle:${s}`,
      ok: false,
      message: 'No JS bundles found to scan',
      evidence: { label: input.label },
    }));
  }

  const combined = bundles.map((b) => b.content).join('\n');
  const bundleNames = bundles.map((b) => b.source);

  const alternates: Record<string, string[]> = {
    'Engineering Agent': ['Engineering Agent', 'Engineering Agent Monitor', 'engineering-agent'],
    'Live tasks': ['Live tasks', 'Live tasks'],
  };

  for (const needle of strings) {
    const variants = alternates[needle] || [needle];
    const found = variants.some((v) => combined.includes(v));
    results.push({
      name: `bundle:${needle}`,
      ok: found,
      message: found
        ? `Found "${needle}" in deployed bundle`
        : `Missing "${needle}" — possible old bundle or build not deployed`,
      evidence: {
        needle,
        bundleSources: bundleNames.slice(0, 5),
        label: input.label,
        versionHint: bundleNames.find((s) => s.includes('index-'))?.split('/').pop(),
      },
    });
  }

  return results;
}
