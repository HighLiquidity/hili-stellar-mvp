import { createSupabaseAdmin } from '@/lib/supabase/admin';

export const FIAT_DEPOSIT_CHARGES_TABLE = 'fiat_deposit_charges';

export type FiatDepositChargeStatus = 'pending' | 'paid' | 'failed';

export type FiatDepositChargeRow = {
  corpx_txid: string;
  amount_brl: string;
  tax_id: string | null;
  identifier: string | null;
  status: FiatDepositChargeStatus;
  paid_at: string | null;
  corpx_event_type: string | null;
  corpx_transaction_id: string | null;
  end_to_end_id: string | null;
  settlement_dedupe_key: string | null;
  created_at: string;
  updated_at: string;
};

export async function registerPendingDepositCharge(input: {
  corpxTxid: string;
  amountBrl: string;
  taxId?: string | null;
  identifier?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    console.warn('[deposit/charge] SUPABASE_SERVICE_ROLE_KEY missing — skip register charge');
    return;
  }

  const now = new Date().toISOString();
  const { error } = await admin.from(FIAT_DEPOSIT_CHARGES_TABLE).upsert(
    {
      corpx_txid: input.corpxTxid,
      amount_brl: input.amountBrl,
      tax_id: input.taxId?.trim() || null,
      identifier: input.identifier?.trim() || null,
      status: 'pending',
      updated_at: now,
    },
    { onConflict: 'corpx_txid', ignoreDuplicates: false },
  );

  if (error) {
    console.error('[deposit/charge] register pending failed', error.message);
  }
}

export async function findDepositChargeByTxid(corpxTxid: string): Promise<FiatDepositChargeRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(FIAT_DEPOSIT_CHARGES_TABLE)
    .select('*')
    .eq('corpx_txid', corpxTxid)
    .maybeSingle();

  if (error) {
    console.error('[deposit/charge] find failed', error.message);
    return null;
  }

  return (data as FiatDepositChargeRow | null) ?? null;
}

export async function markDepositChargePaid(input: {
  corpxTxid: string;
  amountBrl: string;
  corpxEventType: string;
  corpxTransactionId?: string | null;
  endToEndId?: string | null;
  settlementDedupeKey: string;
}): Promise<{ ok: true; alreadyPaid: boolean } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };
  }

  const existing = await findDepositChargeByTxid(input.corpxTxid);
  if (existing?.status === 'paid') {
    return { ok: true, alreadyPaid: true };
  }

  const now = new Date().toISOString();
  const { error } = await admin.from(FIAT_DEPOSIT_CHARGES_TABLE).upsert(
    {
      corpx_txid: input.corpxTxid,
      amount_brl: input.amountBrl,
      status: 'paid',
      paid_at: now,
      corpx_event_type: input.corpxEventType,
      corpx_transaction_id: input.corpxTransactionId ?? null,
      end_to_end_id: input.endToEndId ?? null,
      settlement_dedupe_key: input.settlementDedupeKey,
      updated_at: now,
    },
    { onConflict: 'corpx_txid' },
  );

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true, alreadyPaid: false };
}
