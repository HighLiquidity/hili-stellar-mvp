import { insertFiatOperationEvent } from './log-event';
import type { FiatOperationActor } from './types';

const PHASE = 'qr_generate';

export type FiatDepositLogResult =
  | {
      ok: true;
      providerTxId: string;
      expiresAt: string | null;
      pixCopyPaste: string;
    }
  | {
      ok: false;
      code: string;
      message?: string;
      maxDepositBrl?: string;
    };

export async function logFiatDepositQrAttempt(input: {
  taxId: string;
  amountInput: string;
  amountBrl?: string | null;
  actor?: FiatOperationActor;
  result: FiatDepositLogResult;
}): Promise<void> {
  const { result, actor, taxId, amountInput } = input;
  const amountBrl = input.amountBrl ?? null;

  await insertFiatOperationEvent({
    operation: 'fiat_deposit',
    phase: PHASE,
    status: result.ok ? 'success' : 'error',
    errorCode: result.ok ? null : result.code,
    errorMessage: result.ok ? null : (result.message ?? null),
    actorEmail: actor?.email,
    actorUserId: actor?.userId,
    taxId: taxId.trim(),
    amountBrl,
    providerTxId: result.ok ? result.providerTxId : null,
    correlationId: null,
    metadata: {
      amount_input: amountInput.trim(),
      ...(result.ok
        ? {
            expires_at: result.expiresAt,
            pix_payload_length: result.pixCopyPaste?.length ?? 0,
          }
        : {
            max_deposit_brl: result.maxDepositBrl ?? null,
          }),
    },
  });
}
