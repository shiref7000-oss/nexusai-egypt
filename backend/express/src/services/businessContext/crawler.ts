import { pool } from '../../config/db_pg';
import { logger } from '../../config/logger';
import { contentHash } from './hash';
import { upsertProduct, type BusinessProductInput } from './productRepository';

const MAX_PAGES = 12;
const FETCH_TIMEOUT_MS = 15000;
const CRAWL_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeStoreUrl(url: string): string {
  const u = new URL(url.startsWith('http') ? url : `https://${url}`);
  return `${u.protocol}//${u.host}`;
}

function detectStoreType(baseUrl: string): 'shopify' | 'woocommerce' | 'generic' {
  if (baseUrl.includes('myshopify.com')) return 'shopify';
  return 'generic';
}

async function fetchText(url: string): Promise<{ html: string; status: number }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'NexusAI-BCI-Crawler/1.0 (+product-catalog-sync)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  return { html: await res.text(), status: res.status };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonLdProducts(html: string): BusinessProductInput[] {
  const products: BusinessProductInput[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]!);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Product' || item.type === 'Product') {
          products.push({
            title: String(item.name || '').slice(0, 512),
            description: String(item.description || '').slice(0, 4000),
            price: parseFloat(item.offers?.price || item.price || '0') || undefined,
            image_url: Array.isArray(item.image) ? item.image[0] : item.image,
            product_url: item.url,
            category: item.category,
          });
        }
        if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
          for (const el of item.itemListElement) {
            const p = el.item || el;
            if (p?.name) {
              products.push({
                title: String(p.name).slice(0, 512),
                description: String(p.description || '').slice(0, 2000),
                product_url: p.url,
              });
            }
          }
        }
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return products.filter((p) => p.title.length > 2);
}

function parseOgProductMeta(html: string, pageUrl: string): BusinessProductInput | null {
  const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const desc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (!title) return null;
  return {
    title: title.slice(0, 512),
    description: desc?.slice(0, 2000),
    image_url: image,
    product_url: pageUrl,
  };
}

async function crawlShopifyJson(baseUrl: string): Promise<BusinessProductInput[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/products.json?limit=50`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return [];
    const data = (await res.json()) as { products?: Array<Record<string, unknown>> };
    return (data.products || []).map((p) => ({
      external_id: String(p.id || ''),
      title: String(p.title || ''),
      description: String(p.body_html || '').replace(/<[^>]+>/g, ' ').slice(0, 4000),
      category: (p.product_type as string) || undefined,
      price: parseFloat(String((p.variants as Array<{ price?: string }>)?.[0]?.price || '0')) || undefined,
      image_url: (p.image as { src?: string })?.src || (p.images as Array<{ src?: string }>)?.[0]?.src,
      product_url: `${baseUrl}/products/${p.handle}`,
      metadata: { vendor: p.vendor, tags: p.tags },
    }));
  } catch {
    return [];
  }
}

async function getCachedPage(sourceId: number, url: string, html: string): Promise<boolean> {
  const hash = contentHash(html);
  const r = await pool.query(
    `SELECT content_hash FROM crawl_page_cache WHERE source_id = $1 AND url = $2`,
    [sourceId, url]
  );
  if (r.rows[0]?.content_hash === hash) return true;

  await pool.query(
    `INSERT INTO crawl_page_cache (source_id, url, content_hash, http_status, last_fetched_at)
     VALUES ($1, $2, $3, 200, NOW())
     ON CONFLICT (source_id, url) DO UPDATE SET content_hash = EXCLUDED.content_hash, last_fetched_at = NOW()`,
    [sourceId, url, hash]
  );
  return false;
}

export async function crawlStoreSource(
  userId: number,
  sourceId: number,
  storeUrl: string
): Promise<{ productsIngested: number; pagesFetched: number }> {
  const base = normalizeStoreUrl(storeUrl);
  const storeType = detectStoreType(base);

  await pool.query(
    `UPDATE business_store_sources SET crawl_status = 'running', last_crawl_error = NULL, updated_at = NOW() WHERE id = $1`,
    [sourceId]
  );

  try {
    let products: BusinessProductInput[] = [];

    if (storeType === 'shopify') {
      products = await crawlShopifyJson(base);
    }

    const seedUrls = [
      base,
      `${base}/collections/all`,
      `${base}/products`,
    ];

    let pagesFetched = 0;
    const seenProductUrls = new Set<string>();

    for (const pageUrl of seedUrls.slice(0, MAX_PAGES)) {
      if (pagesFetched >= MAX_PAGES) break;
      await sleep(CRAWL_DELAY_MS);

      const { html, status } = await fetchText(pageUrl);
      if (status >= 400) continue;

      const unchanged = await getCachedPage(sourceId, pageUrl, html);
      pagesFetched++;
      if (unchanged && products.length) continue;

      for (const p of parseJsonLdProducts(html)) {
        if (p.product_url && seenProductUrls.has(p.product_url)) continue;
        if (p.product_url) seenProductUrls.add(p.product_url);
        products.push(p);
      }

      const og = parseOgProductMeta(html, pageUrl);
      if (og && (!og.product_url || !seenProductUrls.has(og.product_url))) {
        if (og.product_url) seenProductUrls.add(og.product_url);
        products.push(og);
      }

      const linkRe = /href=["']([^"']*\/products\/[^"']+)["']/gi;
      let lm: RegExpExecArray | null;
      const extraLinks: string[] = [];
      while ((lm = linkRe.exec(html)) && extraLinks.length < 8) {
        try {
          const full = new URL(lm[1], base).toString();
          if (!seenProductUrls.has(full)) extraLinks.push(full);
        } catch {
          /* skip */
        }
      }

      for (const link of extraLinks) {
        if (pagesFetched >= MAX_PAGES) break;
        await sleep(CRAWL_DELAY_MS);
        const pRes = await fetchText(link);
        pagesFetched++;
        const pUnchanged = await getCachedPage(sourceId, link, pRes.html);
        if (pUnchanged) continue;
        const pOg = parseOgProductMeta(pRes.html, link);
        if (pOg) {
          seenProductUrls.add(link);
          products.push(pOg);
        }
        products.push(...parseJsonLdProducts(pRes.html));
      }
    }

    const deduped = new Map<string, BusinessProductInput>();
    for (const p of products) {
      const key = (p.product_url || p.title).toLowerCase();
      if (!deduped.has(key)) deduped.set(key, p);
    }

    let ingested = 0;
    for (const p of deduped.values()) {
      await upsertProduct(userId, sourceId, p);
      ingested++;
    }

    await pool.query(
      `UPDATE business_store_sources SET crawl_status = 'success', last_crawl_at = NOW(),
        products_found = $2, updated_at = NOW() WHERE id = $1`,
      [sourceId, ingested]
    );

    return { productsIngested: ingested, pagesFetched };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await pool.query(
      `UPDATE business_store_sources SET crawl_status = 'error', last_crawl_error = $2, updated_at = NOW() WHERE id = $1`,
      [sourceId, msg]
    );
    logger.error('Store crawl failed', { sourceId, error: msg });
    throw e;
  }
}
