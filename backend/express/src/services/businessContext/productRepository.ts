import { pool } from '../../config/db_pg';
import { buildProductSearchText, getOrCreateEmbedding } from './embeddings';
import { contentHash } from './hash';

export type BusinessProductInput = {
  external_id?: string;
  title: string;
  description?: string;
  category?: string;
  price?: number;
  currency?: string;
  image_url?: string;
  product_url?: string;
  offer_text?: string;
  hero_headline?: string;
  metadata?: Record<string, unknown>;
};

export async function upsertStoreSource(
  userId: number,
  storeUrl: string,
  storeType = 'generic'
): Promise<{ id: number }> {
  const r = await pool.query(
    `INSERT INTO business_store_sources (user_id, store_url, store_type, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, store_url) DO UPDATE SET store_type = EXCLUDED.store_type, updated_at = NOW()
     RETURNING id`,
    [userId, storeUrl, storeType]
  );
  return { id: r.rows[0].id as number };
}

export async function getStoreSources(userId: number) {
  const r = await pool.query(
    `SELECT id, store_url, store_type, last_crawl_at, crawl_status, products_found, last_crawl_error
     FROM business_store_sources WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return r.rows;
}

export async function upsertProduct(
  userId: number,
  sourceId: number | null,
  input: BusinessProductInput,
  options?: { skipEmbedding?: boolean }
): Promise<{ id: number; skipped: boolean }> {
  const searchText = buildProductSearchText(input);
  const hash = contentHash(searchText);

  const existing = await pool.query(
    `SELECT id, content_hash FROM business_products WHERE user_id = $1 AND content_hash = $2`,
    [userId, hash]
  );
  if (existing.rows[0] && existing.rows[0].content_hash === hash && options?.skipEmbedding) {
    return { id: existing.rows[0].id as number, skipped: true };
  }

  let embeddingJson = '[]';
  let vecLiteral: string | null = null;
  if (!options?.skipEmbedding && searchText.length > 10) {
    const { vector } = await getOrCreateEmbedding(searchText);
    embeddingJson = JSON.stringify(vector);
    vecLiteral = `[${vector.join(',')}]`;
  }

  const r = await pool.query(
    `INSERT INTO business_products (
      user_id, source_id, external_id, title, description, category, price, currency,
      image_url, product_url, offer_text, hero_headline, content_hash, metadata,
      search_text, embedding_json, synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,NOW())
    ON CONFLICT (user_id, content_hash) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      price = EXCLUDED.price,
      image_url = EXCLUDED.image_url,
      product_url = EXCLUDED.product_url,
      offer_text = EXCLUDED.offer_text,
      hero_headline = EXCLUDED.hero_headline,
      metadata = EXCLUDED.metadata,
      search_text = EXCLUDED.search_text,
      embedding_json = EXCLUDED.embedding_json,
      synced_at = NOW()
    RETURNING id`,
    [
      userId,
      sourceId,
      input.external_id || null,
      input.title,
      input.description || null,
      input.category || null,
      input.price ?? null,
      input.currency || 'EGP',
      input.image_url || null,
      input.product_url || null,
      input.offer_text || null,
      input.hero_headline || null,
      hash,
      JSON.stringify(input.metadata || {}),
      searchText,
      embeddingJson,
    ]
  );

  if (vecLiteral) {
    try {
      await pool.query(`UPDATE business_products SET embedding = $2::vector WHERE id = $1`, [
        r.rows[0].id,
        vecLiteral,
      ]);
    } catch {
      /* optional pgvector */
    }
  }

  await upsertProductChunk(userId, r.rows[0].id as number, input.title, searchText, hash, embeddingJson);
  return { id: r.rows[0].id as number, skipped: false };
}

async function upsertProductChunk(
  userId: number,
  productId: number,
  title: string,
  body: string,
  hash: string,
  embeddingJson: string
) {
  await pool.query(
    `INSERT INTO context_chunks (user_id, source_type, source_ref, title, body, content_hash, embedding_json, metadata)
     VALUES ($1, 'product', $2, $3, $4, $5, $6::jsonb, '{}')
     ON CONFLICT (user_id, source_type, source_ref, content_hash) DO UPDATE SET
       body = EXCLUDED.body, embedding_json = EXCLUDED.embedding_json`,
    [userId, String(productId), title, body, hash, embeddingJson]
  );
  if (embeddingJson !== '[]') {
    try {
      const vecLiteral = `[${(JSON.parse(embeddingJson) as number[]).join(',')}]`;
      await pool.query(
        `UPDATE context_chunks SET embedding = $4::vector
         WHERE user_id = $1 AND source_type = 'product' AND source_ref = $2 AND content_hash = $3`,
        [userId, String(productId), hash, vecLiteral]
      );
    } catch {
      /* optional */
    }
  }
}

export async function listProducts(userId: number, limit = 100) {
  const r = await pool.query(
    `SELECT id, title, description, category, price, currency, image_url, product_url,
      offer_text, hero_headline, content_hash, synced_at
     FROM business_products WHERE user_id = $1 ORDER BY synced_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

export async function ingestProductsFromOrderLineItems(userId: number): Promise<number> {
  const r = await pool.query(
    `SELECT DISTINCT ON (lower(trim(p->>'name')))
      p->>'name' AS name,
      (p->>'price')::numeric AS price,
      (p->>'quantity')::int AS qty
     FROM integration_orders o,
     LATERAL jsonb_array_elements(COALESCE(o.products, '[]'::jsonb)) p
     WHERE o.user_id = $1 AND p->>'name' IS NOT NULL AND length(trim(p->>'name')) > 1
     ORDER BY lower(trim(p->>'name')), o.created_at DESC
     LIMIT 200`,
    [userId]
  );

  let count = 0;
  for (const row of r.rows) {
    await upsertProduct(userId, null, {
      title: String(row.name),
      price: row.price != null ? Number(row.price) : undefined,
      category: 'order_catalog',
      metadata: { source: 'integration_orders', quantity: row.qty },
    });
    count++;
  }
  return count;
}
