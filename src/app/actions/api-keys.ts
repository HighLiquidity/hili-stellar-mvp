'use server';

import { listApiKeyRequestLogs, listApiKeyRequestLogsForClient } from '@/lib/api-keys/request-log';
import {
  assertApiKeyInClient,
  createApiKey,
  listApiKeys,
  listApiKeysForClient,
  revokeApiKey,
} from '@/lib/api-keys/store';
import type { ApiActivityRow, ApiKeyCreateResult, ApiKeyRow, ApiKeyScope } from '@/lib/api-keys/types';
import { requireApiKeyManagerFromAccessToken } from '@/lib/users/require-delegated-admin';
import { isPlatformAdminRole } from '@/lib/users/roles';

const SCOPES: ApiKeyScope[] = ['onramp', 'offramp', 'orders:read'];

export type ApiKeysActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function normalizeScopes(scopes: ApiKeyScope[]): ApiKeyScope[] {
  return scopes.filter((scope) => SCOPES.includes(scope));
}

export async function listApiKeysAction(accessToken: string): Promise<ApiKeysActionResult<ApiKeyRow[]>> {
  try {
    const ctx = await requireApiKeyManagerFromAccessToken(accessToken);
    const rows = isPlatformAdminRole(ctx.role)
      ? await listApiKeys()
      : await listApiKeysForClient(ctx.clientId ?? '');
    return { ok: true, data: rows };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function createApiKeyAction(
  accessToken: string,
  input: {
    label: string;
    linkedUserEmail?: string;
    scopes: ApiKeyScope[];
  },
): Promise<ApiKeysActionResult<ApiKeyCreateResult>> {
  try {
    const ctx = await requireApiKeyManagerFromAccessToken(accessToken);

    const linkedUserEmail = input.linkedUserEmail?.trim();
    if (!linkedUserEmail) {
      return { ok: false, message: 'Linked operator email is required.' };
    }

    const result = await createApiKey({
      label: input.label,
      linkedUserEmail,
      scopes: normalizeScopes(input.scopes),
      createdByEmail: ctx.email,
      expectedClientId: isPlatformAdminRole(ctx.role) ? null : ctx.clientId,
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
    const ctx = await requireApiKeyManagerFromAccessToken(accessToken);

    if (!isPlatformAdminRole(ctx.role)) {
      const clientId = ctx.clientId?.trim();
      if (!clientId) {
        return { ok: false, message: 'Client admin is not linked to a client.' };
      }
      await assertApiKeyInClient(apiKeyId, clientId);
    }

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
    const ctx = await requireApiKeyManagerFromAccessToken(accessToken);
    const rows = isPlatformAdminRole(ctx.role)
      ? await listApiKeyRequestLogs()
      : await listApiKeyRequestLogsForClient(ctx.clientId ?? '');
    return { ok: true, data: rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/api_key_request_logs/i.test(message) && /does not exist|not found|schema cache/i.test(message)) {
      return { ok: false, message: 'TABLE_MISSING:api_key_request_logs' };
    }
    return { ok: false, message };
  }
}
