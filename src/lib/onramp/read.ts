import '@/lib/server/only';

import QRCode from 'qrcode';

import { OnrampOperationError } from './errors';
import type { OnrampFailureCode } from './failure-codes';
import { findOnrampOrderById, type OnrampOrderRow, type OnrampOrderStatus } from './order-store';

export type OnrampOrderResponse = {
  orderId: string;
  status: OnrampOrderStatus;
  quote: {
    symbol: string;
    side: 'BUY' | 'SELL';
    amountBrl: string;
    amountUsdc: string;
    rate: string | null;
    expiresAt: string;
  };
  destination: {
    address: string;
    memo: string | null;
  };
  pix: {
    txid: string;
    copyPaste: string;
    qrDataUrl: string;
    expiresAt: string | null;
    paidAt: string | null;
  } | null;
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
    code: OnrampFailureCode | null;
    reason: string | null;
    needsReviewReason: string | null;
  } | null;
};

const QR_DATA_URL_CACHE_MAX = 64;
const qrDataUrlCache = new Map<string, string>();

async function toQrDataUrl(copyPaste: string): Promise<string> {
  const cached = qrDataUrlCache.get(copyPaste);
  if (cached) {
    return cached;
  }

  const dataUrl = await QRCode.toDataURL(copyPaste, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  if (qrDataUrlCache.size >= QR_DATA_URL_CACHE_MAX) {
    const oldestKey = qrDataUrlCache.keys().next().value;
    if (oldestKey) {
      qrDataUrlCache.delete(oldestKey);
    }
  }

  qrDataUrlCache.set(copyPaste, dataUrl);
  return dataUrl;
}

function buildFailureView(row: OnrampOrderRow): OnrampOrderResponse['failure'] {
  if (!row.failure_code && !row.failure_reason && !row.needs_review_reason) {
    return null;
  }

  return {
    code: row.failure_code,
    reason: row.failure_reason,
    needsReviewReason: row.needs_review_reason,
  };
}

async function buildPixView(row: OnrampOrderRow): Promise<OnrampOrderResponse['pix']> {
  if (!row.corpx_txid || !row.pix_copy_paste) {
    return null;
  }

  return {
    txid: row.corpx_txid,
    copyPaste: row.pix_copy_paste,
    qrDataUrl: await toQrDataUrl(row.pix_copy_paste),
    expiresAt: row.corpx_expires_at,
    paidAt: row.pix_received_at,
  };
}

export async function buildOnrampOrderResponse(row: OnrampOrderRow): Promise<OnrampOrderResponse> {
  return {
    orderId: row.id,
    status: row.status,
    quote: {
      symbol: row.quote_symbol,
      side: row.quote_side,
      amountBrl: row.amount_brl,
      amountUsdc: row.amount_usdc,
      rate: row.quote_rate,
      expiresAt: row.quote_expires_at,
    },
    destination: {
      address: row.destination_address,
      memo: row.destination_memo,
    },
    pix: await buildPixView(row),
    timeline: {
      quotedAt: row.quoted_at,
      pixReceivedAt: row.pix_received_at,
      brhSoldAt: row.brh_sold_at,
      usdcDeliveredAt: row.usdc_delivered_at,
      fxSettledAt: row.fx_settled_at,
      brhRedeemedAt: row.brh_redeemed_at,
      completeAt: row.complete_at,
      expiredAt: row.expired_at,
      refundedAt: row.refunded_at,
    },
    references: {
      brhSaleExternalId: row.brh_sale_external_id,
      usdcDeliveryExternalId: row.usdc_delivery_external_id,
      binanceClientOrderId: row.binance_client_order_id,
      binanceWithdrawOrderId: row.binance_withdraw_order_id,
      deliveryTxHash: row.usdc_delivery_tx_hash,
    },
    failure: buildFailureView(row),
  };
}

export async function getOnrampOrder(orderId: string): Promise<OnrampOrderResponse> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new OnrampOperationError('On-ramp order id is required.', 400);
  }

  const row = await findOnrampOrderById(normalizedOrderId);
  if (!row) {
    throw new OnrampOperationError('On-ramp order not found.', 404);
  }

  return buildOnrampOrderResponse(row);
}
