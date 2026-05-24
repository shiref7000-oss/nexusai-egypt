import { pool } from '../../config/db_pg';
import { cosineSimilarity, getOrCreateEmbedding } from './embeddings';

export type VectorHit = {
  source_type: string;
  source_ref: string;
  title: string | null;
  body: string;
  score: number;
  metadata: Record<string, unknown>;
};

/**
 * Semantic retrieval — prefers pgvector, falls back to in-memory cosine on embedding_json.
 */
export async function searchContext(
  userId: number,
  query: string,
  options: { limit?: number; sourceTypes?: string[] } = {}
): Promise<VectorHit[]> {
  const limit = options.limit ?? 8;
  const { vector: queryVec } = await getOrCreateEmbedding(query.slice(0, 4000));
  const vecLiteral = `[${queryVec.join(',')}]`;

  try {
    if (options.sourceTypes?.length) {
      const r = await pool.query(
        `SELECT source_type, source_ref, title, body, metadata,
          1 - (embedding <=> $2::vector) AS score
         FROM context_chunks
         WHERE user_id = $1 AND embedding IS NOT NULL AND source_type = ANY($3::text[])
         ORDER BY embedding <=> $2::vector
         LIMIT $4`,
        [userId, vecLiteral, options.sourceTypes, limit]
      );
      return mapHits(r.rows);
    }
    const r = await pool.query(
      `SELECT source_type, source_ref, title, body, metadata,
        1 - (embedding <=> $2::vector) AS score
       FROM context_chunks
       WHERE user_id = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [userId, vecLiteral, limit]
    );
    return mapHits(r.rows);
  } catch {
    /* pgvector unavailable */
  }

  const r = options.sourceTypes?.length
    ? await pool.query(
        `SELECT source_type, source_ref, title, body, metadata, embedding_json
         FROM context_chunks WHERE user_id = $1 AND source_type = ANY($2::text[]) LIMIT 500`,
        [userId, options.sourceTypes]
      )
    : await pool.query(
        `SELECT source_type, source_ref, title, body, metadata, embedding_json
         FROM context_chunks WHERE user_id = $1 LIMIT 500`,
        [userId]
      );

  return r.rows
    .map((row) => {
      const emb = (row.embedding_json as number[]) || [];
      return {
        source_type: String(row.source_type),
        source_ref: String(row.source_ref),
        title: row.title ? String(row.title) : null,
        body: String(row.body),
        score: cosineSimilarity(queryVec, emb),
        metadata: (row.metadata as Record<string, unknown>) || {},
      };
    })
    .filter((h) => h.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function mapHits(rows: Record<string, unknown>[]): VectorHit[] {
  return rows.map((row) => ({
    source_type: String(row.source_type),
    source_ref: String(row.source_ref),
    title: row.title ? String(row.title) : null,
    body: String(row.body),
    score: Number(row.score) || 0,
    metadata: (row.metadata as Record<string, unknown>) || {},
  }));
}

export async function findSimilarProducts(userId: number, productId: number, limit = 5) {
  const r = await pool.query(
    `SELECT search_text FROM business_products WHERE user_id = $1 AND id = $2`,
    [userId, productId]
  );
  if (!r.rows[0]) return [];
  return searchContext(userId, String(r.rows[0].search_text || ''), { limit, sourceTypes: ['product'] });
}
