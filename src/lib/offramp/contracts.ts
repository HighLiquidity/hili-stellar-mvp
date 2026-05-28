export type OfframpOrderStatus =
  | 'quoted'
  | 'awaiting_deposit'
  | 'usdc_received'
  | 'pix_sent'
  | 'brh_recorded'
  | 'fx_settled'
  | 'complete'
  | 'expired'
  | 'failed'
  | 'refunded'
  | 'needs_review';

export type OfframpQuoteView = {
  symbol: string;
  side: 'BUY' | 'SELL';
  amountUsdc: string;
  amountBrl: string;
  rate: string | null;
  expiresAt: string;
};

export type OfframpPixView = {
  key: string;
  beneficiaryName: string | null;
};

export type OfframpDepositInstructionsView = {
  externalId: string;
  address: string;
  memo: string | null;
};

export type OfframpQuoteResponse = {
  orderId: string;
  status: 'quoted';
  quote: OfframpQuoteView;
  payout: OfframpPixView;
};

export type OfframpLockResponse = {
  orderId: string;
  status: 'awaiting_deposit';
  quote: OfframpQuoteView;
  payout: OfframpPixView;
  deposit: OfframpDepositInstructionsView;
};

export type OfframpOrderResponse = {
  orderId: string;
  status: OfframpOrderStatus;
  quote: OfframpQuoteView;
  payout: OfframpPixView & {
    providerTxId: string | null;
    endToEndId: string | null;
  };
  deposit: (OfframpDepositInstructionsView & {
    rampOperationId: string | null;
    receivedAmount: string | null;
    txHash: string | null;
  }) | null;
  timeline: {
    quotedAt: string;
    usdcReceivedAt: string | null;
    pixSentAt: string | null;
    brhRecordedAt: string | null;
    fxSettledAt: string | null;
    completeAt: string | null;
    expiredAt: string | null;
    refundedAt: string | null;
  };
  references: {
    brhIssueExternalId: string | null;
    brhRedemptionExternalId: string | null;
    binanceClientOrderId: string | null;
  };
  failure: {
    code: string | null;
    reason: string | null;
    needsReviewReason: string | null;
  } | null;
};
