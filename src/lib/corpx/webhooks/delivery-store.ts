import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { WebhookProcessingResult } from './types';
import { pickString, unwrapWebhookPayload } from './payload-fields';

export const CORPX_WEBHOOK_DELIVERIES_TABLE = 'corpx_webhook_deliveries';

export async function recordCorpXWebhookDelivery(input: {
  dedupeKey: string;
  eventType: string;
  clientIp: string;
  duplicateDelivery: boolean;
  payload: unknown;
  result: WebhookProcessingResult;
  settled: boolean;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const data = unwrapWebhookPayload(input.payload);
  const corpxTxid = pickString(data, 'txid', 'txId') ?? null;
  const providerTxId =
    input.result.providerTxId ?? pickString(data, 'transactionId', 'transaction_id') ?? null;

  const { error } = await admin.from(CORPX_WEBHOOK_DELIVERIES_TABLE).insert({
    dedupe_key: input.dedupeKey,
    event_type: input.eventType,
    client_ip: input.clientIp,
    duplicate_delivery: input.duplicateDelivery,
    processed_status: input.result.status,
    settled: input.settled,
    error_message: input.result.errorMessage ?? null,
    provider_tx_id: providerTxId,
    corpx_txid: corpxTxid,
    payload: input.payload ?? {},
    result: input.result,
  });

  if (error) {
    console.error('[corpx/webhook] delivery log insert failed', error.message);
  }
}
