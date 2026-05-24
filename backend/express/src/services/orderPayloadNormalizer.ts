import {
  ORDER_WORKFLOW_STATUSES,
  type OrderWorkflowStatus,
  type OrderProduct,
} from './ordersDb';
import { normalizeEgyptianPhone } from './phoneNormalize';

export interface NormalizedIncomingOrder {
  externalId: string;
  customerName: string;
  customerPhone: string;
  customerCity: string | null;
  customerEmail: string | null;
  products: OrderProduct[];
  codAmount: number;
  currency: string;
  status: OrderWorkflowStatus;
  notes: string | null;
  idempotencyKey: string | null;
}

export interface NormalizeResult {
  ok: true;
  order: NormalizedIncomingOrder;
}

export interface NormalizeError {
  ok: false;
  errors: string[];
}

const INCOMING_STATUS_MAP: Record<string, OrderWorkflowStatus> = {
  new: 'new',
  pending: 'pending_confirmation',
  pending_confirmation: 'pending_confirmation',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  shipped: 'shipped',
  followup: 'new',
};

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
  }
  return null;
}

function normalizeProducts(raw: unknown): OrderProduct[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const products: OrderProduct[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = pickString(row.name, row.title, row.product_name, row.product);
    const qty = row.quantity ?? row.qty ?? 1;
    const quantity =
      typeof qty === 'number' ? Math.max(1, Math.floor(qty)) : parseInt(String(qty), 10) || 1;
    if (!name) continue;
    products.push({
      name,
      quantity,
      price:
        typeof row.price === 'number'
          ? row.price
          : parseFloat(String(row.price || 0)) || undefined,
      sku: pickString(row.sku, row.id) || undefined,
    });
  }
  return products.length ? products : null;
}

function mapIncomingStatus(raw: string | null): OrderWorkflowStatus {
  if (!raw) return 'new';
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  return INCOMING_STATUS_MAP[key] || 'new';
}

/**
 * Accepts nested or flat ecommerce payloads from any store/ERP.
 */
export function normalizeIncomingOrderPayload(
  body: Record<string, unknown>
): NormalizeResult | NormalizeError {
  const errors: string[] = [];
  const customer =
    body.customer && typeof body.customer === 'object'
      ? (body.customer as Record<string, unknown>)
      : {};

  const externalId = pickString(
    body.external_id,
    body.external_order_id,
    body.order_id,
    body.orderId,
    body.id
  );
  if (!externalId) errors.push('external_id (or external_order_id) is required');

  const customerName = pickString(
    customer.name,
    body.customer_name,
    body.name,
    body.full_name
  );
  if (!customerName || customerName.length < 2) errors.push('customer name is required');

  const phoneRaw = pickString(
    customer.phone,
    body.customer_phone,
    body.phone,
    body.mobile
  );
  if (!phoneRaw) {
    errors.push('phone is required');
  }

  let customerPhone: string | null = null;
  if (phoneRaw) {
    const normalized = normalizeEgyptianPhone(phoneRaw);
    if (!normalized.ok) {
      errors.push(normalized.error);
    } else {
      customerPhone = normalized.phone;
    }
  }

  const customerCity =
    pickString(customer.city, body.city, body.customer_city, body.shipping_city) || null;

  const products = normalizeProducts(body.products ?? body.items ?? body.line_items);
  if (!products) errors.push('products array with at least one item is required');

  let codAmount =
    typeof body.cod_amount === 'number'
      ? body.cod_amount
      : typeof body.amount === 'number'
        ? body.amount
        : typeof body.total === 'number'
          ? body.total
          : parseFloat(String(body.cod_amount ?? body.amount ?? body.total ?? ''));
  if (Number.isNaN(codAmount) || codAmount < 0) {
    errors.push('cod_amount (or amount) must be a non-negative number');
    codAmount = 0;
  }

  const statusRaw = pickString(body.status, body.order_status);
  const status = mapIncomingStatus(statusRaw);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    order: {
      externalId: externalId!,
      customerName: customerName!,
      customerPhone: customerPhone!,
      customerCity,
      customerEmail: pickString(customer.email, body.customer_email, body.email),
      products: products!,
      codAmount,
      currency: pickString(body.currency) || 'EGP',
      status,
      notes: pickString(body.notes, body.note, body.comment),
      idempotencyKey: pickString(body.idempotency_key, body.idempotencyKey),
    },
  };
}

export function previewPayload(body: unknown, maxLen = 4000): Record<string, unknown> {
  try {
    const str = JSON.stringify(body);
    if (str.length <= maxLen) return (body || {}) as Record<string, unknown>;
    return { _truncated: true, preview: str.slice(0, maxLen) };
  } catch {
    return { _error: 'unserializable payload' };
  }
}

export function storePayload(body: unknown, maxBytes = 32768): Record<string, unknown> | null {
  try {
    const str = JSON.stringify(body ?? {});
    if (str.length > maxBytes) {
      return {
        _truncated: true,
        _original_bytes: str.length,
        payload: JSON.parse(str.slice(0, maxBytes)),
      };
    }
    return (body || {}) as Record<string, unknown>;
  } catch {
    return { _error: 'unserializable payload' };
  }
}

export { ORDER_WORKFLOW_STATUSES };
