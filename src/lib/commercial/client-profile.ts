import '@/lib/server/only';

import type { ClientStatus } from '@/lib/clients/types';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { CommercialProfileSource } from './types';
import { EMPTY_COMMERCIAL_PROFILE_SOURCE } from './types';

const CLIENTS_TABLE = 'clients';
const PANEL_ACCESS_TABLE = 'panel_access_list';
const COMMERCIAL_COLUMNS = 'id, status, spread_bps_override, max_amount_brl';

export type ClientCommercialRecord = CommercialProfileSource & {
  clientId: string;
  status: ClientStatus;
};

export async function loadClientCommercialRecordById(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  clientId: string,
): Promise<ClientCommercialRecord | null> {
  const id = clientId.trim();
  if (!id) return null;

  const { data, error } = await admin
    .from(CLIENTS_TABLE)
    .select(COMMERCIAL_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const row = data as {
    id: string;
    status: ClientStatus;
    spread_bps_override: number | null;
    max_amount_brl: string | null;
  };

  return {
    clientId: row.id,
    status: row.status,
    spreadBpsOverride: row.spread_bps_override,
    maxAmountBrl: row.max_amount_brl,
  };
}

export async function loadClientCommercialRecordByUserEmail(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  email: string,
): Promise<ClientCommercialRecord | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await admin
    .from(PANEL_ACCESS_TABLE)
    .select('client_id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const clientId = (data as { client_id: string | null } | null)?.client_id;
  if (!clientId) return null;

  return loadClientCommercialRecordById(admin, clientId);
}

export function toCommercialProfileSource(
  record: ClientCommercialRecord | null,
): CommercialProfileSource | null {
  if (!record) return null;

  return {
    spreadBpsOverride: record.spreadBpsOverride ?? EMPTY_COMMERCIAL_PROFILE_SOURCE.spreadBpsOverride,
    maxAmountBrl: record.maxAmountBrl ?? EMPTY_COMMERCIAL_PROFILE_SOURCE.maxAmountBrl,
  };
}
