import { logger } from '../config/logger';
import { env } from '../config/env';
import * as db from './tiktokSessionDb';
import { logAuditEvent } from './tiktokSessionDb';

interface ActiveSession {
  browser: any;
  context: any;
  page: any;
  sessionId: number;
  accountId: number;
  createdAt: number;
}

const activeSessions = new Map<number, ActiveSession>();
let screenshotInterval: ReturnType<typeof setInterval> | null = null;

const TIKTOK_BASE = 'https://www.tiktok.com';
const SCREENSHOT_WIDTH = 1280;
const SCREENSHOT_HEIGHT = 800;
const SCREENSHOT_QUALITY = 60; // JPEG quality for performance
const SESSION_ENCRYPTION_KEY = env.INTEGRATION_ENCRYPTION_KEY || 'nexusai-tiktok-session-key';

// ── Encryption helpers ──

function encrypt(text: string): string {
  // Simple XOR with key for MVP — replace with AES in production
  const key = SESSION_ENCRYPTION_KEY;
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result, 'binary').toString('base64');
}

function decrypt(encoded: string): string {
  const text = Buffer.from(encoded, 'base64').toString('binary');
  const key = SESSION_ENCRYPTION_KEY;
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// ── Browser launch ──

async function launchBrowser() {
  const pw = await import('playwright');
  return pw.chromium.launch({
    headless: true, // true for VPS; screenshot-based interaction
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800',
    ],
  });
}

// ── Session creation (called from API) ──

export async function createSession(accountId: number): Promise<{
  sessionId: number;
  screenshot: string;
  currentUrl: string;
}> {
  // Close existing session for this account
  await disconnectSession(accountId);

  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT },
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Navigate to TikTok login
  await page.goto(`${TIKTOK_BASE}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2000);

  // Save initial session
  const storageState = await context.storageState();
  const encrypted = encrypt(JSON.stringify(storageState));
  const session = await db.createSession(accountId, encrypted, storageState.cookies, {});

  const active: ActiveSession = {
    browser,
    context,
    page,
    sessionId: session.id,
    accountId,
    createdAt: Date.now(),
  };
  activeSessions.set(session.id, active);

  await db.logAuditEvent('connect', accountId, session.id, {
    url: page.url(),
  });

  const screenshot = await captureScreenshot(page);

  startScreenshotPoll();

  logger.info(`TikTok session created for account ${accountId}, session ${session.id}`);

  return {
    sessionId: session.id,
    screenshot,
    currentUrl: page.url(),
  };
}

// ── Screenshot capture ──

async function captureScreenshot(page: any): Promise<string> {
  try {
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: SCREENSHOT_QUALITY,
      clip: { x: 0, y: 0, width: SCREENSHOT_WIDTH, height: SCREENSHOT_HEIGHT },
    });
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

// ── Screenshot polling (for active sessions) ──

let lastScreenshots = new Map<number, string>();

function startScreenshotPoll() {
  if (screenshotInterval) return;
  screenshotInterval = setInterval(async () => {
    for (const [id, session] of activeSessions) {
      try {
        const shot = await captureScreenshot(session.page);
        lastScreenshots.set(id, shot);
      } catch {
        // page may have closed
      }
    }
  }, 1000); // 1 FPS — sufficient for login flow
}

// ── Public API for session interaction ──

export async function getSessionScreenshot(sessionId: number): Promise<string | null> {
  const session = activeSessions.get(sessionId);
  if (!session) {
    // Try to take fresh screenshot if session exists in DB
    return lastScreenshots.get(sessionId) || null;
  }
  return captureScreenshot(session.page);
}

export async function getSessionCachedScreenshot(sessionId: number): Promise<string | null> {
  return lastScreenshots.get(sessionId) || null;
}

export async function sendClick(sessionId: number, x: number, y: number): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  // Click at coordinates
  await session.page.mouse.click(x, y);
  await session.page.waitForTimeout(300);
  // Try to focus whatever is under the cursor
  try {
    await session.page.evaluate(({ cx, cy }) => {
      const el = document.elementFromPoint(cx, cy);
      if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        el.focus();
      }
    }, { cx: x, cy: y });
  } catch { /* best-effort focus */ }
}

export async function sendType(sessionId: number, text: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  // Ensure an input is focused before typing
  const hasFocus = await session.page.evaluate(() => {
    const el = document.activeElement;
    return el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement);
  });
  if (!hasFocus) {
    // Try to focus the first visible input
    await session.page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
      for (const input of inputs) {
        if ((input as HTMLElement).offsetParent !== null) {
          (input as HTMLElement).focus();
          break;
        }
      }
    });
    await session.page.waitForTimeout(200);
  }
  await session.page.keyboard.type(text, { delay: 50 });
}

export async function sendKey(sessionId: number, key: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.keyboard.press(key);
}

// ── Focused field helpers (reliable for TikTok login) ──

export async function focusField(sessionId: number, fieldType: 'email' | 'password' | 'login-button'): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');

  if (fieldType === 'login-button') {
    await session.page.evaluate(() => {
      const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
      for (const btn of buttons) {
        const text = (btn.textContent || '').toLowerCase();
        if (text.includes('log in') || text.includes('login') || text.includes('sign in')) {
          (btn as HTMLElement).click();
          return;
        }
      }
    });
    return;
  }

  await session.page.evaluate((type) => {
    // Try common TikTok login field selectors first
    const selectors = [
      `input[type="${type}"]`,
      `input[name="${type}"]`,
      `input[placeholder*="${type}" i]`,
      `input[aria-label*="${type}" i]`,
      'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"])',
    ];
    for (const sel of selectors) {
      const inputs = document.querySelectorAll(sel);
      for (const input of inputs) {
        const el = input as HTMLElement;
        if (el.offsetParent !== null && !el.hasAttribute('readonly')) {
          el.click();
          el.focus();
          // Clear existing value so user can type fresh
          if (el instanceof HTMLInputElement) el.select();
          return;
        }
      }
    }
    // Fallback: try all visible inputs
    const allInputs = document.querySelectorAll('input:not([type="hidden"])');
    for (const input of allInputs) {
      const el = input as HTMLElement;
      if (el.offsetParent !== null) {
        el.click();
        el.focus();
        if (input instanceof HTMLInputElement) input.select();
        return;
      }
    }
  }, fieldType);
  await session.page.waitForTimeout(300);
}

export async function getSessionUrl(sessionId: number): Promise<string> {
  const session = activeSessions.get(sessionId);
  if (!session) return '';
  return session.page.url();
}

// ── Login detection ──

export async function checkLoginStatus(sessionId: number): Promise<{
  loggedIn: boolean;
  url: string;
  username: string | null;
}> {
  const session = activeSessions.get(sessionId);
  if (!session) return { loggedIn: false, url: '', username: null };

  const url = session.page.url();

  // If we're on inbox/messages page, user is logged in
  if (url.includes('/messages') || url.includes('/inbox') || url.includes('/foryou')) {
    let username: string | null = null;
    try {
      // Try to extract username from page
      username = await session.page.evaluate(() => {
        const el = document.querySelector('[data-e2e="user-name"], [class*="username"], [class*="nickname"]');
        if (el) return el.textContent?.trim() || null;
        // Try title element
        const titleEl = document.querySelector('title');
        if (titleEl) {
          const t = titleEl.textContent || '';
          const match = t.match(/@(\w+)/);
          if (match) return match[1];
        }
        return null;
      });
    } catch {
      // can't extract
    }

    if (username && username !== session.accountId.toString()) {
      await db.updateSessionUsername(sessionId, username);
    }

    return { loggedIn: true, url, username };
  }

  return { loggedIn: false, url, username: null };
}

// ── Save session after successful login ──

export async function saveSessionAfterLogin(sessionId: number): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');

  const storageState = await session.context.storageState();
  const encrypted = encrypt(JSON.stringify(storageState));

  await db.createSession(session.accountId, encrypted, storageState.cookies, {});
  await db.updateSessionStatus(sessionId, 'active');
  await db.logAuditEvent('session_saved', session.accountId, sessionId, {
    cookies: storageState.cookies.length,
    origins: storageState.origins?.length || 0,
  });

  logger.info(`TikTok session saved for session ${sessionId}`);
}

// ── Session health check ──

export async function checkSessionHealth(sessionId: number): Promise<boolean> {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  try {
    await session.page.evaluate(() => document.title);
    await db.updateSessionHealth(sessionId);
    return true;
  } catch {
    await db.expireSession(sessionId, 'Browser page unresponsive');
    await db.logAuditEvent('health_check_failed', session.accountId, sessionId);
    return false;
  }
}

// ── Disconnect ──

export async function disconnectSession(accountId: number): Promise<void> {
  // Find and close all active sessions for this account
  for (const [id, session] of activeSessions) {
    if (session.accountId === accountId) {
      try {
        await session.context?.close();
        await session.browser?.close();
      } catch { /* already closed */ }
      activeSessions.delete(id);
      lastScreenshots.delete(id);
    }
  }

  // Mark DB sessions as disconnected
  const existing = await db.getActiveSession(accountId);
  if (existing) {
    await db.updateSessionStatus(existing.id, 'disconnected');
    await db.logAuditEvent('disconnect', accountId, existing.id);
  }
}

// ── Get session status for UI ──

export async function getSessionStatus(accountId: number): Promise<{
  connected: boolean;
  sessionId: number | null;
  username: string | null;
  lastLoginAt: string | null;
  lastHealthAt: string | null;
  status: string;
  errorMessage: string | null;
  browserActive: boolean;
}> {
  const dbSession = await db.getActiveSession(accountId);
  if (!dbSession) {
    return {
      connected: false,
      sessionId: null,
      username: null,
      lastLoginAt: null,
      lastHealthAt: null,
      status: 'disconnected',
      errorMessage: null,
      browserActive: false,
    };
  }

  const browserActive = activeSessions.has(dbSession.id);

  return {
    connected: dbSession.status === 'active',
    sessionId: dbSession.id,
    username: dbSession.tiktok_username,
    lastLoginAt: dbSession.last_login_at,
    lastHealthAt: dbSession.last_health_at,
    status: dbSession.status,
    errorMessage: dbSession.error_message,
    browserActive,
  };
}

// ── Load session for worker ──

export async function loadSessionForWorker(accountId: number): Promise<{
  storageState: any;
  cookies: any[];
  username: string | null;
} | null> {
  const dbSession = await db.getActiveSession(accountId);
  if (!dbSession) return null;

  try {
    const decrypted = decrypt(dbSession.session_data);
    return {
      storageState: JSON.parse(decrypted),
      cookies: dbSession.cookies || [],
      username: dbSession.tiktok_username,
    };
  } catch {
    logger.error('Failed to decrypt session data');
    return null;
  }
}

// ── Browser controls ──

export async function refreshPage(sessionId: number): Promise<{ url: string }> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  return { url: session.page.url() };
}

export async function navigateTo(sessionId: number, url: string): Promise<{ url: string }> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  return { url: session.page.url() };
}

export async function goBack(sessionId: number): Promise<{ url: string }> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
  return { url: session.page.url() };
}

export async function goForward(sessionId: number): Promise<{ url: string }> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 });
  return { url: session.page.url() };
}

export async function restartSession(sessionId: number, accountId: number): Promise<{ sessionId: number; screenshot: string; currentUrl: string }> {
  // Close existing browser
  const existing = activeSessions.get(sessionId);
  if (existing) {
    try { await existing.context?.close(); } catch { /* */ }
    try { await existing.browser?.close(); } catch { /* */ }
    activeSessions.delete(sessionId);
    lastScreenshots.delete(sessionId);
  }

  // Mark old session disconnected
  try { await db.updateSessionStatus(sessionId, 'disconnected'); } catch { /* */ }

  // Create fresh session
  return createSession(accountId);
}

export async function clearCookies(sessionId: number): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.context.clearCookies();
  // Navigate to login page fresh
  await session.page.goto(`${TIKTOK_BASE}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
}

export async function scrollPage(sessionId: number, deltaY: number): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.evaluate((dy) => window.scrollBy(0, dy), deltaY);
}

export async function pasteText(sessionId: number, text: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.evaluate((t) => {
    const el = document.activeElement;
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      el.focus();
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const before = el.value.slice(0, start);
      const after = el.value.slice(end);
      el.value = before + t + after;
      el.selectionStart = el.selectionEnd = start + t.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, text);
}

// ── Batch fill: inserts text instantly into focused input (bypasses keyboard delay) ──

export async function fillField(sessionId: number, text: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error('Session not active');
  await session.page.evaluate((t) => {
    // Find the currently focused element
    let el = document.activeElement;
    // If no input is focused, try to find the first visible input
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
      for (const input of inputs) {
        if ((input as HTMLElement).offsetParent !== null) {
          el = input as HTMLElement;
          (el as HTMLElement).focus();
          break;
        }
      }
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      // Set value directly — no keyboard simulation delay
      el.value = t;
      // Move cursor to end
      el.selectionStart = el.selectionEnd = t.length;
      // Dispatch events so TikTok's JS framework detects the change
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, text);
}

// ── Shutdown ──

export async function shutdownAllSessions(): Promise<void> {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
  for (const [, session] of activeSessions) {
    try {
      await session.context?.close();
      await session.browser?.close();
    } catch { /* ignore */ }
  }
  activeSessions.clear();
  lastScreenshots.clear();
}

logger.info('TikTok session manager initialized');
