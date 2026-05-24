/**
 * Cross-platform attribution normalization.
 * Meta: action_attribution_windows 7d_click + 1d_view
 * TikTok: reporting with comparable click/view windows
 */

export type AttributionWindowId = '7d_click_1d_view';

export const DEFAULT_ATTRIBUTION: AttributionWindowId = '7d_click_1d_view';

/** Meta Graph API param */
export function metaAttributionWindows(): string[] {
  return ['7d_click', '1d_view'];
}

/** TikTok integrated report — use click + view aligned windows where supported */
export function tiktokAttributionSpec(): {
  windowId: AttributionWindowId;
  /** Documented for reporting filters when API supports explicit windows */
  clickWindowDays: number;
  viewWindowDays: number;
} {
  return {
    windowId: '7d_click_1d_view',
    clickWindowDays: 7,
    viewWindowDays: 1,
  };
}
