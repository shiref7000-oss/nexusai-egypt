/** Normalize Express param/query values for strict TypeScript builds. */
export function paramStr(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '');
  if (value === undefined || value === null) return '';
  return String(value);
}
