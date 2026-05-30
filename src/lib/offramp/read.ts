import '@/lib/server/only';

import type { OfframpOrderResponse } from './contracts';
import { OfframpOperationError } from './errors';
import { findOfframpOrderById } from './order-store';

export async function readOfframpOrder(orderId: string): Promise<OfframpOrderResponse> {
  const row = await findOfframpOrderById(orderId);
  if (!row) {
    throw new OfframpOperationError('Order not found', 404);
  }

  return {
    orderId: row.id,
    status: row.status,
    quote: {
      symbol: row.quote_symbol,
      side: row.quote_side,
      amountUsdc: row.amount_usdc,
      amountBrl: row.amount_brl,
      rate: row.quote_rate,
      expiresAt: row.quote_expires_at,
    },
    payout: {
      key: row.payout_pix_key,
      beneficiaryName: row.payout_beneficiary_name,
      providerTxId: row.payout_provider_tx_id,
      endToEndId: row.payout_end_to_end_id,
    },
    deposit: row.usdc_deposit_external_id
      ? {
          externalId: row.usdc_deposit_external_id,
          rampOperationId: row.usdc_deposit_ramp_operation_id,
          address: row.usdc_deposit_address ?? '',
          memo: row.usdc_deposit_memo,
          expiresAt: row.usdc_deposit_expires_at,
          receivedAmount: row.usdc_received_amount,
          txHash: row.usdc_received_tx_hash,
        }
      : null,
    timeline: {
      quotedAt: row.quoted_at,
      usdcReceivedAt: row.usdc_received_at,
      pixSentAt: row.pix_sent_at,
      brhRecordedAt: row.brh_recorded_at,
      fxSettledAt: row.fx_settled_at,
      completeAt: row.complete_at,
      expiredAt: row.expired_at,
      refundedAt: row.refunded_at,
    },
    references: {
      brhIssueExternalId: row.brh_issue_external_id,
      brhRedemptionExternalId: row.brh_redemption_external_id,
      binanceClientOrderId: row.binance_client_order_id,
    },
    failure:
      row.failure_code || row.failure_reason || row.needs_review_reason
        ? {
            code: row.failure_code,
            reason: row.failure_reason,
            needsReviewReason: row.needs_review_reason,
          }
        : null,
  };
}
