import '@/lib/server/only';

import { formatRampAmountFromBrl } from './amount';
import { createOfframpOperation, getRampOperation, RampApiError } from './client';
import {
  findRampOperationByExternalId,
  insertRampOperationPending,
  updateRampOperationAfterCreate,
} from './operation-store';
import { RAMP_ASSET_USDC, RAMP_CATEGORY_CLIENT } from './requests';
import type { RampOfframpClassicDepositResponse, RampOfframpCreateResponse } from './types';

export type OfframpUsdcDepositInstructions = {
  rampOperationId: string;
  status: string;
  depositAddress: string;
  memo: string;
  expiresAt: string;
};

function isClassicDepositResponse(
  response: RampOfframpCreateResponse,
): response is RampOfframpClassicDepositResponse {
  return typeof (response as RampOfframpClassicDepositResponse).depositAddress === 'string';
}

function readClassicDepositFromDocument(input: {
  id: string;
  status: string;
  depositAddress?: string;
  memo?: string;
  expiresAt?: string;
}): OfframpUsdcDepositInstructions | null {
  const depositAddress = input.depositAddress?.trim();
  const memo = input.memo?.trim();
  const expiresAt = input.expiresAt?.trim();

  if (!depositAddress || !memo || !expiresAt) {
    return null;
  }

  return {
    rampOperationId: input.id,
    status: input.status,
    depositAddress,
    memo,
    expiresAt,
  };
}

async function resolveClassicDepositInstructions(
  rampOperationId: string,
  initial?: RampOfframpCreateResponse,
): Promise<OfframpUsdcDepositInstructions> {
  if (initial && isClassicDepositResponse(initial)) {
    const fromCreate = readClassicDepositFromDocument(initial);
    if (fromCreate) {
      return fromCreate;
    }
  }

  const document = await getRampOperation(rampOperationId);
  const fromDocument = readClassicDepositFromDocument({
    id: document.id,
    status: document.status,
    depositAddress: document.depositAddress,
    memo: document.memo,
    expiresAt: document.expiresAt,
  });

  if (!fromDocument) {
    throw new RampApiError(
      'invalid_response',
      0,
      'Ramp off-ramp USDC response is missing depositAddress, memo, or expiresAt.',
    );
  }

  return fromDocument;
}

/**
 * Creates (or replays) a USDC client off-ramp and returns deposit instructions from the API.
 */
export async function ensureOfframpUsdcDepositOperation(input: {
  externalId: string;
  callbackUrl: string;
  amountUsdc: string;
}): Promise<OfframpUsdcDepositInstructions> {
  const externalId = input.externalId.trim();
  const callbackUrl = input.callbackUrl.trim();
  const amount = formatRampAmountFromBrl(input.amountUsdc);

  const existing = await findRampOperationByExternalId(externalId);
  if (existing?.ramp_operation_id) {
    return resolveClassicDepositInstructions(existing.ramp_operation_id);
  }

  if (!existing) {
    const pending = await insertRampOperationPending({
      externalId,
      operationType: 'offramp',
      status: 'pending_local',
      amount,
    });

    if (!pending.ok) {
      throw new Error(`Failed to persist pending off-ramp USDC deposit: ${pending.reason}`);
    }
  }

  const created = await createOfframpOperation({
    externalId,
    callbackUrl,
    amount,
    assetCode: RAMP_ASSET_USDC,
    category: RAMP_CATEGORY_CLIENT,
    depositMethod: 'classic',
  });

  if (created.depositMethod === 'soroban') {
    throw new RampApiError(
      'invalid_request',
      400,
      'Soroban USDC deposits are not supported in this flow.',
    );
  }

  await updateRampOperationAfterCreate({
    externalId,
    rampOperationId: created.id,
    status: created.status,
  });

  return resolveClassicDepositInstructions(
    created.id,
    isClassicDepositResponse(created) ? created : undefined,
  );
}
