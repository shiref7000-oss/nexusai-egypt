/**
 * Objective-aware purchase / ROAS extraction from Meta Ads Insights.
 *
 * Meta returns many overlapping action_types. We never substring-match "purchase"
 * (that can include messaging or irrelevant conversions). We never use purchase_roas[0]
 * blindly (order is not guaranteed).
 *
 * Attribution: requests should pass action_attribution_windows (see graphClient) so
 * values align with Ads Manager defaults where possible.
 */

import type { InsightRow } from './graphClient';

type ActionRow = { action_type: string; value: string };

/** Campaign objectives where purchase value / ROAS must be suppressed (non-store outcomes). */
const OBJECTIVES_NO_PURCHASE_ROAS = new Set([
  'OUTCOME_MESSAGES',
  'OUTCOME_LEADS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS',
  'LINK_CLICKS',
  'POST_ENGAGEMENT',
  'PAGE_LIKES',
  'VIDEO_VIEWS',
  'REACH',
  'BRAND_AWARENESS',
  'EVENT_RESPONSES',
  'MESSAGES',
  'LEAD_GENERATION',
  'CANVAS_APP_INSTALLS',
  'STORE_VISITS',
  'LOCAL_AWARENESS',
]);

function normalizeObjective(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase();
}

export function shouldReportPurchaseMetrics(objective: string | null | undefined): boolean {
  const o = normalizeObjective(objective);
  if (!o) return true;
  return !OBJECTIVES_NO_PURCHASE_ROAS.has(o);
}

function isAppCommerceObjective(objective: string | null | undefined): boolean {
  const o = normalizeObjective(objective);
  return (
    o === 'OUTCOME_APP_PROMOTION' ||
    o === 'MOBILE_APP_INSTALLS' ||
    o === 'APP_INSTALLS'
  );
}

/** Website / pixel / catalog purchase counts & values (no messaging, no leads). */
const WEB_PURCHASE_COUNT_TYPES_ORDERED = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
  'onsite_web_app_purchase',
  'web_in_store_purchase',
  'catalog_segment_purchase',
] as const;

const APP_PURCHASE_COUNT_TYPES_ORDERED = ['app_custom_event.fb_mobile_purchase'] as const;

const WEB_PURCHASE_VALUE_TYPES_ORDERED = WEB_PURCHASE_COUNT_TYPES_ORDERED;

const APP_PURCHASE_VALUE_TYPES_ORDERED = APP_PURCHASE_COUNT_TYPES_ORDERED;

/** Types accepted inside purchase_roas / website_purchase_roas arrays. */
const WEB_ROAS_ACTION_TYPES = new Set<string>([
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
  'onsite_web_app_purchase',
  'web_in_store_purchase',
  'catalog_segment_purchase',
]);

const APP_ROAS_ACTION_TYPES = new Set<string>(['app_custom_event.fb_mobile_purchase']);

function getFromActionsOrdered(
  rows: ActionRow[] | undefined,
  orderedTypes: readonly string[]
): number {
  if (!rows?.length) return 0;
  const byType = new Map<string, number>();
  for (const r of rows) {
    if (!r?.action_type) continue;
    byType.set(r.action_type, parseFloat(r.value || '0') || 0);
  }
  for (const t of orderedTypes) {
    const v = byType.get(t);
    if (v != null && v > 0) return v;
  }
  return 0;
}

function pickRoasFromArray(
  arr: ActionRow[] | undefined,
  allowedActionTypes: Set<string>
): number {
  if (!arr?.length) return 0;
  const filtered = arr.filter((x) => x?.action_type && allowedActionTypes.has(x.action_type));
  if (!filtered.length) return 0;

  const byType = new Map<string, number>();
  for (const x of filtered) {
    const v = parseFloat(x.value || '0') || 0;
    if (v > 0) byType.set(x.action_type, v);
  }

  const priority = [
    'omni_purchase',
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
    'onsite_web_purchase',
    'onsite_web_app_purchase',
    'web_in_store_purchase',
    'catalog_segment_purchase',
    'app_custom_event.fb_mobile_purchase',
  ];
  for (const p of priority) {
    if (!allowedActionTypes.has(p)) continue;
    const v = byType.get(p);
    if (v != null && v > 0) return v;
  }
  return 0;
}

function pickWebsitePurchaseRoas(row: InsightRow, allowedActionTypes: Set<string>): number {
  const v = pickRoasFromArray(row.website_purchase_roas, allowedActionTypes);
  if (v > 0) return v;
  return 0;
}

function pickPurchaseRoas(row: InsightRow, allowedActionTypes: Set<string>): number {
  return pickRoasFromArray(row.purchase_roas, allowedActionTypes);
}

/**
 * Per-row commerce metrics for DB storage and downstream analytics.
 */
export function computeCommerceMetricsForInsight(
  campaignObjective: string | null | undefined,
  row: InsightRow,
  spend: number
): { purchases: number; purchase_value: number; roas: number } {
  if (!shouldReportPurchaseMetrics(campaignObjective)) {
    return { purchases: 0, purchase_value: 0, roas: 0 };
  }

  const app = isAppCommerceObjective(campaignObjective);
  const countOrder = app
    ? [...APP_PURCHASE_COUNT_TYPES_ORDERED, ...WEB_PURCHASE_COUNT_TYPES_ORDERED]
    : [...WEB_PURCHASE_COUNT_TYPES_ORDERED];
  const valueOrder = app
    ? [...APP_PURCHASE_VALUE_TYPES_ORDERED, ...WEB_PURCHASE_VALUE_TYPES_ORDERED]
    : [...WEB_PURCHASE_VALUE_TYPES_ORDERED];
  const roasTypes = new Set<string>([...WEB_ROAS_ACTION_TYPES]);
  if (app) {
    for (const t of APP_ROAS_ACTION_TYPES) roasTypes.add(t);
  }

  const purchases = getFromActionsOrdered(row.actions, countOrder);
  const purchase_value = getFromActionsOrdered(row.action_values, valueOrder);

  let roas = 0;
  if (app) {
    roas = pickPurchaseRoas(row, roasTypes);
  } else {
    // Sales / web: prefer Meta's website purchase ROAS when present.
    roas = pickWebsitePurchaseRoas(row, WEB_ROAS_ACTION_TYPES);
    if (roas <= 0) {
      roas = pickPurchaseRoas(row, WEB_ROAS_ACTION_TYPES);
    }
  }

  if (roas <= 0 && spend > 0 && purchase_value > 0) {
    roas = purchase_value / spend;
  }

  return {
    purchases,
    purchase_value,
    roas: roas > 0 ? roas : 0,
  };
}
