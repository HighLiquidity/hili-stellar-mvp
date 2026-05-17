import { buildOfframpExternalId, formatRampAmountFromBrl } from './amount';
import { createOfframpOperation, RampApiError } from './client';
import { getRampCallbackUrl, isRampConfigured } from './config';
import {
  findRampOperationByExternalId,
  insertRampOperationPending,
  markRampOperationSkipped,
  updateRampOperationAfterCreate,
  updateRampOperationFailed,
} from './operation-store';

export type StartOfframpInput = {
  amountBrl: string;
  idempotencyKey: string;
  providerTxId?: string;
  e2eId?: string;
};

/**
 * After fiat PIX withdraw succeeds, request custodial BRH off-ramp (provider burns from pooled wallet).
 */
export async function startOfframpAfterWithdraw(input: StartOfframpInput): Promise<void> {
  let externalId: string;
  try {
    externalId = buildOfframpExternalId(input.idempotencyKey);
  } catch (e) {
    console.error('[ramp/offramp] invalid external id', e);
    return;
  }

  if (!isRampConfigured()) {
    await markRampOperationSkipped({
      externalId,
      operationType: 'offramp',
      amount: input.amountBrl,
      reason: 'Ramp API não configurada (RAMP_API_BASE_URL, RAMP_API_KEY, callback URL).',
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.idempotencyKey,
    });
    console.info('[ramp/offramp] skipped — Ramp env not configured', { externalId });
    return;
  }

  let rampAmount: string;
  try {
    rampAmount = formatRampAmountFromBrl(input.amountBrl);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await markRampOperationSkipped({
      externalId,
      operationType: 'offramp',
      amount: input.amountBrl,
      reason: `Valor inválido para off-ramp: ${reason}`,
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.idempotencyKey,
    });
    return;
  }

  const callbackUrl = getRampCallbackUrl();
  if (!callbackUrl?.startsWith('https://')) {
    await markRampOperationSkipped({
      externalId,
      operationType: 'offramp',
      amount: input.amountBrl,
      reason: 'callbackUrl deve ser HTTPS (configure RAMP_CALLBACK_URL ou NEXT_PUBLIC_SITE_URL).',
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.idempotencyKey,
    });
    return;
  }

  const existing = await findRampOperationByExternalId(externalId);
  if (existing?.ramp_operation_id) {
    console.info('[ramp/offramp] already submitted', {
      externalId,
      rampOperationId: existing.ramp_operation_id,
      status: existing.status,
    });
    return;
  }

  if (!existing) {
    const pending = await insertRampOperationPending({
      externalId,
      operationType: 'offramp',
      status: 'pending_local',
      amount: rampAmount,
      destination: null,
      memo: input.e2eId ? `pix-e2e:${input.e2eId.slice(0, 20)}` : null,
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.idempotencyKey,
    });

    if (!pending.ok) {
      console.error('[ramp/offramp] failed to persist pending row', pending.reason);
      return;
    }
  }

  try {
    const created = await createOfframpOperation({
      amount: rampAmount,
      externalId,
      callbackUrl,
    });

    await updateRampOperationAfterCreate({
      externalId,
      rampOperationId: created.id,
      status: created.status,
    });

    console.info('[ramp/offramp] accepted', {
      externalId,
      rampOperationId: created.id,
      status: created.status,
    });
  } catch (e) {
    const failureReason =
      e instanceof RampApiError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);

    await updateRampOperationFailed({
      externalId,
      status: 'failed',
      failureReason,
    });

    console.error('[ramp/offramp] API call failed', failureReason);
  }
}
