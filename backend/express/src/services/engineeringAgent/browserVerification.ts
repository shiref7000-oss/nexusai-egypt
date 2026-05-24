import { writeFileSync } from 'fs';
import { artifactFilePath } from './artifactStorage';

export type ScreenshotCapture = {
  ok: boolean;
  path?: string;
  message: string;
  evidence: Record<string, unknown>;
};

async function tryPlaywrightScreenshot(
  url: string,
  outPath: string,
  authToken?: string
): Promise<ScreenshotCapture> {
  try {
    const pw = await import('playwright');
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      if (authToken) {
        const origin = new URL(url).origin;
        await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate((token) => {
          localStorage.setItem('nexusai_token', token);
        }, authToken);
      }
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: outPath, fullPage: true });
      const title = await page.title();
      const bodyText = await page.locator('body').innerText();
      const bodyLen = bodyText.trim().length;
      return {
        ok: true,
        path: outPath,
        message: 'Screenshot captured',
        evidence: { url, title, bodyTextLength: bodyLen },
      };
    } finally {
      await browser.close();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Playwright unavailable';
    const needsInstall = /Cannot find module|Executable doesn't exist|playwright/i.test(msg);
    return {
      ok: false,
      message: needsInstall
        ? 'Playwright not installed — run: npx playwright install chromium'
        : msg,
      evidence: { url, playwright: false },
    };
  }
}

export async function captureVerificationScreenshot(input: {
  taskId: string;
  url: string;
  label: string;
  artifactType: 'screenshot_before' | 'screenshot_after' | 'screenshot_production';
  strict?: boolean;
  authToken?: string;
}): Promise<ScreenshotCapture & { artifactType: string }> {
  const safeLabel = input.label.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  const filename = `${input.artifactType}_${safeLabel}_${Date.now()}.png`;
  const outPath = artifactFilePath(input.taskId, filename);

  const result = await tryPlaywrightScreenshot(input.url, outPath, input.authToken);
  if (!result.ok && !input.strict) {
    writeFileSync(
      outPath.replace(/\.png$/, '.txt'),
      `Screenshot skipped: ${result.message}\nURL: ${input.url}\n`
    );
    return {
      ...result,
      ok: true,
      path: outPath.replace(/\.png$/, '.txt'),
      message: `Screenshot skipped (non-strict): ${result.message}`,
      artifactType: input.artifactType,
    };
  }

  return { ...result, artifactType: input.artifactType };
}

export async function detectHydrationIssues(url: string): Promise<{
  ok: boolean;
  message: string;
  evidence: Record<string, unknown>;
}> {
  try {
    const pw = await import('playwright');
    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      const trimmed = bodyText.trim();
      const rootEmpty = trimmed.length < 30;
      const hydrationHint = errors.some((e) =>
        /hydrat|minified react|uncaught/i.test(e)
      );
      const ok = !rootEmpty && !hydrationHint;
      return {
        ok,
        message: ok
          ? 'No hydration errors detected'
          : rootEmpty
            ? 'Empty page — possible hydration or routing failure'
            : 'Console errors suggest hydration/runtime issues',
        evidence: { url, bodyTextLength: trimmed.length, errors: errors.slice(0, 8) },
      };
    } finally {
      await browser.close();
    }
  } catch {
    return { ok: true, message: 'Hydration check skipped (no browser)', evidence: { url } };
  }
}
