import { pool } from '../../config/db_pg';
import { cosineSimilarity, getOrCreateEmbedding } from './embeddings';
import { contentHash } from './hash';

export type CampaignMatch = {
  product_id: number;
  product_title: string;
  confidence: number;
  match_method: string;
  evidence: Record<string, unknown>;
};

const STOP_WORDS = new Set([
  'abo',
  'cbo',
  'test',
  'testing',
  'campaign',
  'adset',
  'meta',
  'tiktok',
  'eg',
  'egypt',
  'new',
  'copy',
  'v1',
  'v2',
  'scale',
  'scaling',
  'retarget',
  'broad',
  'interest',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function keywordOverlapScore(campaignText: string, productText: string): number {
  const ct = new Set(tokenize(campaignText));
  const pt = tokenize(productText);
  if (!ct.size || !pt.length) return 0;
  let hits = 0;
  for (const t of pt) {
    if (ct.has(t)) hits++;
  }
  return hits / Math.max(pt.length, 1);
}

async function saveMatch(
  userId: number,
  platform: string,
  campaignId: string,
  campaignName: string | null,
  match: CampaignMatch,
  isPrimary: boolean
) {
  await pool.query(
    `INSERT INTO campaign_product_matches (
      user_id, platform, campaign_id, campaign_name, product_id,
      confidence, match_method, evidence, is_primary, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (user_id, platform, campaign_id, product_id) DO UPDATE SET
      confidence = EXCLUDED.confidence,
      match_method = EXCLUDED.match_method,
      evidence = EXCLUDED.evidence,
      is_primary = EXCLUDED.is_primary,
      campaign_name = EXCLUDED.campaign_name,
      updated_at = NOW()`,
    [
      userId,
      platform,
      campaignId,
      campaignName,
      match.product_id,
      match.confidence,
      match.match_method,
      JSON.stringify(match.evidence),
      isPrimary,
    ]
  );
}

/**
 * Confidence-based campaign→product mapping without LLM.
 * Uses keyword overlap + embedding similarity + ad creative names.
 */
export async function matchCampaignsToProducts(
  userId: number,
  platform: 'meta' | 'tiktok'
): Promise<{ matched: number; campaigns: number }> {
  const campaignsTable = platform === 'tiktok' ? 'tiktok_campaigns' : 'meta_campaigns';
  const adsTable = platform === 'tiktok' ? 'tiktok_ads' : 'meta_ads';
  const accountsTable = platform === 'tiktok' ? 'tiktok_ad_accounts' : 'meta_ad_accounts';
  const connTable = platform === 'tiktok' ? 'tiktok_connections' : 'meta_connections';

  const campRes = await pool.query(
    `SELECT c.campaign_id, c.name AS campaign_name,
      string_agg(DISTINCT COALESCE(ad.name, '') || ' ' || COALESCE(ad.creative_name, ''), ' ') AS ad_text
     FROM ${campaignsTable} c
     JOIN ${accountsTable} a ON a.id = c.ad_account_id
     JOIN ${connTable} conn ON conn.id = a.connection_id AND conn.user_id = $1
     LEFT JOIN ${adsTable} ad ON ad.campaign_id = c.campaign_id AND ad.ad_account_id = c.ad_account_id
     WHERE a.is_selected = true
     GROUP BY c.campaign_id, c.name`,
    [userId]
  );

  const productsRes = await pool.query(
    `SELECT id, title, description, category, search_text, embedding_json
     FROM business_products WHERE user_id = $1`,
    [userId]
  );

  if (!productsRes.rows.length) {
    return { matched: 0, campaigns: campRes.rows.length };
  }

  const products = productsRes.rows.map((r) => ({
    id: r.id as number,
    title: String(r.title),
    text: String(r.search_text || r.title),
    embedding: (r.embedding_json as number[]) || [],
  }));

  let matched = 0;

  for (const camp of campRes.rows) {
    const campaignId = String(camp.campaign_id);
    const campaignName = camp.campaign_name ? String(camp.campaign_name) : null;
    const blob = `${campaignName || ''} ${camp.ad_text || ''}`.trim();
    if (!blob) continue;

    const scores: CampaignMatch[] = [];
    let campaignVec: number[] | null = null;
    try {
      campaignVec = (await getOrCreateEmbedding(blob.slice(0, 2000))).vector;
    } catch {
      campaignVec = null;
    }

    for (const p of products) {
      const kw = keywordOverlapScore(blob, p.text);
      let emb = 0;
      if (campaignVec && p.embedding.length) {
        emb = cosineSimilarity(campaignVec, p.embedding);
      }
      const confidence = Math.min(0.99, kw * 0.45 + emb * 0.55);
      if (confidence >= 0.22) {
        scores.push({
          product_id: p.id,
          product_title: p.title,
          confidence: Number(confidence.toFixed(4)),
          match_method: emb > kw ? 'embedding' : 'keyword',
          evidence: { keyword_score: kw, embedding_score: emb, campaign_sample: blob.slice(0, 200) },
        });
      }
    }

    scores.sort((a, b) => b.confidence - a.confidence);
    const top = scores[0];
    if (!top || top.confidence < 0.28) continue;

    await saveMatch(userId, platform, campaignId, campaignName, top, true);
    matched++;

    await pool.query(
      `INSERT INTO context_chunks (user_id, source_type, source_ref, title, body, content_hash, metadata)
       VALUES ($1, 'campaign', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, source_type, source_ref, content_hash) DO NOTHING`,
      [
        userId,
        `${platform}:${campaignId}`,
        campaignName || campaignId,
        blob.slice(0, 4000),
        contentHash(blob),
        JSON.stringify({ product_id: top.product_id, confidence: top.confidence }),
      ]
    );
  }

  return { matched, campaigns: campRes.rows.length };
}

export async function getCampaignProductContext(
  userId: number,
  platform: string,
  campaignId: string
) {
  const r = await pool.query(
    `SELECT m.confidence, m.match_method, m.evidence,
      p.id AS product_id, p.title, p.description, p.category, p.price, p.currency, p.product_url
     FROM campaign_product_matches m
     JOIN business_products p ON p.id = m.product_id
     WHERE m.user_id = $1 AND m.platform = $2 AND m.campaign_id = $3 AND m.is_primary = true
     ORDER BY m.confidence DESC LIMIT 1`,
    [userId, platform, campaignId]
  );
  return r.rows[0] || null;
}
