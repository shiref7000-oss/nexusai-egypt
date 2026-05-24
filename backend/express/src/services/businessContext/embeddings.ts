import { pool } from '../../config/db_pg';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { contentHash } from './hash';

const EMBED_MODEL = env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
const EMBED_DIM = env.BCI_EMBEDDING_DIM || 768;

function geminiKeys(): string[] {
  return [env.GEMINI_API_KEY, env.GEMINI_KEY_1, env.GEMINI_KEY_2, env.GEMINI_KEY_3].filter(
    Boolean
  ) as string[];
}

export type EmbeddingVector = number[];

/** Cosine similarity (for JSONB fallback when pgvector unavailable). */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

async function embedViaGemini(text: string): Promise<EmbeddingVector> {
  const keys = geminiKeys();
  if (!keys.length) throw new Error('GEMINI_API_KEY not configured for embeddings');

  const trimmed = text.trim().slice(0, 8000);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

  let lastErr = 'unknown';
  for (const key of keys) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: trimmed }] },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        lastErr = await res.text();
        continue;
      }
      const data = (await res.json()) as { embedding?: { values?: number[] } };
      const values = data.embedding?.values;
      if (!values?.length) throw new Error('Empty embedding response');
      return values;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Embedding failed: ${lastErr}`);
}

/**
 * Embed text with global content-hash cache — zero API calls for unchanged content.
 */
export async function getOrCreateEmbedding(text: string): Promise<{
  vector: EmbeddingVector;
  hash: string;
  fromCache: boolean;
}> {
  const hash = contentHash(text);
  const cached = await pool.query(
    `SELECT embedding_json FROM bci_embedding_cache WHERE content_hash = $1`,
    [hash]
  );
  if (cached.rows[0]?.embedding_json) {
    const vec = cached.rows[0].embedding_json as number[];
    return { vector: vec, hash, fromCache: true };
  }

  const vector = await embedViaGemini(text);
  const json = JSON.stringify(vector);
  const vecLiteral = `[${vector.join(',')}]`;

  await pool.query(
    `INSERT INTO bci_embedding_cache (content_hash, embedding_json, model, token_estimate)
     VALUES ($1, $2::jsonb, $3, $4)
     ON CONFLICT (content_hash) DO NOTHING`,
    [hash, json, EMBED_MODEL, Math.ceil(text.length / 4)]
  );

  if (vecLiteral) {
    try {
      await pool.query(
        `UPDATE bci_embedding_cache SET embedding = $2::vector WHERE content_hash = $1`,
        [hash, vecLiteral]
      );
    } catch {
      /* pgvector column absent */
    }
  }

  return { vector, hash, fromCache: false };
}

export function buildProductSearchText(input: {
  title: string;
  description?: string;
  category?: string;
  offer_text?: string;
  hero_headline?: string;
}): string {
  return [input.title, input.category, input.offer_text, input.hero_headline, input.description]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000);
}

export { EMBED_DIM, EMBED_MODEL };
