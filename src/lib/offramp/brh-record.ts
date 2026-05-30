import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { formatRampAmountFromBrl } from '@/lib/ramp/amount';
import { createOfframpOperation, createOnrampOperation, RampApiError } from '@/lib/ramp/client';
import { getRampCallbackUrl, isRampConfigured } from '@/lib/ramp/config';
import {
  findRampOperationByExternalId,
  insertRampOperationPending,
  updateRampOperationAfterCreate,
  updateRampOperationFailed,
} from '@/lib/ramp/operation-store';
import { RAMP_ASSET_BRH, RAMP_CATEGORY_CLIENT } from '@/lib/ramp/requests';

import { OFFRAMP_FAILURE_CODES } from './failure-codes';
import type { OfframpOrderRow } from './order-store';
import { buildOfframpBrhIssueExternalId, buildOfframpBrhRedemptionExternalId } from './references';

function normalizeRampFailureReason(error: unknown): string {
  return error instanceof RampApiError
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
}

async function submitRampOperation(input: {
  externalId: string;
  callbackUrl: string;
  amountBrl: string;
  operationType: 'onramp' | 'offramp';
  create: () => Promise<{ id: string; status: string }>;
}): Promise<{ rampOperationId: string; status: string } | null> {
  const existing = await findRampOperationByExternalId(input.externalId);
  if (existing?.ramp_operation_id) {
    return {
      rampOperationId: existing.ramp_operation_id,
      status: existing.status,
    };
  }

  let rampAmount: string;
  try {
    rampAmount = formatRampAmountFromBrl(input.amountBrl);
  } catch (error) {
    throw new Error(`Invalid BRL amount for BRH record: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!existing) {
    const pending = await insertRampOperationPending({
      externalId: input.externalId,
      operationType: input.operationType,
      status: 'pending_local',
      amount: rampAmount,
    });

    if (!pending.ok) {
      throw new Error(`Failed to persist pending BRH record operation: ${pending.reason}`);
    }
  }

  try {
    const created = await input.create();

    await updateRampOperationAfterCreate({
      externalId: input.externalId,
      rampOperationId: created.id,
      status: created.status,
    });

    return { rampOperationId: created.id, status: created.status };
  } catch (error) {
    const reason = normalizeRampFailureReason(error);
    await updateRampOperationFailed({
      externalId: input.externalId,
      status: 'failed',
      failureReason: reason,
    });
    throw new Error(reason);
  }
}

export async function startOfframpBrhIssueForOrder(order: OfframpOrderRow): Promise<{
  externalId: string;
  rampOperationId: string;
  status: string;
}> {
  const externalId = order.brh_issue_external_id ?? buildOfframpBrhIssueExternalId(order.id);
  const callbackUrl = getRampCallbackUrl();

  if (!isRampConfigured()) {
    throw new Error('Ramp API is not configured for off-ramp BRH issue.');
  }

  if (!callbackUrl?.startsWith('https://')) {
    throw new Error('Ramp callbackUrl must be HTTPS for off-ramp BRH issue.');
  }

  const submitted = await submitRampOperation({
    externalId,
    callbackUrl,
    amountBrl: order.amount_brl,
    operationType: 'onramp',
    create: () =>
      createOnrampOperation({
        amount: formatRampAmountFromBrl(order.amount_brl),
        externalId,
        callbackUrl,
        assetCode: RAMP_ASSET_BRH,
        category: RAMP_CATEGORY_CLIENT,
      }),
  });

  if (!submitted) {
    throw new Error('Failed to submit off-ramp BRH issue operation.');
  }

  await logOfframpEvent({
    phase: 'brh_issue_submit',
    status: 'success',
    amountBrl: order.amount_brl,
    correlationId: order.id,
    metadata: {
      source: 'offramp/brh-record',
      external_id: externalId,
      ramp_operation_id: submitted.rampOperationId,
    },
  });

  return { externalId, ...submitted };
}

export async function startOfframpBrhRedemptionForOrder(order: OfframpOrderRow): Promise<{
  externalId: string;
  rampOperationId: string;
  status: string;
}> {
  const externalId = order.brh_redemption_external_id ?? buildOfframpBrhRedemptionExternalId(order.id);
  const callbackUrl = getRampCallbackUrl();

  if (!isRampConfigured()) {
    throw new Error('Ramp API is not configured for off-ramp BRH redemption.');
  }

  if (!callbackUrl?.startsWith('https://')) {
    throw new Error('Ramp callbackUrl must be HTTPS for off-ramp BRH redemption.');
  }

  const submitted = await submitRampOperation({
    externalId,
    callbackUrl,
    amountBrl: order.amount_brl,
    operationType: 'offramp',
    create: () =>
      createOfframpOperation({
        amount: formatRampAmountFromBrl(order.amount_brl),
        externalId,
        callbackUrl,
        assetCode: RAMP_ASSET_BRH,
        category: RAMP_CATEGORY_CLIENT,
      }),
  });

  if (!submitted) {
    throw new Error('Failed to submit off-ramp BRH redemption operation.');
  }

  await logOfframpEvent({
    phase: 'brh_redemption_submit',
    status: 'success',
    amountBrl: order.amount_brl,
    correlationId: order.id,
    metadata: {
      source: 'offramp/brh-record',
      external_id: externalId,
      ramp_operation_id: submitted.rampOperationId,
    },
  });

  return { externalId, ...submitted };
}
