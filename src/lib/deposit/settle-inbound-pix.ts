import type { WebhookProcessingResult } from '@/lib/corpx/webhooks/types';
import { incrementBrhBalanceFromPix } from '@/lib/brh/balance-store';
import { startOnrampAfterPixSettlement } from '@/lib/ramp/start-onramp';
import { unwrapWebhookPayload, pickString, jsonNumberToAmountString } from '@/lib/corpx/webhooks/payload-fields';
import { logUnmatchedInboundPix } from '@/lib/fiat-operations/log-deposit';
import { actorFromOnrampOrder, logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { logTreasuryInboundPix } from '@/lib/fiat-operations/log-treasury';
import {
  ONRAMP_FAILURE_CODES,
  buildOnrampFailurePatch,
  findOnrampOrderByCorpXTxid,
  isOnrampQuoteExpired,
  markOnrampOrderStatus,
  startBrhSaleForOnrampOrder,
} from '@/lib/onramp';

import { insertDepositLedgerEntry } from '@/lib/ledger/insert-entry';
import {
  formatTreasuryCorpxInboundStepDetail,
  pickTreasuryBrlReceiveMatch,
  TREASURY_BRL_RECEIVE_MATCH_WINDOW_MS,
  TREASURY_CORPX_INBOUND_STEP,
} from '@/lib/treasury/match-inbound-pix';
import { listRecentTreasuryRunsByKind, updateTreasuryRun } from '@/lib/treasury/runs-store';

import { findDepositChargeByTxid, markDepositChargePaid } from './charge-store';
import { classifyInboundPixSettlement } from './inbound-pix-classification';

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
 * Settles inbound PIX only when it matches a pending deposit charge or a locked on-ramp order.
 * Unmatched credits (treasury / PIX avulso) are audited and ignored — they must not mint BRH.
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
  const settlementClass = classifyInboundPixSettlement({
    onrampOrder,
    charge: charge ? { status: charge.status } : null,
  });

  if (settlementClass === 'already_settled') {
    console.info('[deposit/settle] charge already settled', { corpxTxid, eventType });
    return;
  }

  if (settlementClass === 'unmatched') {
    console.warn('[deposit/settle] unmatched inbound PIX — skip BRH credit and Ramp', {
      corpxTxid,
      eventType,
      amount,
    });
    await acknowledgeUnmatchedInboundPix({
      eventType,
      amountBrl: amount,
      corpxTxid,
      transactionId,
      endToEndId,
      taxId: pickString(data, 'payerDocument', 'payer_document') ?? null,
      payerName:
        pickString(data, 'payerName', 'payer_name') ??
        (typeof result.updatedFields?.payer_name === 'string' ? result.updatedFields.payer_name : null),
    });
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
            actor: actorFromOnrampOrder(onrampOrder),
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
          actor: actorFromOnrampOrder(onrampOrder),
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
        actor: actorFromOnrampOrder(onrampOrder),
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
        actor: actorFromOnrampOrder(onrampOrder),
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
          actor: actorFromOnrampOrder(onrampOrder),
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

async function acknowledgeUnmatchedInboundPix(input: {
  eventType: string;
  amountBrl: string;
  corpxTxid: string;
  transactionId: string | null;
  endToEndId: string | null;
  taxId: string | null;
  payerName: string | null;
}): Promise<void> {
  const sinceIso = new Date(Date.now() - TREASURY_BRL_RECEIVE_MATCH_WINDOW_MS).toISOString();
  const runs = await listRecentTreasuryRunsByKind({
    kind: 'binance_brl_to_corpx',
    sinceIso,
  });
  const match = pickTreasuryBrlReceiveMatch(runs, input.amountBrl);

  if (match) {
    console.info('[deposit/settle] inbound PIX matched treasury Binance→CorpX run', {
      runId: match.id,
      corpxTxid: input.corpxTxid,
      amount: input.amountBrl,
    });
    await logTreasuryInboundPix({
      eventType: input.eventType,
      amountBrl: input.amountBrl,
      providerTxId: input.corpxTxid,
      e2eId: input.endToEndId,
      correlationId: match.id,
      actor: {
        email: match.created_by_email,
        userId: match.created_by_user_id,
      },
      metadata: {
        corpx_txid: input.corpxTxid,
        transaction_id: input.transactionId,
        payer_name: input.payerName,
        treasury_run_id: match.id,
      },
    });
    try {
      await updateTreasuryRun(match.id, {
        steps: [
          ...match.steps,
          {
            name: TREASURY_CORPX_INBOUND_STEP,
            status: 'ok',
            detail: formatTreasuryCorpxInboundStepDetail({
              corpxTxid: input.corpxTxid,
              e2eId: input.endToEndId,
              eventType: input.eventType,
            }),
            at: new Date().toISOString(),
          },
        ],
      });
    } catch (error) {
      console.error('[deposit/settle] failed to mark treasury run as CorpX-matched', {
        runId: match.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  await logUnmatchedInboundPix({
    eventType: input.eventType,
    amountBrl: input.amountBrl,
    providerTxId: input.corpxTxid,
    e2eId: input.endToEndId,
    taxId: input.taxId,
    metadata: {
      corpx_txid: input.corpxTxid,
      transaction_id: input.transactionId,
      payer_name: input.payerName,
    },
  });
}
