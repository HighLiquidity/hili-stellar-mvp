'use server';

import { parseApiKeyMaxAmountBrl, parseApiKeySpreadBpsOverride } from '@/lib/api-keys/commercial';
import { listApiKeyRequestLogs } from '@/lib/api-keys/request-log';
import { createApiKey, listApiKeys, revokeApiKey } from '@/lib/api-keys/store';
import type { ApiActivityRow, ApiKeyCreateResult, ApiKeyRow, ApiKeyScope } from '@/lib/api-keys/types';
import { requireAdminFromAccessToken } from '@/lib/users/require-admin';

const SCOPES: ApiKeyScope[] = ['onramp', 'offramp', 'orders:read'];

export type ApiKeysActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function normalizeScopes(scopes: ApiKeyScope[]): ApiKeyScope[] {
  return scopes.filter((scope) => SCOPES.includes(scope));
}

export async function listApiKeysAction(accessToken: string): Promise<ApiKeysActionResult<ApiKeyRow[]>> {
  try {
    await requireAdminFromAccessToken(accessToken);
    const rows = await listApiKeys();
    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function createApiKeyAction(
  accessToken: string,
  input: {
    label: string;
    linkedUserEmail: string;
    scopes: ApiKeyScope[];
    spreadBpsOverride?: string;
    maxAmountBrl?: string;
  },
): Promise<ApiKeysActionResult<ApiKeyCreateResult>> {
  try {
    const { email } = await requireAdminFromAccessToken(accessToken);
    const result = await createApiKey({
      label: input.label,
      linkedUserEmail: input.linkedUserEmail,
      scopes: normalizeScopes(input.scopes),
      createdByEmail: email,
      spreadBpsOverride: parseApiKeySpreadBpsOverride(input.spreadBpsOverride),
      maxAmountBrl: parseApiKeyMaxAmountBrl(input.maxAmountBrl),
    });
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function revokeApiKeyAction(
  accessToken: string,
  apiKeyId: string,
): Promise<ApiKeysActionResult<ApiKeyRow>> {
  try {
    await requireAdminFromAccessToken(accessToken);
    const row = await revokeApiKey(apiKeyId);
    return { ok: true, data: row };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function listApiKeyActivityAction(
  accessToken: string,
): Promise<ApiKeysActionResult<ApiActivityRow[]>> {
  try {
    await requireAdminFromAccessToken(accessToken);
    const rows = await listApiKeyRequestLogs();
    return { ok: true, data: rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/api_key_request_logs/i.test(message) && /does not exist|not found|schema cache/i.test(message)) {
      return { ok: false, message: 'TABLE_MISSING:api_key_request_logs' };
    }
    return { ok: false, message };
  }
}
