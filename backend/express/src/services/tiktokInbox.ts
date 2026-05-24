import { logger } from '../config/logger';
import { env } from '../config/env';
import * as db from './tiktokInboxDb';

let browser: any = null;
let context: any = null;
let polling = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

const TIKTOK_BASE = 'https://www.tiktok.com';
const POLL_INTERVAL_MS = parseInt(process.env.TIKTOK_POLL_INTERVAL_MS || '15000', 10);
const SESSION_PATH = process.env.TIKTOK_SESSION_PATH || '/var/www/nexusai-api/tiktok-session.json';

interface TikTokRawMessage {
  userId: string;
  username: string;
  avatarUrl: string;
  text: string;
  messageId: string;
  timestamp: number;
}

// ── Browser setup ──

async function ensureBrowser() {
  if (browser && context) return;
  try {
    const pw = await import('playwright');
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    // Try to restore existing session
    let storageState: any = undefined;
    try {
      const fs = await import('fs');
      if (fs.existsSync(SESSION_PATH)) {
        storageState = SESSION_PATH;
        logger.info('TikTok worker: loaded stored session');
      }
    } catch {
      // no stored session, fresh start
    }

    context = await browser.newContext({
      storageState,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });

    logger.info('TikTok worker: browser + context ready');
  } catch (err: any) {
    logger.error('TikTok worker: browser launch failed', { error: err.message });
    throw err;
  }
}

// ── Session persistence ──

async function saveSession() {
  if (!context) return;
  try {
    const state = await context.storageState();
    const fs = await import('fs');
    fs.writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2));
    logger.info('TikTok worker: session saved');
  } catch (err: any) {
    logger.warn('TikTok worker: session save failed', { error: err.message });
  }
}

// ── DM scraper ──

async function scrapeInbox(): Promise<TikTokRawMessage[]> {
  if (!context) throw new Error('Browser context not available');

  const page = await context.newPage();
  const messages: TikTokRawMessage[] = [];

  try {
    // Navigate to TikTok DM inbox
    await page.goto(`${TIKTOK_BASE}/messages`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    // Check if login is required
    const url = page.url();
    if (url.includes('/login') || url.includes('/signup')) {
      logger.warn('TikTok worker: login required — session expired');
      await db.updateWorkerPollState('Login required — session expired');
      return [];
    }

    // Click into the first unread conversation if available
    const conversationItems = await page.$$('[data-e2e="message-item"], [class*="message-card"], [class*="conversation-item"]');
    for (const item of conversationItems.slice(0, 10)) {
      try {
        await item.click();
        await page.waitForTimeout(1500);

        // Extract message texts
        const msgElements = await page.$$('[data-e2e="message-content"], [class*="message-content"], [class*="chat-message"]');
        for (const el of msgElements) {
          const text = await el.textContent();
          if (!text || !text.trim()) continue;

          messages.push({
            userId: 'tiktok_placeholder',
            username: 'unknown',
            avatarUrl: '',
            text: text.trim(),
            messageId: `tiktok_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            timestamp: Date.now(),
          });
        }
      } catch {
        // skip failed conversation
      }
    }

    logger.info(`TikTok worker: scraped ${messages.length} raw messages`);
  } catch (err: any) {
    logger.error('TikTok worker: scrape failed', { error: err.message });
  } finally {
    await page.close();
  }

  return messages;
}

// ── Poll cycle ──

async function poll(): Promise<void> {
  if (polling) return;
  polling = true;

  try {
    await ensureBrowser();
    const rawMessages = await scrapeInbox();

    for (const msg of rawMessages) {
      const conv = await db.getOrCreateConversation(msg.userId, msg.username, msg.avatarUrl);
      await db.insertMessage(conv.id, 'incoming', msg.text, msg.messageId);
      await db.updateConversationLastMessage(conv.id, msg.text, true);
    }

    await db.updateWorkerPollState();
    await saveSession();
  } catch (err: any) {
    logger.error('TikTok worker: poll cycle failed', { error: err.message });
    await db.updateWorkerPollState(err.message);
  } finally {
    polling = false;
  }
}

// ── Public API ──

export async function startTikTokWorker(): Promise<void> {
  logger.info('TikTok worker: starting');

  // Initial poll
  await poll();

  // Schedule recurring polls
  pollInterval = setInterval(poll, POLL_INTERVAL_MS);
  logger.info(`TikTok worker: polling every ${POLL_INTERVAL_MS}ms`);
}

export async function stopTikTokWorker(): Promise<void> {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  try {
    if (context) await context.close();
    if (browser) await browser.close();
  } catch (err: any) {
    logger.warn('TikTok worker: shutdown error', { error: err.message });
  }
  context = null;
  browser = null;
  logger.info('TikTok worker: stopped');
}

export async function forcePoll(): Promise<void> {
  await poll();
}

export function isRunning(): boolean {
  return polling;
}

logger.info('TikTok inbox service initialized');
