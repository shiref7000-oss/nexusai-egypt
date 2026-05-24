import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { findApiKeyByRaw, touchApiKey } from '../services/integrationsDb';
import { logger } from '../config/logger';

export interface IntegrationAuthRequest extends AuthenticatedRequest {
  integrationAuth?: {
    userId: number;
    integrationId: number;
    apiKeyId: string;
    permissions: string[];
  };
}

export async function authenticateApiKey(
  req: IntegrationAuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    const rawKey =
      (header?.startsWith('Bearer ') ? header.slice(7) : null) ||
      (req.headers['x-api-key'] as string) ||
      (req.headers['x-nexus-api-key'] as string);

    if (!rawKey || !rawKey.startsWith('nxk_')) {
      return res.status(401).json({
        success: false,
        error: 'Valid integration API key required (nxk_...)',
        code: 'INTEGRATION_KEY_MISSING',
      });
    }

    const record = await findApiKeyByRaw(rawKey);
    if (!record) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'INTEGRATION_KEY_INVALID',
      });
    }

    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'API key expired',
        code: 'INTEGRATION_KEY_EXPIRED',
      });
    }

    const permissions = Array.isArray(record.permissions)
      ? record.permissions
      : JSON.parse(record.permissions || '[]');

    req.integrationAuth = {
      userId: record.user_id,
      integrationId: record.integration_id,
      apiKeyId: record.id,
      permissions,
    };

    touchApiKey(record.id).catch(() => {});
    next();
  } catch (err: any) {
    logger.error('API key auth error', { error: err.message });
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}

export function requireApiPermission(permission: string) {
  return (req: IntegrationAuthRequest, res: Response, next: NextFunction) => {
    const perms = req.integrationAuth?.permissions || [];
    if (!perms.includes(permission) && !perms.includes('*')) {
      return res.status(403).json({
        success: false,
        error: `Missing permission: ${permission}`,
        code: 'INTEGRATION_FORBIDDEN',
      });
    }
    next();
  };
}
