import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { RAMP_OPERATIONS_TABLE } from '@/lib/ramp/operation-store';

import { mapLedgerRowsToTransactions } from './map-entries';
import type { FiatLedgerEntryRow, LedgerTransaction } from './types';
import { FIAT_LEDGER_ENTRIES_TABLE } from './types';

/** Server-side fetch (service role) for API routes or actions. */
export async function fetchLedgerTransactionsAdmin(limit: number): Promise<LedgerTransaction[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const capped = Math.min(Math.max(limit, 1), 200);

  const { data: entries, error } = await admin
    .from(FIAT_LEDGER_ENTRIES_TABLE)
    .select(
      'id, created_at, entry_type, amount_brl, status, source_id, pix_e2e_id, ramp_external_id, beneficiary_name',
    )
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(capped);

  if (error || !entries?.length) {
    if (error) console.error('[ledger] fetch entries failed', error.message);
    return [];
  }

  const rows = entries as FiatLedgerEntryRow[];
  const externalIds = [
    ...new Set(rows.map((r) => r.ramp_external_id).filter((id): id is string => Boolean(id?.trim()))),
  ];

  const rampByExternalId = new Map<string, string | null>();
  if (externalIds.length > 0) {
    const { data: rampRows, error: rampError } = await admin
      .from(RAMP_OPERATIONS_TABLE)
      .select('external_id, tx_hash')
      .in('external_id', externalIds);

    if (rampError) {
      console.error('[ledger] fetch ramp tx_hash failed', rampError.message);
    } else {
      for (const r of rampRows ?? []) {
        const ext = (r as { external_id: string; tx_hash: string | null }).external_id;
        const hash = (r as { external_id: string; tx_hash: string | null }).tx_hash;
        rampByExternalId.set(ext, hash?.trim() || null);
      }
    }
  }

  return mapLedgerRowsToTransactions(rows, rampByExternalId);
}

export function sumLedgerVolumes(transactions: LedgerTransaction[]): {
  incomingBrl: number;
  outgoingBrl: number;
} {
  let incomingBrl = 0;
  let outgoingBrl = 0;

  for (const tx of transactions) {
    const n = Number(tx.amountBrl.replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    if (tx.type === 'deposit') incomingBrl += n;
    else outgoingBrl += n;
  }

  return { incomingBrl, outgoingBrl };
}
