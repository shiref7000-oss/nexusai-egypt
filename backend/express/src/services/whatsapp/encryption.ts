import crypto from 'crypto';
import { env } from '../../config/env';

const ALGO = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const material = env.INTEGRATION_ENCRYPTION_KEY || env.JWT_SECRET;
  return crypto.createHash('sha256').update(material, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function hashWebhookVerifyToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
