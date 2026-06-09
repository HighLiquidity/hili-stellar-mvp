import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

const IDEMPOTENCY_TABLE = 'api_idempotency_records';
const DEFAULT_TTL_SECONDS = 86_400;

export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get('idempotency-key')?.trim();
  if (!raw) return null;
  if (raw.length > 128) return null;
  return raw;
}

function getIdempotencyTtlSeconds(): number {
  const raw = process.env.API_KEY_IDEMPOTENCY_TTL_SECONDS?.trim();
  if (!raw) return DEFAULT_TTL_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
}

export async function findIdempotentResponse(input: {
  apiKeyId: string;
  route: string;
  idempotencyKey: string;
}): Promise<{ statusCode: number; body: unknown } | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(IDEMPOTENCY_TABLE)
    .select('status_code, response_body, expires_at')
    .eq('api_key_id', input.apiKeyId)
    .eq('route', input.route)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { status_code: number; response_body: unknown; expires_at: string };
  if (row.expires_at <= now) {
    await admin
      .from(IDEMPOTENCY_TABLE)
      .delete()
      .eq('api_key_id', input.apiKeyId)
      .eq('route', input.route)
      .eq('idempotency_key', input.idempotencyKey);
    return null;
  }

  return {
    statusCode: row.status_code,
    body: row.response_body,
  };
}

export async function saveIdempotentResponse(input: {
  apiKeyId: string;
  route: string;
  idempotencyKey: string;
  statusCode: number;
  body: unknown;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const ttlSeconds = getIdempotencyTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const now = new Date().toISOString();

  const { error } = await admin.from(IDEMPOTENCY_TABLE).upsert(
    {
      api_key_id: input.apiKeyId,
      route: input.route,
      idempotency_key: input.idempotencyKey,
      status_code: input.statusCode,
      response_body: input.body,
      created_at: now,
      expires_at: expiresAt,
    },
    { onConflict: 'api_key_id,route,idempotency_key' },
  );

  if (error) {
    console.warn('[api-keys/idempotency] failed to persist replay cache', {
      route: input.route,
      message: error.message,
    });
  }
}
