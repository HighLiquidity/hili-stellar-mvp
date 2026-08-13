export type FiatOperationKind = 'fiat_deposit' | 'fiat_withdraw' | 'fiat_onramp' | 'treasury_transfer';

export type FiatOperationStatus = 'success' | 'error';

export type FiatOperationActor = {
  email?: string | null;
  userId?: string | null;
};

export type FiatOperationEventInsert = {
  operation: FiatOperationKind;
  /** e.g. qr_generate | withdraw_submit */
  phase: string;
  status: FiatOperationStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  actorEmail?: string | null;
  actorUserId?: string | null;
  taxId?: string | null;
  amountBrl?: string | null;
  providerTxId?: string | null;
  e2eId?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  beneficiaryName?: string | null;
  stage?: string | null;
  brhBalanceBefore?: string | null;
  metadata?: Record<string, unknown>;
};
