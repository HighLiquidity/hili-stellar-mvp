import '@/lib/server/only';

import { insertFiatOperationEvent } from './log-event';
import type { FiatOperationActor, FiatOperationStatus } from './types';

export async function logOfframpEvent(input: {
  phase: string;
  status: FiatOperationStatus;
  actor?: FiatOperationActor;
  amountBrl?: string | null;
  correlationId?: string | null;
  providerTxId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await insertFiatOperationEvent({
    operation: 'fiat_withdraw',
    phase: input.phase,
    status: input.status,
    actorEmail: input.actor?.email,
    actorUserId: input.actor?.userId,
    amountBrl: input.amountBrl ?? null,
    providerTxId: input.providerTxId ?? null,
    correlationId: input.correlationId ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  });
}
