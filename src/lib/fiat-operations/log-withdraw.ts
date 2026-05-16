import { fingerprintPixEmv, insertFiatOperationEvent } from './log-event';
import type { FiatOperationActor } from './types';

const PHASE = 'withdraw_submit';

export type FiatWithdrawLogResult =
  | {
      ok: true;
      stage: string;
      amountBrl: string;
      beneficiaryName?: string | null;
      providerTxId?: string;
      e2eId?: string;
      cashOutStatus?: string;
      burnSkipped?: boolean;
      corpxSkipped?: boolean;
      message?: string;
    }
  | {
      ok: false;
      code: string;
      message?: string;
      maxWithdrawBrl?: string;
    };

export async function logFiatWithdrawAttempt(input: {
  paymentQrCode: string;
  amountInput: string;
  amountBrl?: string | null;
  beneficiaryName?: string | null;
  brhBalanceBefore?: string | null;
  actor?: FiatOperationActor;
  result: FiatWithdrawLogResult;
  idempotencyKey?: string | null;
}): Promise<void> {
  const { result, actor, paymentQrCode, amountInput } = input;
  const emvFp = fingerprintPixEmv(paymentQrCode);

  await insertFiatOperationEvent({
    operation: 'fiat_withdraw',
    phase: PHASE,
    status: result.ok ? 'success' : 'error',
    errorCode: result.ok ? null : result.code,
    errorMessage: result.ok ? (result.message ?? null) : (result.message ?? null),
    actorEmail: actor?.email,
    actorUserId: actor?.userId,
    amountBrl: result.ok ? result.amountBrl : (input.amountBrl ?? null),
    providerTxId: result.ok ? (result.providerTxId ?? null) : null,
    e2eId: result.ok ? (result.e2eId ?? null) : null,
    idempotencyKey: input.idempotencyKey ?? null,
    beneficiaryName: result.ok
      ? (result.beneficiaryName ?? input.beneficiaryName ?? null)
      : (input.beneficiaryName ?? null),
    stage: result.ok ? result.stage : null,
    brhBalanceBefore: input.brhBalanceBefore ?? null,
    metadata: {
      amount_input: amountInput.trim(),
      emv_fingerprint: emvFp,
      emv_length: paymentQrCode.trim().length,
      ...(result.ok
        ? {
            burn_skipped: result.burnSkipped ?? false,
            corpx_skipped: result.corpxSkipped ?? false,
            cash_out_status: result.cashOutStatus ?? null,
          }
        : {
            max_withdraw_brl: result.maxWithdrawBrl ?? null,
          }),
    },
  });
}
