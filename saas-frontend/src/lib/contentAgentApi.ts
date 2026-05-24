import { apiFetch } from './api';

export type ContentType =
  | 'facebook_ad'
  | 'whatsapp_campaign'
  | 'product_description'
  | 'ugc_script'
  | 'video_hook'
  | 'sales_copy'
  | 'offer_variation'
  | 'retargeting'
  | 'egyptian_arabic';

export type ContentStyle =
  | 'casual_egyptian'
  | 'formal_arabic'
  | 'franco_arabic'
  | 'direct_response'
  | 'story_sell'
  | 'urgency'
  | 'luxury'
  | 'humor';

export type ContentStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export type ContentGeneration = {
  id: string;
  content_type: ContentType;
  style: ContentStyle;
  status: ContentStatus;
  product_id: number | null;
  product_name: string | null;
  product_context: Record<string, unknown>;
  brief: string | null;
  output: Record<string, unknown>;
  raw_text: string | null;
  model: string;
  provider: string;
  latency_ms: number | null;
  quality_score: string | null;
  quality_notes: string | null;
  reviewer_notes: string | null;
  parent_id: string | null;
  version: number;
  total_tokens: number | null;
  cost_usd: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentMeta = {
  model: string;
  provider: string;
  contentTypes: { id: ContentType; label: string }[];
  styles: ContentStyle[];
  statuses: ContentStatus[];
};

export type BusinessProduct = {
  id: number;
  title: string;
  description?: string;
  category?: string;
  price?: number;
  currency?: string;
};

export const contentAgentApi = {
  meta: () => apiFetch<{ success: boolean; data: ContentMeta }>('/api/content-agent/meta'),
  products: () =>
    apiFetch<{ success: boolean; data: BusinessProduct[] }>('/api/content-agent/products'),
  history: (params?: { limit?: number; offset?: number; status?: ContentStatus; contentType?: ContentType }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    if (params?.status) q.set('status', params.status);
    if (params?.contentType) q.set('contentType', params.contentType);
    const qs = q.toString();
    return apiFetch<{ success: boolean; data: { items: ContentGeneration[]; total: number } }>(
      `/api/content-agent/history${qs ? `?${qs}` : ''}`,
    );
  },
  get: (id: string) =>
    apiFetch<{ success: boolean; data: ContentGeneration }>(`/api/content-agent/${id}`),
  generate: (body: {
    contentType: ContentType;
    style?: ContentStyle;
    brief: string;
    productId?: number;
    productName?: string;
    runQualityReview?: boolean;
  }) =>
    apiFetch<{ success: boolean; data: ContentGeneration; error?: string }>(
      '/api/content-agent/generate',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  regenerate: (id: string, body?: { regenerateHint?: string; brief?: string }) =>
    apiFetch<{ success: boolean; data: ContentGeneration; error?: string }>(
      `/api/content-agent/${id}/regenerate`,
      { method: 'POST', body: JSON.stringify(body || {}) },
    ),
  review: (id: string) =>
    apiFetch<{ success: boolean; data: ContentGeneration }>(`/api/content-agent/${id}/review`, {
      method: 'POST',
    }),
  setStatus: (id: string, status: ContentStatus, reviewerNotes?: string) =>
    apiFetch<{ success: boolean; data: ContentGeneration }>(`/api/content-agent/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reviewerNotes }),
    }),
};
