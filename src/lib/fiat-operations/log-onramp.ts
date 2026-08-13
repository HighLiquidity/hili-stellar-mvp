import { insertFiatOperationEvent } from './log-event';
import type { FiatOperationActor, FiatOperationStatus } from './types';

export function actorFromOnrampOrder(order: {
  created_by_email?: string | null;
  created_by_user_id?: string | null;
}): FiatOperationActor {
  return {
    email: order.created_by_email,
    userId: order.created_by_user_id,
  };
}

export async function logOnrampEvent(input: {
  phase: string;
  status: FiatOperationStatus;
  actor?: FiatOperationActor;
  taxId?: string | null;
  amountBrl?: string | null;
  providerTxId?: string | null;
  correlationId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await insertFiatOperationEvent({
    operation: 'fiat_onramp',
    phase: input.phase,
    status: input.status,
    actorEmail: input.actor?.email,
    actorUserId: input.actor?.userId,
    taxId: input.taxId ?? null,
    amountBrl: input.amountBrl ?? null,
    providerTxId: input.providerTxId ?? null,
    correlationId: input.correlationId ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    metadata: input.metadata ?? {},
  });
}
