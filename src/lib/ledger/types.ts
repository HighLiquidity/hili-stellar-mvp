export type LedgerEntryType = 'deposit' | 'withdraw';

/** Origin of a statement line (legacy fiat ledger vs ramp orders). */
export type LedgerTransactionKind = 'ledger' | 'onramp' | 'offramp';

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
  kind: LedgerTransactionKind;
  type: LedgerEntryType;
  amountBrl: string;
  createdAt: string;
  pixE2eId: string | null;
  txHash: string | null;
  beneficiaryName: string | null;
  /** Secondary line (e.g. USDC amount on ramp orders). */
  detail: string | null;
};

