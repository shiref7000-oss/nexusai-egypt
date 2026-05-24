import { Job, Worker } from 'bullmq';
import { redis } from '../queue';
import { logger } from '../../config/logger';
import { crawlStoreSource } from './crawler';
import { matchCampaignsToProducts } from './productMatcher';
import { ingestProductsFromOrderLineItems, upsertStoreSource } from './productRepository';
import { refreshBusinessMemory } from './businessMemory';
import { pool } from '../../config/db_pg';

export type ContextJobType =
  | 'crawl_store'
  | 'match_campaigns'
  | 'ingest_orders'
  | 'refresh_memory'
  | 'full_pipeline';

export async function processContextJob(data: {
  type: ContextJobType;
  userId: number;
  sourceId?: number;
  storeUrl?: string;
  platform?: 'meta' | 'tiktok';
}): Promise<Record<string, unknown>> {
  const { type, userId } = data;

  switch (type) {
    case 'crawl_store': {
      if (!data.sourceId || !data.storeUrl) throw new Error('crawl_store requires sourceId and storeUrl');
      return crawlStoreSource(userId, data.sourceId, data.storeUrl);
    }
    case 'ingest_orders': {
      const count = await ingestProductsFromOrderLineItems(userId);
      return { productsIngested: count };
    }
    case 'match_campaigns': {
      const platform = data.platform || 'meta';
      const meta = await matchCampaignsToProducts(userId, 'meta');
      const tiktok =
        platform === 'tiktok' ? await matchCampaignsToProducts(userId, 'tiktok') : { matched: 0, campaigns: 0 };
      return { meta, tiktok };
    }
    case 'refresh_memory': {
      const profile = await refreshBusinessMemory(userId);
      return { updated: true, profile };
    }
    case 'full_pipeline': {
      if (data.storeUrl) {
        const { id } = await upsertStoreSource(userId, data.storeUrl);
        await crawlStoreSource(userId, id, data.storeUrl);
      }
      await ingestProductsFromOrderLineItems(userId);
      const meta = await matchCampaignsToProducts(userId, 'meta');
      const tiktok = await matchCampaignsToProducts(userId, 'tiktok');
      const profile = await refreshBusinessMemory(userId);
      return { meta, tiktok, profile };
    }
    default:
      throw new Error(`Unknown context job type: ${type}`);
  }
}

/** Register worker — imported from queue.ts */
export function startContextIntelligenceWorker(): Worker {
  const worker = new Worker(
    'context-intelligence',
    async (job: Job) => {
      logger.info('BCI job start', { jobId: job.id, type: job.data?.type, userId: job.data?.userId });
      const result = await processContextJob(job.data);
      logger.info('BCI job done', { jobId: job.id, result });
      return result;
    },
    {
      connection: redis,
      concurrency: 2,
      limiter: { max: 10, duration: 60000 },
    }
  );

  worker.on('failed', (job, err) => {
    logger.error('BCI job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

/** Enqueue creative analysis for Phase 2 — stub marks pending only */
export async function queueCreativeAnalysis(
  userId: number,
  platform: string,
  creativeKey: string,
  adExternalId?: string,
  creativeHash?: string
) {
  await pool.query(
    `INSERT INTO creative_analysis_jobs (user_id, platform, creative_key, ad_external_id, creative_hash, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (user_id, platform, creative_key) DO NOTHING`,
    [userId, platform, creativeKey, adExternalId || null, creativeHash || null]
  );
}
