import { insertFiatOperationEvent } from './log-event';
import type { FiatOperationActor } from './types';

/** Audit: inbound PIX matched a Binance→CorpX treasury run. Never credits BRH. */
export async function logTreasuryInboundPix(input: {
  eventType: string;
  amountBrl?: string | null;
  providerTxId?: string | null;
  e2eId?: string | null;
  correlationId: string;
  actor?: FiatOperationActor;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await insertFiatOperationEvent({
    operation: 'treasury_transfer',
    phase: 'binance_brl_to_corpx_pix_in',
    status: 'success',
    actorEmail: input.actor?.email,
    actorUserId: input.actor?.userId,
    amountBrl: input.amountBrl ?? null,
    providerTxId: input.providerTxId ?? null,
    e2eId: input.e2eId ?? null,
    correlationId: input.correlationId,
    metadata: {
      source: 'deposit/settle-inbound-pix',
      event_type: input.eventType,
      kind: 'binance_brl_to_corpx',
      ...input.metadata,
    },
  });
}
