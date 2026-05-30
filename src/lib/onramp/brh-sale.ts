import '@/lib/server/only';

import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { createOnrampOperation, RampApiError } from '@/lib/ramp/client';
import { getRampCallbackUrl, isRampConfigured } from '@/lib/ramp/config';
import { formatRampAmountFromBrl } from '@/lib/ramp/amount';
import { truncateUtf8Bytes } from '@/lib/ramp/memo';
import { RAMP_ASSET_BRH, RAMP_CATEGORY_CLIENT } from '@/lib/ramp/requests';
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
  findOnrampOrderByBrhSaleExternalId,
  findOnrampOrderById,
  markOnrampOrderStatus,
  updateOnrampOrder,
} from './order-store';
import { buildOnrampBrhSaleExternalId, isOnrampBrhSaleExternalId } from './references';
import { startUsdcDeliveryForOnrampOrder } from './usdc-delivery';

export type BrhSaleRampStatus =
  | 'pending'
  | 'submitting'
  | 'confirmed'
  | 'insufficient_funds'
  | 'failed'
  | 'needs_review'
  | 'callback_failed';

function buildBrhSaleMemo(orderId: string): string {
  return truncateUtf8Bytes(`brh-sale:${orderId}`, 28);
}

function normalizeRampFailureReason(error: unknown): string {
  return error instanceof RampApiError
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
}

async function markOnrampNeedsReview(orderId: string, failureCode: OnrampFailureCode, reason: string) {
  return markOnrampOrderStatus({
    orderId,
    status: 'needs_review',
    expectedStatus: ['pix_received', 'needs_review'],
    patch: buildOnrampFailurePatch({ code: failureCode, reason }),
  });
}

export function mapBrhSaleRampStatusToOnrampStatus(status: string): {
  nextStatus: 'brh_sold' | 'failed' | 'needs_review' | null;
  failureCode: OnrampFailureCode | null;
} {
  switch (status) {
    case 'confirmed':
      return { nextStatus: 'brh_sold', failureCode: null };
    case 'failed':
      return { nextStatus: 'failed', failureCode: ONRAMP_FAILURE_CODES.BRH_SALE_FAILED };
    case 'insufficient_funds':
      return {
        nextStatus: 'needs_review',
        failureCode: ONRAMP_FAILURE_CODES.BRH_SALE_INSUFFICIENT_FUNDS,
      };
    case 'needs_review':
      return { nextStatus: 'needs_review', failureCode: ONRAMP_FAILURE_CODES.BRH_SALE_NEEDS_REVIEW };
    case 'callback_failed':
      return {
        nextStatus: 'needs_review',
        failureCode: ONRAMP_FAILURE_CODES.BRH_SALE_CALLBACK_FAILED,
      };
    default:
      return { nextStatus: null, failureCode: null };
  }
}

export async function startBrhSaleForOnrampOrder(orderId: string): Promise<void> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new OnrampOperationError('On-ramp order id is required.', 400);
  }

  const order = await findOnrampOrderById(normalizedOrderId);
  if (!order) {
    throw new OnrampOperationError('On-ramp order not found.', 404);
  }

  if (order.status === 'brh_sold' || order.status === 'usdc_delivered' || order.status === 'complete') {
    return;
  }

  if (order.status !== 'pix_received' && order.status !== 'needs_review') {
    throw new OnrampOperationError(
      `BRH sale cannot start from on-ramp status "${order.status}".`,
      409,
    );
  }

  const externalId = order.brh_sale_external_id ?? buildOnrampBrhSaleExternalId(order.id);
  const memo = buildBrhSaleMemo(order.id);

  await updateOnrampOrder({
    orderId: order.id,
    expectedStatus: ['pix_received', 'needs_review'],
    patch: {
      brh_sale_external_id: externalId,
    },
  });

  const existing = await findRampOperationByExternalId(externalId);
  if (existing?.ramp_operation_id) {
    await updateOnrampOrder({
      orderId: order.id,
      expectedStatus: ['pix_received', 'needs_review', 'brh_sold'],
      patch: {
        brh_sale_external_id: externalId,
        brh_sale_ramp_operation_id: existing.ramp_operation_id,
      },
    });
    return;
  }

  if (!isRampConfigured()) {
    await markOnrampNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.RAMP_NOT_CONFIGURED,
      'Ramp API não configurada para iniciar a venda de BRH.',
    );
    return;
  }

  let rampAmount: string;
  try {
    rampAmount = formatRampAmountFromBrl(order.amount_brl);
  } catch (error) {
    await markOnrampNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.INVALID_RAMP_AMOUNT,
      `Valor inválido para venda de BRH: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const callbackUrl = getRampCallbackUrl();
  if (!callbackUrl?.startsWith('https://')) {
    await markOnrampNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.INVALID_RAMP_CALLBACK_URL,
      'callbackUrl da Ramp deve ser HTTPS para a venda de BRH.',
    );
    return;
  }

  if (!existing) {
    const pending = await insertRampOperationPending({
      externalId,
      operationType: 'onramp',
      status: 'pending_local',
      amount: rampAmount,
      destination: null,
      memo,
      corpxEventType: order.corpx_event_type ?? undefined,
      corpxProviderTxId: order.corpx_transaction_id ?? order.corpx_txid ?? undefined,
    });

    if (!pending.ok) {
      await markOnrampNeedsReview(
        order.id,
        ONRAMP_FAILURE_CODES.BRH_SALE_PENDING_PERSIST_FAILED,
        `Falha ao persistir operação pendente de BRH sale: ${pending.reason}`,
      );
      return;
    }
  }

  try {
    const created = await createOnrampOperation({
      amount: rampAmount,
      externalId,
      callbackUrl,
      memo,
      assetCode: RAMP_ASSET_BRH,
      category: RAMP_CATEGORY_CLIENT,
    });

    await updateRampOperationAfterCreate({
      externalId,
      rampOperationId: created.id,
      status: created.status,
    });

    await updateOnrampOrder({
      orderId: order.id,
      expectedStatus: ['pix_received', 'needs_review'],
      patch: {
        brh_sale_external_id: externalId,
        brh_sale_ramp_operation_id: created.id,
        ...clearOnrampFailurePatch(),
      },
    });

    console.info('[onramp/brh-sale] accepted', {
      orderId: order.id,
      externalId,
      rampOperationId: created.id,
      status: created.status,
    });
    await logOnrampEvent({
      phase: 'brh_sale_submit',
      status: 'success',
      taxId: order.tax_id,
      amountBrl: order.amount_brl,
      correlationId: order.id,
      metadata: {
        source: 'onramp/brh-sale',
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

    await markOnrampNeedsReview(order.id, ONRAMP_FAILURE_CODES.BRH_SALE_SUBMIT_FAILED, failureReason);

    console.error('[onramp/brh-sale] submit failed', {
      orderId: order.id,
      externalId,
      reason: failureReason,
    });
    await logOnrampEvent({
      phase: 'brh_sale_submit',
      status: 'error',
      taxId: order.tax_id,
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: ONRAMP_FAILURE_CODES.BRH_SALE_SUBMIT_FAILED,
      errorMessage: failureReason,
      metadata: { source: 'onramp/brh-sale', external_id: externalId },
    });
  }
}

export async function applyBrhSaleRampCallback(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  failureReason?: string | null;
}): Promise<void> {
  if (!isOnrampBrhSaleExternalId(input.externalId)) {
    return;
  }

  const order = await findOnrampOrderByBrhSaleExternalId(input.externalId);
  if (!order) {
    console.warn('[onramp/brh-sale] callback received for unknown external id', {
      externalId: input.externalId,
      rampOperationId: input.rampOperationId,
    });
    return;
  }

  const outcome = mapBrhSaleRampStatusToOnrampStatus(input.status);
  if (!outcome.nextStatus) {
    await updateOnrampOrder({
      orderId: order.id,
      expectedStatus: ['pix_received', 'needs_review', 'brh_sold'],
      patch: {
        brh_sale_external_id: input.externalId,
        brh_sale_ramp_operation_id: input.rampOperationId,
      },
    });
    return;
  }

  if (outcome.nextStatus === 'brh_sold') {
    const updated = await markOnrampOrderStatus({
      orderId: order.id,
      status: 'brh_sold',
      expectedStatus: ['pix_received', 'needs_review', 'brh_sold'],
      patch: {
        brh_sale_external_id: input.externalId,
        brh_sale_ramp_operation_id: input.rampOperationId,
        ...clearOnrampFailurePatch(),
      },
    });

    if (!updated.ok) {
      console.error('[onramp/brh-sale] failed to mark brh_sold', {
        orderId: order.id,
        externalId: input.externalId,
        reason: updated.reason,
      });
      return;
    }

    try {
      await startUsdcDeliveryForOnrampOrder(updated.row.id);
    } catch (error) {
      console.error('[onramp/brh-sale] failed to start USDC delivery after BRH sale', {
        orderId: updated.row.id,
        externalId: input.externalId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    await logOnrampEvent({
      phase: 'brh_sale_confirmed',
      status: 'success',
      taxId: updated.row.tax_id,
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      metadata: {
        source: 'onramp/brh-sale-callback',
        external_id: input.externalId,
        ramp_operation_id: input.rampOperationId,
      },
    });

    return;
  }

  const failureReason =
    input.failureReason ?? `Ramp BRH sale returned status "${input.status}".`;

  const updated = await markOnrampOrderStatus({
    orderId: order.id,
    status: outcome.nextStatus,
    expectedStatus: ['pix_received', 'needs_review', 'failed'],
    patch: {
      brh_sale_external_id: input.externalId,
      brh_sale_ramp_operation_id: input.rampOperationId,
      ...buildOnrampFailurePatch({
        code: outcome.failureCode as OnrampFailureCode,
        reason: failureReason,
        needsReview: outcome.nextStatus === 'needs_review',
      }),
    },
  });

  if (!updated.ok) {
    console.error('[onramp/brh-sale] failed to apply callback outcome', {
      orderId: order.id,
      externalId: input.externalId,
      status: input.status,
      reason: updated.reason,
    });
    await logOnrampEvent({
      phase: 'brh_sale_callback',
      status: 'error',
      taxId: order.tax_id,
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: 'ONRAMP_BRH_SALE_CALLBACK_PERSIST_FAILED',
      errorMessage: updated.reason,
      metadata: { source: 'onramp/brh-sale-callback', external_id: input.externalId, status: input.status },
    });
    return;
  }

  await logOnrampEvent({
    phase: 'brh_sale_callback',
    status: 'error',
    taxId: order.tax_id,
    amountBrl: order.amount_brl,
    correlationId: order.id,
    errorCode: outcome.failureCode,
    errorMessage: failureReason,
    metadata: { source: 'onramp/brh-sale-callback', external_id: input.externalId, status: input.status },
  });
}
