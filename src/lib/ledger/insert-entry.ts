import { buildOnrampExternalId } from '@/lib/ramp/amount';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { FIAT_LEDGER_ENTRIES_TABLE } from './types';

export async function insertDepositLedgerEntry(input: {
  corpxTxid: string;
  amountBrl: string;
  paidAt?: string;
  endToEndId?: string | null;
  corpxTransactionId?: string | null;
  settlementDedupeKey?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const rampExternalId = input.settlementDedupeKey
    ? buildOnrampExternalId(input.corpxTransactionId ?? undefined, input.settlementDedupeKey)
    : null;

  const { error } = await admin.from(FIAT_LEDGER_ENTRIES_TABLE).upsert(
    {
      created_at: input.paidAt ?? new Date().toISOString(),
      entry_type: 'deposit',
      amount_brl: input.amountBrl,
      status: 'completed',
      source_id: `deposit:${input.corpxTxid}`,
      pix_e2e_id: input.endToEndId?.trim() || null,
      ramp_external_id: rampExternalId,
    },
    { onConflict: 'source_id', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[ledger] insert deposit failed', error.message);
  }
}

export async function insertWithdrawLedgerEntry(input: {
  idempotencyKey: string;
  amountBrl: string;
  e2eId?: string | null;
  beneficiaryName?: string | null;
  rampExternalId?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const key = input.idempotencyKey.trim();
  if (!key) return;

  const { error } = await admin.from(FIAT_LEDGER_ENTRIES_TABLE).upsert(
    {
      entry_type: 'withdraw',
      amount_brl: input.amountBrl,
      status: 'completed',
      source_id: `withdraw:${key}`,
      pix_e2e_id: input.e2eId?.trim() || null,
      beneficiary_name: input.beneficiaryName?.trim() || null,
      ramp_external_id: input.rampExternalId?.trim() || null,
    },
    { onConflict: 'source_id', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[ledger] insert withdraw failed', error.message);
  }
}
