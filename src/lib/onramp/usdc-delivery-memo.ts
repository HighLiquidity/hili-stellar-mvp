import '@/lib/server/only';

import { truncateUtf8Bytes } from '@/lib/ramp/memo';

import type { OnrampOrderRow } from './order-store';

const STELLAR_TEXT_MEMO_MAX_BYTES = 28;

function buildUsdcDeliveryCorrelationMemo(orderId: string): string {
  return `client-usdc:${orderId}`.slice(0, STELLAR_TEXT_MEMO_MAX_BYTES);
}

/** Memo sent to Ramp for USDC payout: user memo when provided, else order correlation id. */
export function resolveOnrampUsdcDeliveryMemo(order: Pick<OnrampOrderRow, 'id' | 'destination_memo'>): string {
  const userMemo = order.destination_memo?.trim();
  if (userMemo) {
    return truncateUtf8Bytes(userMemo, STELLAR_TEXT_MEMO_MAX_BYTES);
  }

  return buildUsdcDeliveryCorrelationMemo(order.id);
}
