import '@/lib/server/only';

import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import type { CorpXPIXKeyType } from '@/lib/corpx/pix';
import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { binance } from '@/lib/server/binance';
import { startOfframpBrhIssueForOrder, startOfframpBrhRedemptionForOrder, resolveOfframpBrhIssueRampStatus, resolveOfframpBrhRedemptionRampStatus } from './brh-record';
import { isOfframpBrhIssueCompleted, isOfframpBrhRedemptionCompleted } from './brh-lifecycle';
import {
  OFFRAMP_FAILURE_CODES,
  buildOfframpFailurePatch,
  clearOfframpFailurePatch,
  type OfframpFailureCode,
} from './failure-codes';
import { OfframpOperationError } from './errors';
import { findOfframpOrderById, markOfframpOrderStatus, type OfframpOrderRow } from './order-store';
import { syncOfframpPixPayoutFromCorpX } from './pix-payout-sync';
import { isBinanceClientOrderId } from '@/lib/server/binance/client-order-id';
import {
  assertBinanceMarketQuoteNotionalForSymbol,
  formatBinanceTradeErrorMessage,
} from '@/lib/server/binance/exchange-info';
import {
  buildOfframpBinanceClientOrderId,
  buildOfframpBrhIssueExternalId,
  buildOfframpBrhRedemptionExternalId,
  buildOfframpPixPayoutIdempotencyKey,
  buildOfframpPixPayoutReference,
} from './references';

const RECONCILIATION_START_STATUSES = ['usdc_received', 'needs_review'] as const;
const RECONCILIATION_ACTIVE_STATUSES = ['usdc_received', 'needs_review', 'pix_sent', 'brh_recorded', 'fx_settled'] as const;
const RECONCILIATION_COMPLETED_STATUSES = ['complete'] as const;

function inferPixKeyType(rawPixKey: string): CorpXPIXKeyType {
  const pixKey = rawPixKey.trim();
  const digitsOnly = pixKey.replace(/\D/g, '');

  if (digitsOnly.length === 11) {
    return 'CPF';
  }

  if (digitsOnly.length === 14) {
    return 'CNPJ';
  }

  if (pixKey.includes('@')) {
    return 'EMAIL';
  }

  if (/^\+?\d{10,13}$/.test(pixKey) || /^\d{10,13}$/.test(digitsOnly)) {
    return 'PHONE';
  }

  return 'EVP';
}

async function markNeedsReview(order: OfframpOrderRow, failureCode: OfframpFailureCode, reason: string): Promise<void> {
  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: 'needs_review',
    expectedStatus: [...RECONCILIATION_ACTIVE_STATUSES, 'complete'],
    patch: buildOfframpFailurePatch({
      code: failureCode,
      reason,
      needsReview: true,
    }),
  });

  if (!updated.ok) {
    console.error('[offramp/reconcile] failed to mark order as needs_review', {
      orderId: order.id,
      reason,
      updateReason: updated.reason,
    });
  }
}

async function submitPixPayout(order: OfframpOrderRow): Promise<void> {
  if (order.payout_provider_tx_id) {
    const promoted = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'pix_sent',
      expectedStatus: ['usdc_received', 'needs_review', 'pix_sent'],
      patch: {
        payout_reference: order.payout_reference ?? buildOfframpPixPayoutReference(order.id),
        ...clearOfframpFailurePatch(),
      },
    });

    if (!promoted.ok) {
      throw new OfframpOperationError(`Failed to persist pix_sent state: ${promoted.reason}`);
    }

    return;
  }

  const pixKey = order.payout_pix_key?.trim();
  if (!pixKey) {
    throw new OfframpOperationError('Off-ramp order is missing payout PIX key', 409);
  }

  let adapter;
  try {
    adapter = await createCorpXAdapterFromEnv();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markNeedsReview(order, OFFRAMP_FAILURE_CODES.PIX_PAYOUT_SUBMIT_FAILED, reason);
    await logOfframpEvent({
      phase: 'pix_payout_submit',
      status: 'error',
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: OFFRAMP_FAILURE_CODES.PIX_PAYOUT_SUBMIT_FAILED,
      errorMessage: reason,
      metadata: { source: 'offramp/reconcile', order_id: order.id },
    });
    return;
  }

  const payoutReference = buildOfframpPixPayoutReference(order.id);

  try {
    const pixKeyType = inferPixKeyType(pixKey);
    const payout = await adapter.pix.initiatePIXCashOut({
      amount: order.amount_brl,
      pixKey,
      pixKeyType,
      idempotencyKey: buildOfframpPixPayoutIdempotencyKey(order.id),
      correlationId: order.id,
      description: payoutReference,
    });

    const updated = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'pix_sent',
      expectedStatus: ['usdc_received', 'needs_review', 'pix_sent'],
      patch: {
        payout_provider_tx_id: payout.providerTxId,
        payout_end_to_end_id: payout.e2eId || null,
        payout_reference: payoutReference,
        ...clearOfframpFailurePatch(),
      },
    });

    if (!updated.ok) {
      throw new OfframpOperationError(`Failed to persist PIX payout result: ${updated.reason}`);
    }

    await logOfframpEvent({
      phase: 'pix_payout_submit',
      status: 'success',
      amountBrl: order.amount_brl,
      correlationId: order.id,
      providerTxId: payout.providerTxId,
      metadata: {
        source: 'offramp/reconcile',
        order_id: order.id,
        e2e_id: payout.e2eId || null,
        pix_key_type: pixKeyType,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markNeedsReview(order, OFFRAMP_FAILURE_CODES.PIX_PAYOUT_SUBMIT_FAILED, reason);
    await logOfframpEvent({
      phase: 'pix_payout_submit',
      status: 'error',
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: OFFRAMP_FAILURE_CODES.PIX_PAYOUT_SUBMIT_FAILED,
      errorMessage: reason,
      metadata: { source: 'offramp/reconcile', order_id: order.id },
    });
  }
}

async function registerBrhRecord(order: OfframpOrderRow): Promise<void> {
  if (order.status === 'brh_recorded' || order.status === 'fx_settled' || order.status === 'complete') {
    return;
  }

  if (order.status !== 'pix_sent' && order.status !== 'needs_review') {
    return;
  }

  if (!order.payout_provider_tx_id) {
    throw new OfframpOperationError('Cannot record BRH step before PIX payout is sent', 409);
  }

  const issueExternalId = order.brh_issue_external_id ?? buildOfframpBrhIssueExternalId(order.id);
  const redemptionExternalId =
    order.brh_redemption_external_id ?? buildOfframpBrhRedemptionExternalId(order.id);

  try {
    const issue = await startOfframpBrhIssueForOrder(order);
    const issueStatus = (await resolveOfframpBrhIssueRampStatus(order)) ?? issue.status;

    const persisted = await markOfframpOrderStatus({
      orderId: order.id,
      status: order.status,
      expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
      patch: {
        brh_issue_external_id: issue.externalId,
        brh_issue_ramp_operation_id: issue.rampOperationId,
        ...clearOfframpFailurePatch(),
      },
    });

    if (!persisted.ok) {
      await markNeedsReview(order, OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED, `Failed to persist BRH issue ids: ${persisted.reason}`);
      return;
    }

    await logOfframpEvent({
      phase: 'brh_issue_submit',
      status: 'success',
      amountBrl: persisted.row.amount_brl,
      correlationId: persisted.row.id,
      metadata: {
        source: 'offramp/reconcile',
        order_id: persisted.row.id,
        issue_external_id: issueExternalId,
        issue_ramp_operation_id: persisted.row.brh_issue_ramp_operation_id,
        issue_ramp_status: issueStatus,
      },
    });

    if (!isOfframpBrhIssueCompleted(issueStatus)) {
      console.info('[offramp/reconcile] waiting for BRH issue confirmation before redemption', {
        orderId: order.id,
        issueExternalId,
        issueStatus,
      });
      return;
    }

    const redemption = await startOfframpBrhRedemptionForOrder(persisted.row);
    const redemptionStatus =
      (await resolveOfframpBrhRedemptionRampStatus(persisted.row)) ?? redemption.status;

    const withRedemption = await markOfframpOrderStatus({
      orderId: order.id,
      status: order.status,
      expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
      patch: {
        brh_redemption_external_id: redemption.externalId,
        brh_redemption_ramp_operation_id: redemption.rampOperationId,
        ...clearOfframpFailurePatch(),
      },
    });

    if (!withRedemption.ok) {
      await markNeedsReview(
        order,
        OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED,
        `Failed to persist BRH redemption ids: ${withRedemption.reason}`,
      );
      return;
    }

    await logOfframpEvent({
      phase: 'brh_record_submit',
      status: 'success',
      amountBrl: withRedemption.row.amount_brl,
      correlationId: withRedemption.row.id,
      metadata: {
        source: 'offramp/reconcile',
        order_id: withRedemption.row.id,
        issue_external_id: issueExternalId,
        redemption_external_id: redemptionExternalId,
        issue_ramp_operation_id: withRedemption.row.brh_issue_ramp_operation_id,
        redemption_ramp_operation_id: withRedemption.row.brh_redemption_ramp_operation_id,
        redemption_ramp_status: redemptionStatus,
      },
    });

    if (isOfframpBrhRedemptionCompleted(redemptionStatus)) {
      const updated = await markOfframpOrderStatus({
        orderId: order.id,
        status: 'brh_recorded',
        expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
        patch: {
          brh_issue_external_id: issue.externalId,
          brh_issue_ramp_operation_id: withRedemption.row.brh_issue_ramp_operation_id,
          brh_redemption_external_id: redemption.externalId,
          brh_redemption_ramp_operation_id: withRedemption.row.brh_redemption_ramp_operation_id,
          ...clearOfframpFailurePatch(),
        },
      });

      if (!updated.ok) {
        await markNeedsReview(
          order,
          OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED,
          `Failed to persist brh_recorded after confirmation: ${updated.reason}`,
        );
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markNeedsReview(order, OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED, reason);
    await logOfframpEvent({
      phase: 'brh_record',
      status: 'error',
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED,
      errorMessage: reason,
      metadata: {
        source: 'offramp/reconcile',
        order_id: order.id,
        issue_external_id: issueExternalId,
        redemption_external_id: redemptionExternalId,
      },
    });
  }
}

async function executeFxTrade(order: OfframpOrderRow): Promise<void> {
  if (order.status === 'fx_settled' || order.status === 'complete') {
    return;
  }

  if (order.status !== 'brh_recorded') {
    return;
  }

  if (order.binance_order_id) {
    const promoted = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'fx_settled',
      expectedStatus: ['brh_recorded', 'needs_review', 'fx_settled'],
      patch: clearOfframpFailurePatch(),
    });

    if (!promoted.ok) {
      await markNeedsReview(
        order,
        OFFRAMP_FAILURE_CODES.FX_TRADE_FAILED,
        `Failed to persist fx_settled for existing Binance order: ${promoted.reason}`,
      );
      return;
    }

    return;
  }

  const clientOrderId =
    order.binance_client_order_id && isBinanceClientOrderId(order.binance_client_order_id)
      ? order.binance_client_order_id
      : buildOfframpBinanceClientOrderId(order.id);

  try {
    await assertBinanceMarketQuoteNotionalForSymbol(order.quote_symbol, order.amount_brl);

    const result = await binance.market.placeMarketOrderByQuoteAmount({
      symbol: order.quote_symbol,
      side: order.quote_side,
      quoteOrderQty: order.amount_brl,
      newClientOrderId: clientOrderId,
    });

    const updated = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'fx_settled',
      expectedStatus: ['brh_recorded', 'needs_review', 'fx_settled'],
      patch: {
        binance_symbol: result.symbol,
        binance_side: result.side,
        binance_client_order_id: clientOrderId,
        binance_order_id: String(result.orderId),
        binance_executed_qty: result.executedQty,
        binance_cummulative_quote_qty: result.cummulativeQuoteQty,
        binance_status: result.status,
        ...clearOfframpFailurePatch(),
      },
    });

    if (!updated.ok) {
      await markNeedsReview(
        order,
        OFFRAMP_FAILURE_CODES.FX_TRADE_FAILED,
        `Failed to persist FX trade result: ${updated.reason}`,
      );
      return;
    }

    await logOfframpEvent({
      phase: 'fx_trade',
      status: 'success',
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      metadata: {
        source: 'offramp/reconcile',
        order_id: updated.row.id,
        binance_order_id: String(result.orderId),
        executed_qty: result.executedQty,
        quote_qty: result.cummulativeQuoteQty,
      },
    });
  } catch (error) {
    const reason = formatBinanceTradeErrorMessage(error, order.quote_symbol);
    await markNeedsReview(order, OFFRAMP_FAILURE_CODES.FX_TRADE_FAILED, reason);
    await logOfframpEvent({
      phase: 'fx_trade',
      status: 'error',
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: OFFRAMP_FAILURE_CODES.FX_TRADE_FAILED,
      errorMessage: reason,
      metadata: { source: 'offramp/reconcile', order_id: order.id },
    });
  }
}

async function markCompleteIfReady(order: OfframpOrderRow): Promise<void> {
  if (order.status === 'complete') {
    return;
  }

  if (order.status !== 'fx_settled') {
    return;
  }

  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: 'complete',
    expectedStatus: ['fx_settled', 'needs_review', 'complete'],
    patch: clearOfframpFailurePatch(),
  });

  if (!updated.ok) {
    await markNeedsReview(
      order,
      OFFRAMP_FAILURE_CODES.RECONCILIATION_FAILED,
      `Failed to finalize off-ramp order: ${updated.reason}`,
    );
    return;
  }

  await logOfframpEvent({
    phase: 'complete',
    status: 'success',
    amountBrl: updated.row.amount_brl,
    correlationId: updated.row.id,
    metadata: {
      source: 'offramp/reconcile',
      order_id: updated.row.id,
      status: updated.row.status,
    },
  });
}

export async function retryOfframpReconciliation(orderId: string): Promise<{ accepted: true; orderId: string }> {
  let order = await findOfframpOrderById(orderId);
  if (!order) throw new OfframpOperationError('Order not found', 404);

  order = await syncOfframpPixPayoutFromCorpX(order);

  if ((RECONCILIATION_COMPLETED_STATUSES as readonly string[]).includes(order.status)) {
    return { accepted: true, orderId: order.id };
  }

  if (
    !(RECONCILIATION_START_STATUSES as readonly string[]).includes(order.status) &&
    !(RECONCILIATION_ACTIVE_STATUSES as readonly string[]).includes(order.status)
  ) {
    throw new OfframpOperationError(
      `Off-ramp reconciliation cannot start from status "${order.status}".`,
      409,
    );
  }

  if (order.status === 'usdc_received' || order.status === 'needs_review') {
    await submitPixPayout(order);
  }

  let current = await findOfframpOrderById(order.id);
  if (current && (current.status === 'pix_sent' || current.status === 'needs_review')) {
    await registerBrhRecord(current);
    current = await findOfframpOrderById(order.id);
  }

  if (current && current.status === 'brh_recorded') {
    await executeFxTrade(current);
    current = await findOfframpOrderById(order.id);
  }

  if (current && current.status === 'fx_settled') {
    await markCompleteIfReady(current);
  }

  return { accepted: true, orderId: order.id };
}
