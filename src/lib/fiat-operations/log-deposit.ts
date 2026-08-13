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

export const UNMATCHED_INBOUND_PIX_CODE = 'UNMATCHED_INBOUND_PIX';

/** Audit-only: inbound PIX with no pending charge and no on-ramp order. Never credits BRH. */
export async function logUnmatchedInboundPix(input: {
  eventType: string;
  amountBrl?: string | null;
  providerTxId?: string | null;
  e2eId?: string | null;
  taxId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await insertFiatOperationEvent({
    operation: 'fiat_deposit',
    phase: 'unmatched_pix_in',
    status: 'error',
    errorCode: UNMATCHED_INBOUND_PIX_CODE,
    errorMessage:
      'Inbound PIX did not match a pending deposit charge or locked on-ramp order. BRH was not credited.',
    taxId: input.taxId ?? null,
    amountBrl: input.amountBrl ?? null,
    providerTxId: input.providerTxId ?? null,
    e2eId: input.e2eId ?? null,
    metadata: {
      source: 'deposit/settle-inbound-pix',
      event_type: input.eventType,
      ...input.metadata,
    },
  });
}
