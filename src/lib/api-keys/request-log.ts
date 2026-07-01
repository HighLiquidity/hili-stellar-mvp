import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { ApiActivityRow } from './types';

const REQUEST_LOGS_TABLE = 'api_key_request_logs';
const DEFAULT_LIST_LIMIT = 100;

type RequestLogDbRow = {
  id: string;
  created_at: string;
  api_key_id: string;
  key_prefix: string;
  method: string;
  route: string;
  status_code: number;
  duration_ms: number | null;
  idempotency_key: string | null;
};

function mapActivityRow(row: RequestLogDbRow): ApiActivityRow {
  return {
    id: row.id,
    occurredAt: row.created_at,
    keyPrefix: row.key_prefix,
    method: row.method,
    route: row.route,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    idempotencyKey: row.idempotency_key,
  };
}

export async function logApiKeyRequest(input: {
  apiKeyId: string;
  keyPrefix: string;
  clientId?: string | null;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  idempotencyKey?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin.from(REQUEST_LOGS_TABLE).insert({
    api_key_id: input.apiKeyId,
    key_prefix: input.keyPrefix,
    client_id: input.clientId?.trim() || null,
    method: input.method.toUpperCase(),
    route: input.route,
    status_code: input.statusCode,
    duration_ms: Math.max(0, Math.trunc(input.durationMs)),
    idempotency_key: input.idempotencyKey?.trim() || null,
  });

  if (error) {
    console.warn('[api-keys/request-log] failed to persist request log', {
      route: input.route,
      message: error.message,
    });
  }
}

export async function listApiKeyRequestLogsForLinkedUser(
  linkedUserId: string,
  limit = DEFAULT_LIST_LIMIT,
): Promise<ApiActivityRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const normalizedUserId = linkedUserId.trim();
  if (!normalizedUserId) {
    return [];
  }

  const { data: keys, error: keysError } = await admin
    .from('api_keys')
    .select('id')
    .eq('linked_user_id', normalizedUserId);

  if (keysError) {
    throw new Error(keysError.message);
  }

  const keyIds = (keys ?? []).map((row) => row.id as string).filter(Boolean);
  if (keyIds.length === 0) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await admin
    .from(REQUEST_LOGS_TABLE)
    .select('id, created_at, api_key_id, key_prefix, method, route, status_code, duration_ms, idempotency_key')
    .in('api_key_id', keyIds)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RequestLogDbRow[]).map(mapActivityRow);
}

export async function listApiKeyRequestLogs(limit = DEFAULT_LIST_LIMIT): Promise<ApiActivityRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await admin
    .from(REQUEST_LOGS_TABLE)
    .select('id, created_at, api_key_id, key_prefix, method, route, status_code, duration_ms, idempotency_key')
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RequestLogDbRow[]).map(mapActivityRow);
}

export async function listApiKeyRequestLogsForClient(
  clientId: string,
  limit = DEFAULT_LIST_LIMIT,
): Promise<ApiActivityRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) {
    return [];
  }

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await admin
    .from(REQUEST_LOGS_TABLE)
    .select('id, created_at, api_key_id, key_prefix, method, route, status_code, duration_ms, idempotency_key')
    .eq('client_id', normalizedClientId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RequestLogDbRow[]).map(mapActivityRow);
}
