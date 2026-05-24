import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { addContextIntelligenceJob } from '../services/queue';
import {
  getStoreSources,
  listProducts,
  upsertStoreSource,
} from '../services/businessContext/productRepository';
import { getBusinessMemory, refreshBusinessMemory } from '../services/businessContext/businessMemory';
import { searchContext } from '../services/businessContext/vectorSearch';
import { getCampaignProductContext } from '../services/businessContext/productMatcher';
import { pool } from '../config/db_pg';
import { logger } from '../config/logger';
import { withTimeout } from '../utils/queryTimeout';

const router = Router();
router.use(authenticate);

function requirePgUserId(req: AuthenticatedRequest): number | null {
  if (req.user?.pgUserId) return req.user.pgUserId;
  const raw = req.user?.id;
  if (raw && /^\d+$/.test(String(raw))) return parseInt(String(raw), 10);
  return null;
}

router.get('/status', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });

    const [sources, productCount, matchCount, memory] = await Promise.all([
      getStoreSources(userId),
      pool.query(`SELECT COUNT(*)::int AS c FROM business_products WHERE user_id = $1`, [userId]),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM campaign_product_matches WHERE user_id = $1`,
        [userId]
      ),
      getBusinessMemory(userId),
    ]);

    res.json({
      success: true,
      data: {
        storeSources: sources,
        productCount: productCount.rows[0]?.c || 0,
        campaignMatches: matchCount.rows[0]?.c || 0,
        memory: memory || null,
        architecture: {
          phase: 1,
          llm: 'selective',
          processing: 'async_queue',
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load BCI status' });
  }
});

router.post('/store', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });

    const storeUrl = String(req.body?.storeUrl || req.body?.store_url || '').trim();
    if (!storeUrl) return res.status(400).json({ success: false, error: 'storeUrl required' });

    const { id } = await upsertStoreSource(userId, storeUrl, req.body?.storeType || 'generic');
    const job = await addContextIntelligenceJob({
      type: 'crawl_store',
      userId,
      sourceId: id,
      storeUrl,
    });

    res.json({
      success: true,
      data: { sourceId: id, storeUrl, jobId: job.id, message: 'Crawl queued (async)' },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to register store' });
  }
});

router.post('/pipeline', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });

    const storeUrl = req.body?.storeUrl ? String(req.body.storeUrl) : undefined;
    const job = await addContextIntelligenceJob({
      type: 'full_pipeline',
      userId,
      storeUrl,
      platform: req.body?.platform,
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        message: 'Full BCI pipeline queued: crawl → products → campaign match → memory',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to queue pipeline' });
  }
});

router.post('/match-campaigns', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });

    const job = await addContextIntelligenceJob({
      type: 'match_campaigns',
      userId,
      platform: req.body?.platform,
    });

    res.json({ success: true, data: { jobId: job.id } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to queue matching' });
  }
});

router.get('/products', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });
    const products = await listProducts(userId, Math.min(200, parseInt(String(req.query.limit || 50), 10) || 50));
    res.json({ success: true, data: { products } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list products' });
  }
});

router.get('/campaigns/:platform/:campaignId/product', async (req: AuthenticatedRequest, res) => {
  const started = Date.now();
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });
    const ctx = await withTimeout(
      getCampaignProductContext(userId, String(req.params.platform), String(req.params.campaignId)),
      5000,
      'getCampaignProductContext'
    );
    logger.info('BCI campaign product context', {
      userId,
      ms: Date.now() - started,
      platform: req.params.platform,
    });
    res.json({ success: true, data: { match: ctx } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn('BCI campaign product context failed', { error: msg, ms: Date.now() - started });
    res.json({ success: true, data: { match: null, degraded: true } });
  }
});

router.get('/search', async (req: AuthenticatedRequest, res) => {
  const started = Date.now();
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ success: false, error: 'q required' });

    const hits = await withTimeout(
      searchContext(userId, q, {
        limit: Math.min(20, parseInt(String(req.query.limit || 8), 10) || 8),
        sourceTypes: req.query.types ? String(req.query.types).split(',') : undefined,
      }),
      8000,
      'searchContext'
    );
    logger.info('BCI search', { userId, ms: Date.now() - started, hits: hits.length });
    res.json({ success: true, data: { hits } });
  } catch (e) {
    logger.error('BCI search error', { error: e instanceof Error ? e.message : e, ms: Date.now() - started });
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

router.get('/memory', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });
    const memory = await getBusinessMemory(userId);
    res.json({ success: true, data: { memory } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load memory' });
  }
});

router.post('/memory/refresh', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });

    const asyncJob = req.query.async === '1' || req.body?.async === true;
    if (asyncJob) {
      const job = await addContextIntelligenceJob({ type: 'refresh_memory', userId });
      return res.json({ success: true, data: { jobId: job.id } });
    }

    const memory = await refreshBusinessMemory(userId);
    res.json({ success: true, data: { memory } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to refresh memory' });
  }
});

router.get('/matches', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = requirePgUserId(req);
    if (!userId) return res.status(400).json({ success: false, error: 'User not linked' });

    const r = await pool.query(
      `SELECT m.platform, m.campaign_id, m.campaign_name, m.confidence, m.match_method, m.evidence,
        p.title AS product_title, p.id AS product_id
       FROM campaign_product_matches m
       JOIN business_products p ON p.id = m.product_id
       WHERE m.user_id = $1 AND m.is_primary = true
       ORDER BY m.confidence DESC
       LIMIT 100`,
      [userId]
    );
    res.json({ success: true, data: { matches: r.rows } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to list matches' });
  }
});

export default router;
