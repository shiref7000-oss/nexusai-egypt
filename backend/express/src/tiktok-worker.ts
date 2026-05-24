import express from 'express';
import { logger } from './config/logger';
import { startTikTokWorker, stopTikTokWorker, forcePoll, updateSession } from './services/tiktokInbox';
import { getConversations, getMessages, getUnreadCount, getWorkerState } from './services/tiktokInboxDb';
import { loadSessionForWorker } from './services/tiktokSessionManager';

async function main() {
  // Try to load managed session from DB
  const adminAccountId = parseInt(process.env.TIKTOK_ADMIN_ACCOUNT_ID || '2', 10);
  try {
    const session = await loadSessionForWorker(adminAccountId);
    if (session) {
      await updateSession(session.storageState);
      logger.info(`TikTok worker: loaded managed session for account ${adminAccountId}`);
    } else {
      logger.info('TikTok worker: no managed session found, checking file fallback');
    }
  } catch (err: any) {
    logger.warn('TikTok worker: session load from DB failed, using file fallback', { error: err.message });
  }

  await startTikTokWorker();

  const app = express();

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      role: 'tiktok-worker',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Force poll trigger (for debugging/manual trigger)
  app.post('/health/poll', async (_req, res) => {
    try {
      await forcePoll();
      res.json({ success: true, message: 'Poll triggered' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reload session from DB (called after user connects in dashboard)
  app.post('/health/reload-session', async (_req, res) => {
    try {
      const session = await loadSessionForWorker(adminAccountId);
      if (session) {
        await updateSession(session.storageState);
        res.json({ success: true, message: 'Session reloaded from DB', username: session.username });
      } else {
        res.json({ success: false, message: 'No active session in DB' });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Inbox stats for monitoring
  app.get('/health/stats', async (_req, res) => {
    try {
      const [unread, state, conversations] = await Promise.all([
        getUnreadCount(),
        getWorkerState(),
        getConversations(),
      ]);
      res.json({
        success: true,
        data: {
          unreadCount: unread,
          conversationCount: conversations.length,
          lastPollAt: state.lastPollAt,
          sessionValid: state.sessionValid,
          errorMessage: state.errorMessage,
        },
      });
    } catch (err: any) {
      res.status(503).json({ success: false, error: err.message });
    }
  });

  const port = parseInt(process.env.TIKTOK_WORKER_PORT || '3003', 10);
  const server = app.listen(port, () => {
    logger.info(`TikTok worker health listening on ${port}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`TikTok worker received ${signal}`);
    server.close(async () => {
      await stopTikTokWorker();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('TikTok worker bootstrap failed', { error: err instanceof Error ? err.message : err });
  process.exit(1);
});
