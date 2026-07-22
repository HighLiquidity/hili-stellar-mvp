import '@/lib/server/only';

import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { createOnrampOperation, RampApiError } from '@/lib/ramp/client';
import { getRampCallbackUrl, isRampConfigured } from '@/lib/ramp/config';
import {
  findRampOperationByExternalId,
  insertRampOperationPending,
  updateRampOperationAfterCreate,
  updateRampOperationFailed,
} from '@/lib/ramp/operation-store';

import { OnrampOperationError } from './errors';
import {
  ONRAMP_FAILURE_CODES,
  buildOnrampFailurePatch,
  clearOnrampFailurePatch,
  type OnrampFailureCode,
} from './failure-codes';
import {
  findOnrampOrderById,
  findOnrampOrderByUsdcDeliveryExternalId,
  markOnrampOrderStatus,
  updateOnrampOrder,
} from './order-store';
import {
  buildOnrampUsdcDeliveryExternalId,
  isOnrampUsdcDeliveryExternalId,
} from './references';
import { startOnrampReconciliation } from './reconciliation';
import { RAMP_ASSET_USDC, RAMP_CATEGORY_CLIENT } from '@/lib/ramp/requests';
import { calculateNetUsdcDeliveredToClient } from './usdc-delivery-fee';
import { resolveOnrampUsdcDeliveryMemo } from './usdc-delivery-memo';
import { resolveOnrampPayoutMethod } from './destination';

function normalizeRampFailureReason(error: unknown): string {
  return error instanceof RampApiError
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
}

function formatRampPositiveAmount(amount: string): string {
  const normalized = amount.trim().replace(',', '.');
  if (!normalized) {
    throw new Error('amount is empty');
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('amount must be positive');
  }

  const fixed = n.toFixed(7);
  const trimmed = fixed.replace(/\.?0+$/, '');
  return trimmed.includes('.') ? trimmed : `${trimmed}.0`;
}

async function markOnrampNeedsReview(orderId: string, failureCode: OnrampFailureCode, reason: string) {
  return markOnrampOrderStatus({
    orderId,
    status: 'needs_review',
    expectedStatus: ['brh_sold', 'needs_review'],
    patch: buildOnrampFailurePatch({ code: failureCode, reason }),
  });
}

export function mapUsdcDeliveryRampStatusToOnrampStatus(status: string): {
  nextStatus: 'usdc_delivered' | 'failed' | 'needs_review' | null;
  failureCode: OnrampFailureCode | null;
} {
  switch (status) {
    case 'confirmed':
      return { nextStatus: 'usdc_delivered', failureCode: null };
    case 'failed':
      return { nextStatus: 'failed', failureCode: ONRAMP_FAILURE_CODES.USDC_DELIVERY_FAILED };
    case 'insufficient_funds':
      return {
        nextStatus: 'needs_review',
        failureCode: ONRAMP_FAILURE_CODES.USDC_DELIVERY_INSUFFICIENT_FUNDS,
      };
    case 'needs_review':
      return { nextStatus: 'needs_review', failureCode: ONRAMP_FAILURE_CODES.USDC_DELIVERY_NEEDS_REVIEW };
    case 'callback_failed':
      return {
        nextStatus: 'needs_review',
        failureCode: ONRAMP_FAILURE_CODES.USDC_DELIVERY_CALLBACK_FAILED,
      };
    default:
      return { nextStatus: null, failureCode: null };
  }
}

/** Builds the Ramp on-ramp create body for USDC client delivery (classic or soroban). */
export function buildOnrampUsdcDeliveryRampRequest(input: {
  amount: string;
  externalId: string;
  callbackUrl: string;
  destinationAddress: string;
  destinationMemo: string | null;
  orderId: string;
}): {
  amount: string;
  externalId: string;
  callbackUrl: string;
  destination: string;
  memo?: string;
  assetCode: typeof RAMP_ASSET_USDC;
  category: typeof RAMP_CATEGORY_CLIENT;
  payoutMethod: 'classic' | 'soroban';
} {
  const payoutMethod = resolveOnrampPayoutMethod(input.destinationAddress);
  const base = {
    amount: input.amount,
    externalId: input.externalId,
    callbackUrl: input.callbackUrl,
    destination: input.destinationAddress,
    assetCode: RAMP_ASSET_USDC,
    category: RAMP_CATEGORY_CLIENT,
    payoutMethod,
  };

  if (payoutMethod === 'soroban') {
    return base;
  }

  return {
    ...base,
    memo: resolveOnrampUsdcDeliveryMemo({
      id: input.orderId,
      destination_memo: input.destinationMemo,
    }),
  };
}

export async function startUsdcDeliveryForOnrampOrder(orderId: string): Promise<void> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new OnrampOperationError('On-ramp order id is required.', 400);
  }

  const order = await findOnrampOrderById(normalizedOrderId);
  if (!order) {
    throw new OnrampOperationError('On-ramp order not found.', 404);
  }

  if (order.usdc_delivered_at || order.status === 'usdc_delivered' || order.status === 'complete') {
    return;
  }

  if (order.status !== 'brh_sold' && order.status !== 'needs_review') {
    throw new OnrampOperationError(
      `USDC delivery cannot start from on-ramp status "${order.status}".`,
      409,
    );
  }

  const externalId = order.usdc_delivery_external_id ?? buildOnrampUsdcDeliveryExternalId(order.id);
  const payoutMethod = resolveOnrampPayoutMethod(order.destination_address);
  const memo =
    payoutMethod === 'classic'
      ? resolveOnrampUsdcDeliveryMemo(order)
      : null;

  await updateOnrampOrder({
    orderId: order.id,
    expectedStatus: ['brh_sold', 'needs_review'],
    patch: {
      usdc_delivery_external_id: externalId,
    },
  });

  const existing = await findRampOperationByExternalId(externalId);
  if (existing?.ramp_operation_id) {
    await updateOnrampOrder({
      orderId: order.id,
      expectedStatus: ['brh_sold', 'needs_review', 'usdc_delivered'],
      patch: {
        usdc_delivery_external_id: externalId,
        usdc_delivery_ramp_operation_id: existing.ramp_operation_id,
      },
    });
    return;
  }

  if (!isRampConfigured()) {
    await markOnrampNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.RAMP_NOT_CONFIGURED,
      'Ramp API não configurada para iniciar a entrega de USDC.',
    );
    return;
  }

  let rampAmount: string;
  try {
    const netAmountUsdc = calculateNetUsdcDeliveredToClient(order.amount_usdc);
    rampAmount = formatRampPositiveAmount(netAmountUsdc);
  } catch (error) {
    await markOnrampNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.INVALID_USDC_DELIVERY_AMOUNT,
      `Valor inválido para entrega de USDC: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const callbackUrl = getRampCallbackUrl();
  if (!callbackUrl?.startsWith('https://')) {
    await markOnrampNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.INVALID_RAMP_CALLBACK_URL,
      'callbackUrl da Ramp deve ser HTTPS para a entrega de USDC.',
    );
    return;
  }

  if (!existing) {
    const pending = await insertRampOperationPending({
      externalId,
      operationType: 'onramp',
      status: 'pending_local',
      amount: rampAmount,
      destination: order.destination_address,
      memo: memo ?? undefined,
      corpxEventType: order.corpx_event_type ?? undefined,
      corpxProviderTxId: order.corpx_transaction_id ?? order.corpx_txid ?? undefined,
    });

    if (!pending.ok) {
      await markOnrampNeedsReview(
        order.id,
        ONRAMP_FAILURE_CODES.USDC_DELIVERY_PENDING_PERSIST_FAILED,
        `Falha ao persistir operação pendente de entrega USDC: ${pending.reason}`,
      );
      return;
    }
  }

  try {
    const created = await createOnrampOperation(
      buildOnrampUsdcDeliveryRampRequest({
        amount: rampAmount,
        externalId,
        callbackUrl,
        destinationAddress: order.destination_address,
        destinationMemo: order.destination_memo,
        orderId: order.id,
      }),
    );

    await updateRampOperationAfterCreate({
      externalId,
      rampOperationId: created.id,
      status: created.status,
    });

    await updateOnrampOrder({
      orderId: order.id,
      expectedStatus: ['brh_sold', 'needs_review'],
      patch: {
        usdc_delivery_external_id: externalId,
        usdc_delivery_ramp_operation_id: created.id,
        ...clearOnrampFailurePatch(),
      },
    });

    console.info('[onramp/usdc-delivery] accepted', {
      orderId: order.id,
      externalId,
      rampOperationId: created.id,
      status: created.status,
      grossAmountUsdc: order.amount_usdc,
      netAmountUsdc: rampAmount,
    });
    await logOnrampEvent({
      phase: 'usdc_delivery_submit',
      status: 'success',
      taxId: order.tax_id,
      amountBrl: order.amount_brl,
      correlationId: order.id,
      metadata: {
        source: 'onramp/usdc-delivery',
        external_id: externalId,
        ramp_operation_id: created.id,
      },
    });
  } catch (error) {
    const failureReason = normalizeRampFailureReason(error);

    await updateRampOperationFailed({
      externalId,
      status: 'failed',
      failureReason,
    });

    await markOnrampNeedsReview(order.id, ONRAMP_FAILURE_CODES.USDC_DELIVERY_SUBMIT_FAILED, failureReason);

    console.error('[onramp/usdc-delivery] submit failed', {
      orderId: order.id,
      externalId,
      reason: failureReason,
    });
    await logOnrampEvent({
      phase: 'usdc_delivery_submit',
      status: 'error',
      taxId: order.tax_id,
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: ONRAMP_FAILURE_CODES.USDC_DELIVERY_SUBMIT_FAILED,
      errorMessage: failureReason,
      metadata: { source: 'onramp/usdc-delivery', external_id: externalId },
    });
  }
}

export async function applyUsdcDeliveryRampCallback(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  txHash?: string | null;
  failureReason?: string | null;
}): Promise<void> {
  if (!isOnrampUsdcDeliveryExternalId(input.externalId)) {
    return;
  }

  const order = await findOnrampOrderByUsdcDeliveryExternalId(input.externalId);
  if (!order) {
    console.warn('[onramp/usdc-delivery] callback received for unknown external id', {
      externalId: input.externalId,
      rampOperationId: input.rampOperationId,
    });
    return;
  }

  const outcome = mapUsdcDeliveryRampStatusToOnrampStatus(input.status);
  if (!outcome.nextStatus) {
    await updateOnrampOrder({
      orderId: order.id,
      expectedStatus: ['brh_sold', 'needs_review', 'usdc_delivered'],
      patch: {
        usdc_delivery_external_id: input.externalId,
        usdc_delivery_ramp_operation_id: input.rampOperationId,
        usdc_delivery_tx_hash: input.txHash ?? null,
      },
    });
    return;
  }

  if (outcome.nextStatus === 'usdc_delivered') {
    const updated = await markOnrampOrderStatus({
      orderId: order.id,
      status: 'usdc_delivered',
      expectedStatus: ['brh_sold', 'needs_review', 'usdc_delivered'],
      patch: {
        usdc_delivery_external_id: input.externalId,
        usdc_delivery_ramp_operation_id: input.rampOperationId,
        usdc_delivery_tx_hash: input.txHash ?? null,
        ...clearOnrampFailurePatch(),
      },
    });

    if (!updated.ok) {
      console.error('[onramp/usdc-delivery] failed to mark usdc_delivered', {
        orderId: order.id,
        externalId: input.externalId,
        reason: updated.reason,
      });
      return;
    }

    console.info('[onramp/usdc-delivery] delivery confirmed; reconciliation pending', {
      orderId: updated.row.id,
      externalId: input.externalId,
      txHash: input.txHash ?? null,
    });
    await logOnrampEvent({
      phase: 'usdc_delivery_confirmed',
      status: 'success',
      taxId: updated.row.tax_id,
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      metadata: {
        source: 'onramp/usdc-delivery-callback',
        external_id: input.externalId,
        tx_hash: input.txHash ?? null,
      },
    });

    try {
      await startOnrampReconciliation(updated.row.id, { source: 'ramp-usdc-delivery-callback' });
    } catch (error) {
      console.error('[onramp/usdc-delivery] failed to start reconciliation after delivery', {
        orderId: updated.row.id,
        externalId: input.externalId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const failureReason =
    input.failureReason ?? `Ramp USDC delivery returned status "${input.status}".`;

  const updated = await markOnrampOrderStatus({
    orderId: order.id,
    status: outcome.nextStatus,
    expectedStatus: ['brh_sold', 'needs_review', 'failed'],
    patch: {
      usdc_delivery_external_id: input.externalId,
      usdc_delivery_ramp_operation_id: input.rampOperationId,
      usdc_delivery_tx_hash: input.txHash ?? null,
      ...buildOnrampFailurePatch({
        code: outcome.failureCode as OnrampFailureCode,
        reason: failureReason,
        needsReview: outcome.nextStatus === 'needs_review',
      }),
    },
  });

  if (!updated.ok) {
    console.error('[onramp/usdc-delivery] failed to apply callback outcome', {
      orderId: order.id,
      externalId: input.externalId,
      status: input.status,
      reason: updated.reason,
    });
    await logOnrampEvent({
      phase: 'usdc_delivery_callback',
      status: 'error',
      taxId: order.tax_id,
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: 'ONRAMP_USDC_DELIVERY_CALLBACK_PERSIST_FAILED',
      errorMessage: updated.reason,
      metadata: { source: 'onramp/usdc-delivery-callback', external_id: input.externalId, status: input.status },
    });
    return;
  }

  await logOnrampEvent({
    phase: 'usdc_delivery_callback',
    status: 'error',
    taxId: order.tax_id,
    amountBrl: order.amount_brl,
    correlationId: order.id,
    errorCode: outcome.failureCode,
    errorMessage: failureReason,
    metadata: { source: 'onramp/usdc-delivery-callback', external_id: input.externalId, status: input.status },
  });
}
