import type { WebhookProcessingResult } from '@/lib/corpx/webhooks/types';
import { settleInboundPixFromWebhook } from '@/lib/deposit/settle-inbound-pix';

/**
 * When CorpX confirms inbound PIX (dynamic QR paid or PIX in), credit BRH and trigger on-ramp.
 * @deprecated Import {@link settleInboundPixFromWebhook} directly — kept for webhook route compatibility.
 */
export async function onConfirmedPixInboundSettlement(opts: {
  dedupeKey: string;
  eventType: string;
  payload: unknown;
  result: WebhookProcessingResult;
}): Promise<void> {
  await settleInboundPixFromWebhook(opts);
}
