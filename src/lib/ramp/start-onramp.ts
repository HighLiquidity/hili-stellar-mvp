import { buildOnrampExternalId, formatRampAmountFromBrl } from './amount';
import { createOnrampOperation, RampApiError } from './client';
import { getRampCallbackUrl, isRampConfigured } from './config';
import { buildOnrampMemo } from './memo';
import { RAMP_ASSET_BRH, RAMP_CATEGORY_CLIENT } from './requests';
import {
  findRampOperationByExternalId,
  insertRampOperationPending,
  markRampOperationSkipped,
  updateRampOperationAfterCreate,
  updateRampOperationFailed,
} from './operation-store';

export type StartOnrampInput = {
  amountBrl: string;
  providerTxId?: string;
  corpxEventType: string;
  corpxDedupeKey: string;
};

/**
 * After fiat PIX settlement, request BRS on-ramp via the provider (custodial mint).
 * Destination wallet is managed by the provider — we only call the API and track callbacks.
 */
export async function startOnrampAfterPixSettlement(input: StartOnrampInput): Promise<void> {
  const externalId = buildOnrampExternalId(input.providerTxId, input.corpxDedupeKey);

  if (!isRampConfigured()) {
    await markRampOperationSkipped({
      externalId,
      operationType: 'onramp',
      amount: input.amountBrl,
      reason: 'Ramp API não configurada (RAMP_API_BASE_URL, RAMP_API_KEY, callback URL).',
      corpxEventType: input.corpxEventType,
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.corpxDedupeKey,
    });
    console.info('[ramp/onramp] skipped — Ramp env not configured', { externalId });
    return;
  }

  let rampAmount: string;
  try {
    rampAmount = formatRampAmountFromBrl(input.amountBrl);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await markRampOperationSkipped({
      externalId,
      operationType: 'onramp',
      amount: input.amountBrl,
      reason: `Valor inválido para on-ramp: ${reason}`,
      corpxEventType: input.corpxEventType,
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.corpxDedupeKey,
    });
    return;
  }

  const callbackUrl = getRampCallbackUrl();
  if (!callbackUrl?.startsWith('https://')) {
    await markRampOperationSkipped({
      externalId,
      operationType: 'onramp',
      amount: input.amountBrl,
      reason: 'callbackUrl deve ser HTTPS (configure RAMP_CALLBACK_URL ou NEXT_PUBLIC_SITE_URL).',
      corpxEventType: input.corpxEventType,
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.corpxDedupeKey,
    });
    return;
  }

  const memo = buildOnrampMemo(input.providerTxId, input.corpxDedupeKey);

  const existing = await findRampOperationByExternalId(externalId);
  if (existing?.ramp_operation_id) {
    console.info('[ramp/onramp] already submitted', {
      externalId,
      rampOperationId: existing.ramp_operation_id,
      status: existing.status,
    });
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
      corpxEventType: input.corpxEventType,
      corpxProviderTxId: input.providerTxId,
      corpxDedupeKey: input.corpxDedupeKey,
    });

    if (!pending.ok) {
      console.error('[ramp/onramp] failed to persist pending row', pending.reason);
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

    console.info('[ramp/onramp] accepted', {
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

    console.error('[ramp/onramp] API call failed', failureReason);
  }
}
