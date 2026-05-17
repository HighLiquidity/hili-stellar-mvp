import type { FiatLedgerEntryRow, LedgerTransaction } from './types';

export function mapLedgerRowsToTransactions(
  entries: FiatLedgerEntryRow[],
  rampByExternalId: Map<string, string | null>,
): LedgerTransaction[] {
  return entries.map((row) => ({
    id: row.id,
    type: row.entry_type,
    amountBrl: row.amount_brl,
    createdAt: row.created_at,
    pixE2eId: row.pix_e2e_id,
    txHash: row.ramp_external_id ? (rampByExternalId.get(row.ramp_external_id) ?? null) : null,
    beneficiaryName: row.beneficiary_name,
  }));
}
