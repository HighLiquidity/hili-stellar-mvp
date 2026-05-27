export type OnrampOrderStatus =
  | 'quoted'
  | 'awaiting_pix'
  | 'pix_received'
  | 'brh_sold'
  | 'usdc_delivered'
  | 'fx_settled'
  | 'brh_redeemed'
  | 'complete'
  | 'expired'
  | 'failed'
  | 'refunded'
  | 'needs_review';

export type OnrampQuoteView = {
  symbol: string;
  side: 'BUY' | 'SELL';
  amountBrl: string;
  amountUsdc: string;
  rate: string | null;
  expiresAt: string;
};

export type OnrampDestinationView = {
  address: string;
  memo: string | null;
};

export type OnrampPixView = {
  txid: string;
  copyPaste: string;
  qrDataUrl: string;
  expiresAt: string | null;
  paidAt?: string | null;
};

export type OnrampQuoteResponse = {
  orderId: string;
  status: 'quoted';
  quote: OnrampQuoteView;
  destination: OnrampDestinationView;
};

export type OnrampLockResponse = {
  orderId: string;
  status: 'awaiting_pix';
  quote: OnrampQuoteView;
  pix: OnrampPixView;
  destination: OnrampDestinationView;
};

export type OnrampOrderResponse = {
  orderId: string;
  status: OnrampOrderStatus;
  quote: OnrampQuoteView;
  destination: OnrampDestinationView;
  pix: (OnrampPixView & { paidAt: string | null }) | null;
  timeline: {
    quotedAt: string;
    pixReceivedAt: string | null;
    brhSoldAt: string | null;
    usdcDeliveredAt: string | null;
    fxSettledAt: string | null;
    brhRedeemedAt: string | null;
    completeAt: string | null;
    expiredAt: string | null;
    refundedAt: string | null;
  };
  references: {
    brhSaleExternalId: string | null;
    usdcDeliveryExternalId: string | null;
    binanceClientOrderId: string | null;
    binanceWithdrawOrderId: string | null;
    deliveryTxHash: string | null;
  };
  failure: {
    code: string | null;
    reason: string | null;
    needsReviewReason: string | null;
  } | null;
};
