import '@/lib/server/only';

import { LEGACY_CLIENT_ID } from '@/lib/clients/constants';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { ClientComplianceRow, KycStatus, KybStatus } from './compliance-types';

export const COMPLIANCE_TABLE = 'client_compliance_profiles';
const COMPLIANCE_COLUMNS =
  'client_id, kyb_status, kyc_status, submitted_at, reviewed_at, reviewed_by_email, rejection_reason, notes, created_at, updated_at';

const DEFAULT_KYB_STATUS: KybStatus = 'not_started';
const DEFAULT_KYC_STATUS: KycStatus = 'not_started';

export function defaultComplianceForNewClient(clientId: string): {
  kyb_status: KybStatus;
  kyc_status: KycStatus;
} {
  if (clientId === LEGACY_CLIENT_ID) {
    return { kyb_status: 'approved', kyc_status: 'not_applicable' };
  }
  return { kyb_status: DEFAULT_KYB_STATUS, kyc_status: DEFAULT_KYC_STATUS };
}

export async function ensureClientComplianceProfile(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  clientId: string,
): Promise<ClientComplianceRow> {
  const id = clientId.trim();
  const existing = await loadClientComplianceProfileByClientId(admin, id);
  if (existing) return existing;

  const defaults = defaultComplianceForNewClient(id);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(COMPLIANCE_TABLE)
    .insert({
      client_id: id,
      ...defaults,
      updated_at: now,
    })
    .select(COMPLIANCE_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ClientComplianceRow;
}

export async function loadClientComplianceProfileByClientId(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  clientId: string,
): Promise<ClientComplianceRow | null> {
  const id = clientId.trim();
  if (!id) return null;

  const { data, error } = await admin
    .from(COMPLIANCE_TABLE)
    .select(COMPLIANCE_COLUMNS)
    .eq('client_id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ClientComplianceRow | null) ?? null;
}

export async function loadComplianceByClientIds(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  clientIds: string[],
): Promise<Map<string, ClientComplianceRow>> {
  const ids = Array.from(new Set(clientIds.map((id) => id.trim()).filter(Boolean)));
  const map = new Map<string, ClientComplianceRow>();
  if (ids.length === 0) return map;

  const { data, error } = await admin.from(COMPLIANCE_TABLE).select(COMPLIANCE_COLUMNS).in('client_id', ids);
  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as ClientComplianceRow[]) {
    map.set(row.client_id, row);
  }

  return map;
}
