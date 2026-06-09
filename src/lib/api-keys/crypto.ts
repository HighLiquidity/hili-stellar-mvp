import '@/lib/server/only';

import { createHash, randomBytes } from 'node:crypto';

const SECRET_PREFIX = 'hili_sk_';
const KEY_PREFIX = 'hili_pk_';

function hashSecret(secret: string): string {
  const pepper = process.env.API_KEY_HASH_PEPPER?.trim() ?? '';
  return createHash('sha256').update(`${pepper}:${secret}`).digest('hex');
}

export function hashApiKeySecret(secret: string): string {
  const normalized = secret.trim();
  if (!normalized) {
    throw new Error('API key secret is required.');
  }
  return hashSecret(normalized);
}

export function verifyApiKeySecret(secret: string, secretHash: string): boolean {
  if (!secret.trim() || !secretHash.trim()) return false;
  const computed = hashSecret(secret.trim());
  return computed === secretHash.trim();
}

export function generateApiKeyCredentials(): { keyPrefix: string; secret: string; secretHash: string } {
  const prefixSuffix = randomBytes(4).toString('hex');
  const secretSuffix = randomBytes(18).toString('hex');
  const keyPrefix = `${KEY_PREFIX}${prefixSuffix}`;
  const secret = `${SECRET_PREFIX}${secretSuffix}`;
  return {
    keyPrefix,
    secret,
    secretHash: hashApiKeySecret(secret),
  };
}
