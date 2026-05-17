import type { WebhookProcessingResult } from '@/lib/corpx/webhooks/types';
import { incrementBrhBalanceFromPix } from '@/lib/brh/balance-store';
import { startOnrampAfterPixSettlement } from '@/lib/ramp/start-onramp';
import { unwrapWebhookPayload, pickString, jsonNumberToAmountString } from '@/lib/corpx/webhooks/payload-fields';

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

  const charge = await findDepositChargeByTxid(corpxTxid);
  if (charge && charge.status === 'paid') {
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
