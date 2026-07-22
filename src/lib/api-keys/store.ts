import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { fallbackLegacyClientId, resolveClientIdForAuthUserId } from '@/lib/clients/resolve-client-id';
import { generateApiKeyCredentials, hashApiKeySecret, verifyApiKeySecret } from './crypto';
import type { ApiKeyRow, ApiKeyScope } from './types';

export const API_KEYS_TABLE = 'api_keys';

const API_KEY_COLUMNS =
  'id, label, key_prefix, linked_user_id, client_id, scopes, is_active, revoked_at, last_used_at, spread_bps_override, max_amount_brl, created_at, updated_at, created_by_email';

const SCOPES: ApiKeyScope[] = ['onramp', 'offramp', 'orders:read', 'whitelist:write', 'whitelist:read'];

type ApiKeyDbRow = {
  id: string;
  label: string;
  key_prefix: string;
  linked_user_id: string;
  client_id: string | null;
  scopes: string[] | null;
  is_active: boolean;
  revoked_at: string | null;
  last_used_at: string | null;
  spread_bps_override: number | null;
  max_amount_brl: string | null;
  created_at: string;
  updated_at: string;
  created_by_email: string | null;
};

export type ApiKeyAuthContext = {
  apiKeyId: string;
  keyPrefix: string;
  label: string;
  userId: string;
  clientId: string | null;
  email: string | null;
  scopes: ApiKeyScope[];
  spreadBpsOverride: number | null;
  maxAmountBrl: string | null;
};

function normalizeScopes(value: string[] | null | undefined): ApiKeyScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((scope): scope is ApiKeyScope => SCOPES.includes(scope as ApiKeyScope));
}

function mapRow(row: ApiKeyDbRow, linkedUserEmail: string | null): ApiKeyRow {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.key_prefix,
    linkedUserEmail: linkedUserEmail ?? '—',
    scopes: normalizeScopes(row.scopes),
    isActive: row.is_active,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    spreadBpsOverride: row.spread_bps_override,
    maxAmountBrl: row.max_amount_brl,
  };
}

async function listAuthEmailsByUserId(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    for (const user of data.users) {
      const email = user.email?.trim().toLowerCase();
      if (email && user.id) {
        map.set(user.id, email);
      }
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return map;
}

async function findAuthUserIdByEmail(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const match = data.users.find((user) => user.email?.trim().toLowerCase() === normalized);
    if (match?.id) return match.id;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function listApiKeysForClient(clientId: string): Promise<ApiKeyRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) {
    throw new Error('Client id is required.');
  }

  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .select(API_KEY_COLUMNS)
    .eq('client_id', normalizedClientId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapApiKeyRows((data ?? []) as ApiKeyDbRow[]);
}

export async function assertApiKeyInClient(apiKeyId: string, clientId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .select('client_id')
    .eq('id', apiKeyId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.client_id !== clientId.trim()) {
    throw new Error('API key not found.');
  }
}

async function assertLinkedOperatorInClient(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  userId: string,
  clientId: string,
): Promise<void> {
  const emails = await listAuthEmailsByUserId(admin);
  const email = emails.get(userId);
  if (!email) {
    throw new Error('Linked operator user was not found in Auth.');
  }

  const { data: panelRow, error: panelError } = await admin
    .from('panel_access_list')
    .select('role, is_active, client_id')
    .eq('email', email)
    .maybeSingle();

  if (panelError) {
    throw new Error(panelError.message);
  }

  if (!panelRow?.is_active || panelRow.role !== 'operator') {
    throw new Error('API keys can only be linked to active operator users.');
  }

  if (panelRow.client_id?.trim() !== clientId.trim()) {
    throw new Error('Linked operator does not belong to this client.');
  }
}

async function mapApiKeyRows(rows: ApiKeyDbRow[]): Promise<ApiKeyRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const emailByUserId = await listAuthEmailsByUserId(admin);
  return rows.map((row) => mapRow(row, emailByUserId.get(row.linked_user_id) ?? null));
}

export async function assertApiKeyOwnedByUser(apiKeyId: string, userId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .select('linked_user_id')
    .eq('id', apiKeyId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.linked_user_id !== userId) {
    throw new Error('API key not found.');
  }
}

export async function findApiKeyById(apiKeyId: string): Promise<ApiKeyRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .select(API_KEY_COLUMNS)
    .eq('id', apiKeyId.trim())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;
  const rows = await mapApiKeyRows([data as ApiKeyDbRow]);
  return rows[0] ?? null;
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .select(API_KEY_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapApiKeyRows((data ?? []) as ApiKeyDbRow[]);
}

export async function listApiKeysForLinkedUser(linkedUserId: string): Promise<ApiKeyRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const normalizedUserId = linkedUserId.trim();
  if (!normalizedUserId) {
    throw new Error('Linked user id is required.');
  }

  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .select(API_KEY_COLUMNS)
    .eq('linked_user_id', normalizedUserId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapApiKeyRows((data ?? []) as ApiKeyDbRow[]);
}

export async function createApiKey(input: {
  label: string;
  linkedUserId?: string;
  linkedUserEmail?: string;
  scopes: ApiKeyScope[];
  createdByEmail: string;
  spreadBpsOverride?: number | null;
  maxAmountBrl?: string | null;
  expectedClientId?: string | null;
}): Promise<{ row: ApiKeyRow; secret: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const label = input.label.trim();
  if (!label) {
    throw new Error('API key label is required.');
  }

  const scopes = normalizeScopes(input.scopes);
  if (scopes.length === 0) {
    throw new Error('At least one scope is required.');
  }

  const linkedUserId =
    input.linkedUserId?.trim() ||
    (input.linkedUserEmail ? await findAuthUserIdByEmail(admin, input.linkedUserEmail) : null);
  if (!linkedUserId) {
    throw new Error('Linked operator user was not found in Auth.');
  }

  const expectedClientId = input.expectedClientId?.trim() || null;
  if (expectedClientId) {
    await assertLinkedOperatorInClient(admin, linkedUserId, expectedClientId);
  } else {
    const emails = await listAuthEmailsByUserId(admin);
    const email = emails.get(linkedUserId);
    if (!email) {
      throw new Error('Linked operator user was not found in Auth.');
    }

    const { data: panelRow, error: panelError } = await admin
      .from('panel_access_list')
      .select('role, is_active')
      .eq('email', email)
      .maybeSingle();

    if (panelError) {
      throw new Error(panelError.message);
    }

    if (!panelRow?.is_active) {
      throw new Error('Linked operator is inactive in panel access list.');
    }

    if (panelRow.role !== 'operator' && panelRow.role !== 'admin') {
      throw new Error('API keys can only be linked to operator or admin users.');
    }
  }

  const clientId = expectedClientId ?? fallbackLegacyClientId(await resolveClientIdForAuthUserId(admin, linkedUserId));
  if (!clientId) {
    throw new Error('Linked operator is not assigned to a client.');
  }

  const credentials = generateApiKeyCredentials();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .insert({
      label,
      key_prefix: credentials.keyPrefix,
      secret_hash: credentials.secretHash,
      linked_user_id: linkedUserId,
      client_id: clientId,
      scopes,
      spread_bps_override: input.spreadBpsOverride ?? null,
      max_amount_brl: input.maxAmountBrl?.trim() || null,
      is_active: true,
      created_by_email: input.createdByEmail.trim().toLowerCase(),
      created_at: now,
      updated_at: now,
    })
    .select(API_KEY_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const rows = await mapApiKeyRows([data as ApiKeyDbRow]);
  return {
    row: rows[0]!,
    secret: credentials.secret,
  };
}

export async function revokeApiKey(apiKeyId: string): Promise<ApiKeyRow> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .update({
      is_active: false,
      revoked_at: now,
      updated_at: now,
    })
    .eq('id', apiKeyId)
    .select(API_KEY_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const rows = await mapApiKeyRows([data as ApiKeyDbRow]);
  return rows[0]!;
}

export async function authenticateApiKeySecret(secret: string): Promise<ApiKeyAuthContext | null> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const secretHash = hashApiKeySecret(secret);
  const { data, error } = await admin
    .from(API_KEYS_TABLE)
    .select('id, label, key_prefix, linked_user_id, client_id, scopes, is_active, spread_bps_override, max_amount_brl')
    .eq('secret_hash', secretHash)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as Pick<
    ApiKeyDbRow,
    | 'id'
    | 'label'
    | 'key_prefix'
    | 'linked_user_id'
    | 'client_id'
    | 'scopes'
    | 'is_active'
    | 'spread_bps_override'
    | 'max_amount_brl'
  >;
  if (!row.is_active) {
    return null;
  }

  const emails = await listAuthEmailsByUserId(admin);
  const now = new Date().toISOString();
  await admin.from(API_KEYS_TABLE).update({ last_used_at: now, updated_at: now }).eq('id', row.id);

  return {
    apiKeyId: row.id,
    keyPrefix: row.key_prefix,
    label: row.label,
    userId: row.linked_user_id,
    clientId: row.client_id,
    email: emails.get(row.linked_user_id) ?? null,
    scopes: normalizeScopes(row.scopes),
    spreadBpsOverride: row.spread_bps_override,
    maxAmountBrl: row.max_amount_brl,
  };
}

export function apiKeyHasScope(ctx: ApiKeyAuthContext, scope: ApiKeyScope): boolean {
  return ctx.scopes.includes(scope);
}

export { verifyApiKeySecret };
