import { pool } from '../../config/db_pg';

export type BusinessMemoryProfile = {
  best_sellers: Array<{ title: string; product_id?: number }>;
  winning_hooks: string[];
  top_product_categories: string[];
  target_audience_hints: string[];
  ideal_roas?: number;
  ideal_cpa?: number;
  margin_assumption_pct?: number;
  offer_types: string[];
  seasonality_notes: string[];
  updated_at: string;
};

/** Rebuild business memory from rules + aggregates — no LLM. */
export async function refreshBusinessMemory(userId: number): Promise<BusinessMemoryProfile> {
  const topProducts = await pool.query(
    `SELECT id, title, category FROM business_products
     WHERE user_id = $1 ORDER BY synced_at DESC LIMIT 10`,
    [userId]
  );

  const orderProducts = await pool.query(
    `SELECT p->>'name' AS name, SUM((p->>'quantity')::int) AS qty
     FROM integration_orders o, LATERAL jsonb_array_elements(COALESCE(o.products, '[]')) p
     WHERE o.user_id = $1 AND o.created_at > NOW() - INTERVAL '90 days'
     GROUP BY p->>'name' ORDER BY qty DESC NULLS LAST LIMIT 8`,
    [userId]
  );

  const metaWinners = await pool.query(
    `SELECT c.name, SUM(i.roas)::float / NULLIF(COUNT(*), 0) AS avg_roas, SUM(i.spend)::float AS spend
     FROM meta_insights_daily i
     JOIN meta_ad_accounts a ON a.id = i.ad_account_id
     JOIN meta_connections conn ON conn.id = a.connection_id AND conn.user_id = $1
     LEFT JOIN meta_campaigns c ON c.campaign_id = i.entity_external_id
     WHERE i.entity_type = 'campaign' AND i.metric_date > CURRENT_DATE - 30 AND i.spend > 50
     GROUP BY c.name ORDER BY avg_roas DESC NULLS LAST LIMIT 5`,
    [userId]
  );

  const categories = [...new Set(topProducts.rows.map((r) => r.category).filter(Boolean))] as string[];

  const profile: BusinessMemoryProfile = {
    best_sellers: orderProducts.rows.map((r) => ({ title: String(r.name) })),
    winning_hooks: [],
    top_product_categories: categories.slice(0, 8),
    target_audience_hints: ['Egypt', 'COD', 'Mobile-first'],
    offer_types: [],
    seasonality_notes: [],
    updated_at: new Date().toISOString(),
  };

  if (metaWinners.rows[0]) {
    profile.ideal_roas = Number(metaWinners.rows[0].avg_roas) || undefined;
  }

  await pool.query(
    `INSERT INTO business_memory_profiles (user_id, profile, version, updated_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET profile = EXCLUDED.profile, version = business_memory_profiles.version + 1, updated_at = NOW()`,
    [userId, JSON.stringify(profile)]
  );

  return profile;
}

export async function getBusinessMemory(userId: number): Promise<BusinessMemoryProfile | null> {
  const r = await pool.query(`SELECT profile FROM business_memory_profiles WHERE user_id = $1`, [userId]);
  if (!r.rows[0]) return null;
  return r.rows[0].profile as BusinessMemoryProfile;
}

/** Compact context string for selective LLM calls (not full DB dump). */
export async function buildRetrievalContextForPrompt(
  userId: number,
  query: string,
  maxChars = 3000
): Promise<string> {
  const { searchContext } = await import('./vectorSearch');
  const memory = await getBusinessMemory(userId);
  const hits = await searchContext(userId, query, { limit: 6 });

  const parts: string[] = [];
  if (memory) {
    parts.push(
      `Business memory: best sellers: ${memory.best_sellers.map((b) => b.title).slice(0, 5).join(', ')}; categories: ${memory.top_product_categories.join(', ')}`
    );
    if (memory.ideal_roas) parts.push(`Target ROAS ~${memory.ideal_roas.toFixed(2)}`);
  }

  for (const h of hits) {
    parts.push(`[${h.source_type}] ${h.title || h.source_ref}: ${h.body.slice(0, 400)} (score ${h.score.toFixed(2)})`);
  }

  return parts.join('\n').slice(0, maxChars);
}
