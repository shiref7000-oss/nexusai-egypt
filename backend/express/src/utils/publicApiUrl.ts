import { env } from '../config/env';

/**
 * Public API base as seen through nginx (includes exactly one /api segment).
 * API_BASE_URL may be https://nexus-ai.group/api (prod) or http://localhost:3001 (dev).
 */
export function publicApiBaseUrl(): string {
  const base = (env.API_BASE_URL || 'https://nexus-ai.group/api').replace(/\/$/, '');
  if (base.endsWith('/api')) return base;
  return `${base}/api`;
}

/** Canonical WhatsApp Cloud webhook callback for Meta App configuration. */
export function whatsappWebhookPublicUrl(): string {
  return `${publicApiBaseUrl()}/webhooks/whatsapp`;
}
