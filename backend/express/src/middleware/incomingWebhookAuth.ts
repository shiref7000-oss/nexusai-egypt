import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { findApiKeyByRaw } from '../services/integrationsDb';
import { pool } from '../config/db_pg';
import { logger } from '../config/logger';

export interface IncomingWebhookRequest extends Request {
  integration?: {
    id: number;
    userId: number;
    name: string;
    enabled: boolean;
    incomingSecret: string;
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

async function loadIntegration(integrationId: number) {
  const r = await pool.query(
    `SELECT id, user_id, name, enabled, incoming_secret
     FROM integrations WHERE id = $1`,
    [integrationId]
  );
  return r.rows[0] || null;
}

function extractProvidedSecret(req: IncomingWebhookRequest): string | null {
  const auth = req.headers?.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const hdr =
    (req.headers?.['x-nexus-secret'] as string) ||
    (req.headers?.['x-webhook-secret'] as string) ||
    (req.headers?.['x-api-key'] as string);
  return hdr?.trim() || null;
}

/**
 * Validates integration_id in URL + secret (integration incoming_secret or nxk_ API key).
 */
export async function authenticateIncomingWebhook(
  req: IncomingWebhookRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const integrationId = parseInt(String(req.params.integrationId).split(',')[0], 10);
    if (Number.isNaN(integrationId)) {
      return res.status(400).json({ success: false, error: 'Invalid integration id' });
    }

    const integration = await loadIntegration(integrationId);
    if (!integration) {
      return res.status(404).json({ success: false, error: 'Integration not found' });
    }
    if (!integration.enabled) {
      return res.status(403).json({ success: false, error: 'Integration is inactive' });
    }

    const provided = extractProvidedSecret(req);
    if (!provided) {
      return res.status(401).json({
        success: false,
        error: 'Missing secret. Use Authorization: Bearer <secret> or X-Nexus-Secret header',
        code: 'WEBHOOK_SECRET_MISSING',
      });
    }

    let authorized = false;

    if (integration.incoming_secret && timingSafeEqual(provided, integration.incoming_secret)) {
      authorized = true;
    }

    if (!authorized && provided.startsWith('nxk_')) {
      const keyRecord = await findApiKeyByRaw(provided);
      if (keyRecord && keyRecord.integration_id === integrationId && keyRecord.integration_enabled) {
        authorized = true;
      }
    }

    if (!authorized) {
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook secret',
        code: 'WEBHOOK_SECRET_INVALID',
      });
    }

    req.integration = {
      id: integration.id,
      userId: integration.user_id,
      name: integration.name,
      enabled: integration.enabled,
      incomingSecret: integration.incoming_secret,
    };

    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Auth failed';
    logger.error('Incoming webhook auth error', { error: message });
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}
