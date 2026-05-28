import '@/lib/server/only';

export const OFFRAMP_FAILURE_CODES = {
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  DEPOSIT_TIMEOUT: 'DEPOSIT_TIMEOUT',
  INVALID_DEPOSIT_AMOUNT: 'INVALID_DEPOSIT_AMOUNT',
  USDC_DEPOSIT_SUBMIT_FAILED: 'USDC_DEPOSIT_SUBMIT_FAILED',
  USDC_DEPOSIT_CALLBACK_FAILED: 'USDC_DEPOSIT_CALLBACK_FAILED',
  PIX_PAYOUT_SUBMIT_FAILED: 'PIX_PAYOUT_SUBMIT_FAILED',
  PIX_PAYOUT_FAILED: 'PIX_PAYOUT_FAILED',
  BRH_RECORD_FAILED: 'BRH_RECORD_FAILED',
  FX_TRADE_FAILED: 'FX_TRADE_FAILED',
  RECONCILIATION_FAILED: 'RECONCILIATION_FAILED',
} as const;

export type OfframpFailureCode = (typeof OFFRAMP_FAILURE_CODES)[keyof typeof OFFRAMP_FAILURE_CODES];

export function buildOfframpFailurePatch(input: {
  code: OfframpFailureCode;
  reason: string;
  needsReview?: boolean;
}) {
  return {
    failure_code: input.code,
    failure_reason: input.reason,
    needs_review_reason: input.needsReview === false ? null : input.reason,
  } as const;
}

export function clearOfframpFailurePatch() {
  return {
    failure_code: null,
    failure_reason: null,
    needs_review_reason: null,
  } as const;
}
