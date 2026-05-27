import type { WebhookProcessingResult } from '@/lib/corpx/webhooks/types';
import { incrementBrhBalanceFromPix } from '@/lib/brh/balance-store';
import { startOnrampAfterPixSettlement } from '@/lib/ramp/start-onramp';
import { unwrapWebhookPayload, pickString, jsonNumberToAmountString } from '@/lib/corpx/webhooks/payload-fields';
import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import {
  ONRAMP_FAILURE_CODES,
  buildOnrampFailurePatch,
  findOnrampOrderByCorpXTxid,
  isOnrampQuoteExpired,
  markOnrampOrderStatus,
  startBrhSaleForOnrampOrder,
} from '@/lib/onramp';

import { insertDepositLedgerEntry } from '@/lib/ledger/insert-entry';

import { findDepositChargeByTxid, markDepositChargePaid } from './charge-store';

export type InboundPixSettlementContext = {
  dedupeKey: string;
  eventType: string;
  payload: unknown;
  result: WebhookProcessingResult;
};

/**
 * Resolves CorpX txid from webhook payload (QR dynamic charge id).
 */
export function resolveCorpXChargeTxid(payload: unknown, result: WebhookProcessingResult): string | null {
  const data = unwrapWebhookPayload(payload);
  const fromPayload = pickString(data, 'txid', 'txId', 'TXID', 'identifier');
  if (fromPayload) return fromPayload;

  const fromFields = result.updatedFields;
  if (fromFields && typeof fromFields.txid === 'string' && fromFields.txid.trim()) {
    return fromFields.txid.trim();
  }
  if (fromFields && typeof fromFields.identifier === 'string' && fromFields.identifier.trim()) {
    return fromFields.identifier.trim();
  }

  return null;
}

/**
 * Credits BRH balance and starts on-ramp after a confirmed inbound PIX (QR paid or PIX in).
 * Idempotent per corpx_txid when charge row exists; always dedupes balance via charge paid state.
 */
export async function settleInboundPixFromWebhook(ctx: InboundPixSettlementContext): Promise<void> {
  const { result, eventType, payload, dedupeKey } = ctx;

  if (result.status !== 'completed' || result.requiresAction !== 'update_balance') {
    return;
  }

  const amountRaw = result.updatedFields?.amount;
  const amount = typeof amountRaw === 'string' ? amountRaw.trim() : '';
  if (!amount) {
    console.warn('[deposit/settle] missing amount', { eventType, dedupeKey });
    return;
  }

  const corpxTxid = resolveCorpXChargeTxid(payload, result);
  if (!corpxTxid) {
    console.warn('[deposit/settle] missing corpx txid — cannot match deposit charge', {
      eventType,
      dedupeKey,
    });
    return;
  }

  const data = unwrapWebhookPayload(payload);
  const transactionId =
    result.providerTxId ??
    pickString(data, 'transactionId', 'transaction_id', 'bigPixId', 'paymentId') ??
    null;
  const endToEndId = pickString(data, 'endToEndId', 'end_to_end_id', 'e2eId') ?? null;
  const onrampOrder = await findOnrampOrderByCorpXTxid(corpxTxid);

  const charge = await findDepositChargeByTxid(corpxTxid);
  if (charge && charge.status === 'paid' && (!onrampOrder || onrampOrder.status === 'pix_received')) {
    console.info('[deposit/settle] charge already settled', { corpxTxid, eventType });
    return;
  }

  if (charge && charge.status === 'pending') {
    const webhookAmount = jsonNumberToAmountString(amount) ?? amount;
    const chargeAmount = jsonNumberToAmountString(charge.amount_brl) ?? charge.amount_brl;
    if (webhookAmount !== chargeAmount) {
      console.warn('[deposit/settle] amount mismatch', {
        corpxTxid,
        expected: chargeAmount,
        received: webhookAmount,
      });
    }
  } else if (!charge) {
    console.warn('[deposit/settle] no pending charge for txid (QR not registered?)', {
      corpxTxid,
      eventType,
    });
  }

  const marked = await markDepositChargePaid({
    corpxTxid,
    amountBrl: amount,
    corpxEventType: eventType,
    corpxTransactionId: transactionId,
    endToEndId,
    settlementDedupeKey: dedupeKey,
  });

  if (!marked.ok) {
    console.error('[deposit/settle] mark paid failed', marked.reason);
    return;
  }

  if (onrampOrder) {
    let orderIdToStartBrhSale: string | null = null;

    if (onrampOrder.status === 'awaiting_pix') {
      const paidAt = new Date();
      const chargeExpired =
        (onrampOrder.corpx_expires_at &&
          isOnrampQuoteExpired(onrampOrder.corpx_expires_at, paidAt)) ||
        isOnrampQuoteExpired(onrampOrder.quote_expires_at, paidAt);

      if (chargeExpired) {
        const review = await markOnrampOrderStatus({
          orderId: onrampOrder.id,
          status: 'needs_review',
          expectedStatus: 'awaiting_pix',
          patch: {
            corpx_event_type: eventType,
            corpx_transaction_id: transactionId,
            end_to_end_id: endToEndId,
            ...buildOnrampFailurePatch({
              code: ONRAMP_FAILURE_CODES.PIX_PAID_AFTER_CHARGE_EXPIRED,
              reason: 'PIX payment received after the quote or charge validity window.',
              needsReview: true,
            }),
          },
        });

        if (!review.ok) {
          console.error('[onramp/settle] failed to mark late PIX payment for review', {
            orderId: onrampOrder.id,
            corpxTxid,
            reason: review.reason,
          });
        } else {
          console.warn('[onramp/settle] late PIX payment held for manual review', {
            orderId: onrampOrder.id,
            corpxTxid,
          });
          await logOnrampEvent({
            phase: 'pix_settlement_late',
            status: 'error',
            taxId: onrampOrder.tax_id,
            amountBrl: onrampOrder.amount_brl,
            providerTxId: corpxTxid,
            correlationId: onrampOrder.id,
            errorCode: ONRAMP_FAILURE_CODES.PIX_PAID_AFTER_CHARGE_EXPIRED,
            errorMessage: 'PIX payment received after quote/charge validity window.',
            metadata: { source: 'deposit/settle-inbound-pix', event_type: eventType },
          });
        }

        return;
      }

      const updated = await markOnrampOrderStatus({
        orderId: onrampOrder.id,
        status: 'pix_received',
        expectedStatus: 'awaiting_pix',
        patch: {
          corpx_event_type: eventType,
          corpx_transaction_id: transactionId,
          end_to_end_id: endToEndId,
        },
      });

      if (!updated.ok) {
        console.error('[onramp/settle] failed to mark order as pix_received', {
          orderId: onrampOrder.id,
          corpxTxid,
          reason: updated.reason,
        });
        await logOnrampEvent({
          phase: 'pix_received',
          status: 'error',
          taxId: onrampOrder.tax_id,
          amountBrl: onrampOrder.amount_brl,
          providerTxId: corpxTxid,
          correlationId: onrampOrder.id,
          errorCode: 'ONRAMP_PIX_RECEIVED_PERSIST_FAILED',
          errorMessage: updated.reason,
          metadata: { source: 'deposit/settle-inbound-pix', event_type: eventType },
        });
        return;
      }

      console.info('[onramp/settle] PIX received for locked on-ramp order', {
        orderId: onrampOrder.id,
        corpxTxid,
      });
      await logOnrampEvent({
        phase: 'pix_received',
        status: 'success',
        taxId: onrampOrder.tax_id,
        amountBrl: onrampOrder.amount_brl,
        providerTxId: corpxTxid,
        correlationId: onrampOrder.id,
        metadata: { source: 'deposit/settle-inbound-pix', event_type: eventType },
      });
      orderIdToStartBrhSale = updated.row.id;
    } else if (onrampOrder.status === 'pix_received') {
      orderIdToStartBrhSale = onrampOrder.id;
    } else {
      console.warn('[onramp/settle] order found for charge in unexpected status', {
        orderId: onrampOrder.id,
        corpxTxid,
        status: onrampOrder.status,
      });
      await logOnrampEvent({
        phase: 'pix_settlement_unexpected_status',
        status: 'error',
        taxId: onrampOrder.tax_id,
        amountBrl: onrampOrder.amount_brl,
        providerTxId: corpxTxid,
        correlationId: onrampOrder.id,
        errorCode: 'ONRAMP_PIX_UNEXPECTED_STATUS',
        errorMessage: `Unexpected status "${onrampOrder.status}" while settling PIX payment.`,
        metadata: { source: 'deposit/settle-inbound-pix', event_type: eventType },
      });
    }

    if (orderIdToStartBrhSale) {
      try {
        await startBrhSaleForOnrampOrder(orderIdToStartBrhSale);
      } catch (error) {
        console.error('[onramp/settle] failed to start BRH sale after PIX settlement', {
          orderId: orderIdToStartBrhSale,
          corpxTxid,
          reason: error instanceof Error ? error.message : String(error),
        });
        await logOnrampEvent({
          phase: 'brh_sale_start',
          status: 'error',
          taxId: onrampOrder.tax_id,
          amountBrl: onrampOrder.amount_brl,
          providerTxId: corpxTxid,
          correlationId: orderIdToStartBrhSale,
          errorCode: 'ONRAMP_BRH_SALE_START_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
          metadata: { source: 'deposit/settle-inbound-pix', event_type: eventType },
        });
      }
    }

    return;
  }

  if (marked.alreadyPaid) {
    return;
  }

  await insertDepositLedgerEntry({
    corpxTxid,
    amountBrl: amount,
    paidAt: new Date().toISOString(),
    endToEndId,
    corpxTransactionId: transactionId ?? corpxTxid,
    settlementDedupeKey: dedupeKey,
  });

  const inc = await incrementBrhBalanceFromPix(amount);
  if (!inc.ok) {
    console.warn('[deposit/settle] balance increment failed', { corpxTxid, amount });
  } else {
    console.info('[deposit/settle] BRH balance credited', { corpxTxid, balance: inc.balance });
  }

  await startOnrampAfterPixSettlement({
    amountBrl: amount,
    providerTxId: transactionId ?? corpxTxid,
    corpxEventType: eventType,
    corpxDedupeKey: dedupeKey,
  });
}
