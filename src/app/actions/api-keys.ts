'use server';

import { parseApiKeyMaxAmountBrl, parseApiKeySpreadBpsOverride } from '@/lib/api-keys/commercial';
import { listApiKeyRequestLogs, listApiKeyRequestLogsForLinkedUser } from '@/lib/api-keys/request-log';
import {
  assertApiKeyOwnedByUser,
  createApiKey,
  listApiKeys,
  listApiKeysForLinkedUser,
  revokeApiKey,
} from '@/lib/api-keys/store';
import type { ApiActivityRow, ApiKeyCreateResult, ApiKeyRow, ApiKeyScope } from '@/lib/api-keys/types';
import { requireOperatorOrAdminFromAccessToken } from '@/lib/users/require-panel-role';

const SCOPES: ApiKeyScope[] = ['onramp', 'offramp', 'orders:read'];

export type ApiKeysActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function normalizeScopes(scopes: ApiKeyScope[]): ApiKeyScope[] {
  return scopes.filter((scope) => SCOPES.includes(scope));
}

export async function listApiKeysAction(accessToken: string): Promise<ApiKeysActionResult<ApiKeyRow[]>> {
  try {
    const ctx = await requireOperatorOrAdminFromAccessToken(accessToken);
    const rows =
      ctx.role === 'admin' ? await listApiKeys() : await listApiKeysForLinkedUser(ctx.userId);
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
    spreadBpsOverride?: string;
    maxAmountBrl?: string;
  },
): Promise<ApiKeysActionResult<ApiKeyCreateResult>> {
  try {
    const ctx = await requireOperatorOrAdminFromAccessToken(accessToken);

    if (ctx.role === 'operator') {
      const result = await createApiKey({
        label: input.label,
        linkedUserId: ctx.userId,
        scopes: normalizeScopes(input.scopes),
        createdByEmail: ctx.email,
      });
      return { ok: true, data: result };
    }

    const linkedUserEmail = input.linkedUserEmail?.trim();
    if (!linkedUserEmail) {
      return { ok: false, message: 'Linked operator email is required.' };
    }

    const result = await createApiKey({
      label: input.label,
      linkedUserEmail,
      scopes: normalizeScopes(input.scopes),
      createdByEmail: ctx.email,
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
    const ctx = await requireOperatorOrAdminFromAccessToken(accessToken);

    if (ctx.role === 'operator') {
      await assertApiKeyOwnedByUser(apiKeyId, ctx.userId);
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
    const ctx = await requireOperatorOrAdminFromAccessToken(accessToken);
    const rows =
      ctx.role === 'admin'
        ? await listApiKeyRequestLogs()
        : await listApiKeyRequestLogsForLinkedUser(ctx.userId);
    return { ok: true, data: rows };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/api_key_request_logs/i.test(message) && /does not exist|not found|schema cache/i.test(message)) {
      return { ok: false, message: 'TABLE_MISSING:api_key_request_logs' };
    }
    return { ok: false, message };
  }
}
