export type CorpXPIXKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export type CashOutTransactionStatus =
  | 'pending'
  | 'processing'
  | 'submitted'
  | 'completed'
  | 'failed'
  | 'requires_reconciliation';

export type DynamicPIXRequest = {
  /** Decimal string e.g. "150.75" (max 2 fractional digits). */
  amount: string;
  expiresAt: Date;
  /** Maps to CorpX `identifier` (charge id). */
  correlationId: string;
  description?: string;
  idempotencyKey: string;
};

export type StaticPIXRequest = {
  /** Used as CorpX `identifier` (matches Go adapter). */
  idempotencyKey: string;
  description?: string;
};

/** Query params for GET /v1/accounts/{id}/statement (CorpX examples / integrator guide). */
export type StatementQuery = {
  page?: number;
  size?: number;
  limit?: number;
  order?: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
};

export type PIXResponse = {
  providerTxId: string;
  qrCode: string;
  pixKey: string;
  amount: string;
  /** ISO 8601 or null when not applicable (static). */
  expiresAt: string | null;
  status: string;
};

export type PIXCashOutRequest = {
  amount: string;
  pixKeyType: CorpXPIXKeyType;
  pixKey: string;
  description?: string;
  correlationId?: string;
  idempotencyKey: string;
};

export type PIXCashOutResponse = {
  providerTxId: string;
  e2eId: string;
  status: CashOutTransactionStatus;
  amount: string;
  fee: string;
};

export type DecodedPaymentQr = {
  amountBrl: string | null;
  pixKey: string | null;
  beneficiaryName: string | null;
  allowChange: boolean;
};

export type PayPaymentQrRequest = {
  emv: string;
  /** Sent to CorpX only when the EMV has no fixed amount (static QR). */
  amount?: string;
  /**
   * Never sent upstream. Used to map a 2xx CorpX body that omits `amount`
   * (Binance fiat QRs embed tag 54, so treasury omits `amount` on purpose).
   */
  amountHint?: string;
  description?: string;
  idempotencyKey: string;
  correlationId?: string;
};

/**
 * Domain transfer — CorpX only exposes PIX out; {@link CorpXPixAdapter.initiateTransfer} delegates to cash out.
 * Matches Go `TransferRequest`: `CreditAccountID` is the destination PIX key (EVP in the Go wiring).
 */
export type TransferRequest = {
  idempotencyKey: string;
  /** Must equal the adapter's configured CorpX account id (`CORPX_ACCOUNT_ID`). */
  debitAccountId: string;
  /** Destination PIX key (Go used EVP + UUID here). */
  creditAccountId: string;
  amount: string;
  description?: string;
  correlationId?: string;
};

export type TransferResponse = {
  providerTxId: string;
  e2eId: string;
  status: CashOutTransactionStatus;
  amount: string;
  fee: string;
  completedAt?: string;
  errorCode?: string;
  errorMessage?: string;
};

export type TransferStatus = {
  providerTxId: string;
  e2eId: string;
  status: CashOutTransactionStatus;
  /** ISO 8601 from CorpX `transactionDate`. */
  updatedAt: string;
  description?: string;
};

/**
 * CorpX does not support TED; kept for parity with Go `financialprovider.TEDRequest`.
 * Shape is intentionally loose until you align with your domain types.
 */
export type TEDRequest = Record<string, unknown>;
