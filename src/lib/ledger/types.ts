export type LedgerEntryType = 'deposit' | 'withdraw';

export type FiatLedgerEntryRow = {
  id: string;
  created_at: string;
  entry_type: LedgerEntryType;
  amount_brl: string;
  status: 'completed';
  source_id: string;
  pix_e2e_id: string | null;
  ramp_external_id: string | null;
  beneficiary_name: string | null;
};

/** View model for UI (includes on-chain hash from ramp_operations when linked). */
export type LedgerTransaction = {
  id: string;
  type: LedgerEntryType;
  amountBrl: string;
  createdAt: string;
  pixE2eId: string | null;
  txHash: string | null;
  beneficiaryName: string | null;
};

export const FIAT_LEDGER_ENTRIES_TABLE = 'fiat_ledger_entries';
