import { normalizeProductName } from './normalize';

/**
 * Canonical product aliases — keys are normalized; values are display canonical name.
 * Extend over time from merchant SKU library / learned mappings.
 */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  // Microfiber mitt variants
  منفضهمايكروفايبر: 'منفضة مايكروفايبر',
  منفضةمايكروفايبر: 'منفضة مايكروفايبر',
  'microfiber mitt': 'منفضة مايكروفايبر',
  'microfiber cloth': 'منفضة مايكروفايبر',
  microfiber: 'منفضة مايكروفايبر',
  // Silicone sponge
  ليفهسيليكون: 'ليفة سيليكون',
  'silicone sponge': 'ليفة سيليكون',
  'silicone scrubber': 'ليفة سيليكون',
};

export function applyProductAlias(productName: string): string {
  const trimmed = String(productName || '').trim();
  if (!trimmed) return trimmed;
  const key = normalizeProductName(trimmed);
  const compact = key.replace(/\s+/g, '');
  return ALIAS_TO_CANONICAL[compact] || ALIAS_TO_CANONICAL[key] || trimmed;
}
