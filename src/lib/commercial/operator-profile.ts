import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { OperatorCommercialProfile } from './types';
import { EMPTY_OPERATOR_COMMERCIAL_PROFILE } from './types';

const PANEL_ACCESS_TABLE = 'panel_access_list';
const COMMERCIAL_COLUMNS = 'spread_bps_override, max_amount_brl, role';

type CommercialRow = {
  spread_bps_override: number | null;
  max_amount_brl: string | null;
  role: string;
};

function mapCommercialRow(row: CommercialRow | null): OperatorCommercialProfile {
  if (!row || row.role !== 'operator') {
    return EMPTY_OPERATOR_COMMERCIAL_PROFILE;
  }

  return {
    spreadBpsOverride: row.spread_bps_override,
    maxAmountBrl: row.max_amount_brl,
  };
}

export async function loadOperatorCommercialProfileByEmail(
  admin: NonNullable<ReturnType<typeof createSupabaseAdmin>>,
  email: string,
): Promise<OperatorCommercialProfile> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return EMPTY_OPERATOR_COMMERCIAL_PROFILE;
  }

  const { data, error } = await admin
    .from(PANEL_ACCESS_TABLE)
    .select(COMMERCIAL_COLUMNS)
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapCommercialRow((data as CommercialRow | null) ?? null);
}
