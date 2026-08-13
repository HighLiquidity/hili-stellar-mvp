export const DEPOSIT_LEDGER_SOURCE_PREFIX = 'deposit:';

export function corpxTxidFromDepositSourceId(sourceId: string): string | null {
  if (!sourceId.startsWith(DEPOSIT_LEDGER_SOURCE_PREFIX)) return null;
  const txid = sourceId.slice(DEPOSIT_LEDGER_SOURCE_PREFIX.length).trim();
  return txid || null;
}

/**
 * Legacy ledger deposits are customer liability only when the charge was issued by the
 * product (tax_id on the pending QR). Treasury upserts have no tax_id.
 */
export function filterCustomerLedgerDeposits<T extends { entry_type: string; source_id: string }>(
  rows: T[],
  customerChargeTxids: ReadonlySet<string>,
): T[] {
  return rows.filter((row) => {
    if (row.entry_type !== 'deposit') return true;
    const txid = corpxTxidFromDepositSourceId(row.source_id);
    if (!txid) return false;
    return customerChargeTxids.has(txid);
  });
}
