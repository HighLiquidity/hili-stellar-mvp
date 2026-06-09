import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { ApiRateLimitError } from './errors';

const REQUEST_LOGS_TABLE = 'api_key_request_logs';
const DEFAULT_LIMIT_PER_MINUTE = 60;
const WINDOW_MS = 60_000;

function getRateLimitPerMinute(): number {
  const raw = process.env.API_KEY_RATE_LIMIT_PER_MINUTE?.trim();
  if (!raw) return DEFAULT_LIMIT_PER_MINUTE;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_PER_MINUTE;
}

export async function assertApiKeyRateLimit(apiKeyId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from(REQUEST_LOGS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', since);

  if (error) {
    throw new Error(error.message);
  }

  const limit = getRateLimitPerMinute();
  if ((count ?? 0) >= limit) {
    throw new ApiRateLimitError(`Rate limit exceeded (${limit} requests per minute).`);
  }
}
