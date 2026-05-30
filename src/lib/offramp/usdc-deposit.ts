import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { getRampOperation } from '@/lib/ramp/client';
import { isRampConfigured } from '@/lib/ramp/config';
import type { RampOperationDocument } from '@/lib/ramp/types';
import { OFFRAMP_FAILURE_CODES, buildOfframpFailurePatch, clearOfframpFailurePatch } from './failure-codes';
import {
  findOfframpOrderById,
  findOfframpOrderByUsdcDepositExternalId,
  markOfframpOrderStatus,
  updateOfframpOrder,
  type OfframpOrderRow,
} from './order-store';
import { isOfframpUsdcDepositExternalId } from './references';
import { retryOfframpReconciliation } from './reconciliation';

const TERMINAL_USDC_DEPOSIT_RAMP_STATUSES = new Set([
  'confirmed',
  'completed',
  'failed',
  'expired',
  'needs_review',
  'insufficient_funds',
  'callback_failed',
]);

export function mapUsdcDepositRampStatusToOfframpStatus(status: string): {
  nextStatus: 'usdc_received' | 'expired' | 'failed' | 'needs_review' | null;
  failureCode: string | null;
} {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return { nextStatus: 'usdc_received', failureCode: null };
    case 'expired':
      return { nextStatus: 'expired', failureCode: OFFRAMP_FAILURE_CODES.DEPOSIT_TIMEOUT };
    case 'failed':
      return { nextStatus: 'failed', failureCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED };
    case 'insufficient_funds':
    case 'needs_review':
    case 'callback_failed':
      return { nextStatus: 'needs_review', failureCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED };
    default:
      return { nextStatus: null, failureCode: null };
  }
}

export function extractUsdcDepositFieldsFromRampDocument(doc: Pick<
  RampOperationDocument,
  'id' | 'status' | 'depositTxHash' | 'txHash' | 'receivedAmount' | 'amount' | 'failureReason'
>): {
  rampOperationId: string;
  status: string;
  txHash: string | null;
  amount: string | null;
  failureReason: string | null;
} {
  return {
    rampOperationId: doc.id,
    status: doc.status,
    txHash: doc.depositTxHash?.trim() || doc.txHash?.trim() || null,
    amount: doc.receivedAmount?.trim() || doc.amount?.trim() || null,
    failureReason: doc.failureReason?.trim() || null,
  };
}

export function shouldSyncOfframpUsdcDeposit(order: Pick<
  OfframpOrderRow,
  'status' | 'usdc_deposit_ramp_operation_id' | 'usdc_deposit_external_id'
>): boolean {
  if (order.status !== 'awaiting_deposit' && order.status !== 'needs_review') {
    return false;
  }

  return Boolean(order.usdc_deposit_ramp_operation_id?.trim() && order.usdc_deposit_external_id?.trim());
}

export async function applyOfframpUsdcDepositRampCallback(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  txHash?: string | null;
  amount?: string | null;
  failureReason?: string | null;
}): Promise<void> {
  if (!isOfframpUsdcDepositExternalId(input.externalId)) return;

  const order = await findOfframpOrderByUsdcDepositExternalId(input.externalId);
  if (!order) {
    console.warn('[offramp/usdc-deposit] callback received for unknown external id', input);
    return;
  }

  const outcome = mapUsdcDepositRampStatusToOfframpStatus(input.status);
  if (!outcome.nextStatus) {
    await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: ['awaiting_deposit', 'needs_review', 'usdc_received'],
      patch: {
        usdc_deposit_ramp_operation_id: input.rampOperationId,
        usdc_received_tx_hash: input.txHash ?? null,
        usdc_received_amount: input.amount ?? null,
      },
    });
    return;
  }

  if (outcome.nextStatus === 'usdc_received') {
    const updated = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'usdc_received',
      expectedStatus: ['awaiting_deposit', 'needs_review', 'usdc_received'],
      patch: {
        usdc_deposit_ramp_operation_id: input.rampOperationId,
        usdc_received_tx_hash: input.txHash ?? null,
        usdc_received_amount: input.amount ?? null,
        ...clearOfframpFailurePatch(),
      },
    });
    if (!updated.ok) return;

    await logOfframpEvent({
      phase: 'usdc_deposit_confirmed',
      status: 'success',
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      metadata: {
        source: 'offramp/usdc-deposit-callback',
        external_id: input.externalId,
        tx_hash: input.txHash ?? null,
      },
    });

    try {
      await retryOfframpReconciliation(updated.row.id);
    } catch (error) {
      console.error('[offramp/usdc-deposit] failed to start reconciliation', {
        orderId: updated.row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (outcome.nextStatus === 'expired') {
    const failureReason = input.failureReason ?? 'USDC deposit window expired before confirmation.';
    const updated = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'expired',
      expectedStatus: ['awaiting_deposit', 'needs_review', 'expired'],
      patch: {
        usdc_deposit_ramp_operation_id: input.rampOperationId,
        usdc_received_tx_hash: input.txHash ?? null,
        usdc_received_amount: input.amount ?? null,
        ...buildOfframpFailurePatch({
          code: OFFRAMP_FAILURE_CODES.DEPOSIT_TIMEOUT,
          reason: failureReason,
        }),
      },
    });
    if (!updated.ok) return;

    await logOfframpEvent({
      phase: 'usdc_deposit_expired',
      status: 'error',
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      errorCode: OFFRAMP_FAILURE_CODES.DEPOSIT_TIMEOUT,
      errorMessage: failureReason,
      metadata: {
        source: 'offramp/usdc-deposit-callback',
        external_id: input.externalId,
        status: input.status,
      },
    });
    return;
  }

  const failureReason = input.failureReason ?? `Ramp off-ramp deposit returned status "${input.status}".`;
  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: outcome.nextStatus,
    expectedStatus: ['awaiting_deposit', 'needs_review', 'failed'],
    patch: {
      usdc_deposit_ramp_operation_id: input.rampOperationId,
      usdc_received_tx_hash: input.txHash ?? null,
      usdc_received_amount: input.amount ?? null,
      ...buildOfframpFailurePatch({
        code: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED,
        reason: failureReason,
        needsReview: outcome.nextStatus === 'needs_review',
      }),
    },
  });
  if (!updated.ok) return;

  await logOfframpEvent({
    phase: 'usdc_deposit_callback',
    status: 'error',
    amountBrl: updated.row.amount_brl,
    correlationId: updated.row.id,
    errorCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED,
    errorMessage: failureReason,
    metadata: {
      source: 'offramp/usdc-deposit-callback',
      external_id: input.externalId,
      status: input.status,
    },
  });
}

/**
 * Polls Ramp as source of truth when webhooks are delayed/missed.
 * Recommended by the Ramp API integration checklist for non-terminal deposits.
 */
export async function syncOfframpUsdcDepositFromRamp(order: OfframpOrderRow): Promise<OfframpOrderRow> {
  if (!shouldSyncOfframpUsdcDeposit(order) || !isRampConfigured()) {
    return order;
  }

  const externalId = order.usdc_deposit_external_id!.trim();
  const rampOperationId = order.usdc_deposit_ramp_operation_id!.trim();

  try {
    const document = await getRampOperation(rampOperationId);
    const extracted = extractUsdcDepositFieldsFromRampDocument(document);

    if (!TERMINAL_USDC_DEPOSIT_RAMP_STATUSES.has(extracted.status)) {
      if (extracted.txHash || extracted.amount) {
        await applyOfframpUsdcDepositRampCallback({
          externalId,
          rampOperationId: extracted.rampOperationId,
          status: extracted.status,
          txHash: extracted.txHash,
          amount: extracted.amount,
          failureReason: extracted.failureReason,
        });
      }
      return (await findOfframpOrderById(order.id)) ?? order;
    }

    await applyOfframpUsdcDepositRampCallback({
      externalId,
      rampOperationId: extracted.rampOperationId,
      status: extracted.status,
      txHash: extracted.txHash,
      amount: extracted.amount,
      failureReason: extracted.failureReason,
    });
  } catch (error) {
    console.warn('[offramp/usdc-deposit] failed to sync deposit from Ramp API', {
      orderId: order.id,
      rampOperationId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return (await findOfframpOrderById(order.id)) ?? order;
}
