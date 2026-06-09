import type { OfframpOrderResponse } from '@/lib/offramp/contracts';
import type { OnrampOrderResponse } from '@/lib/onramp/read';

export type PublicOnrampOrderResponse = {
  orderId: string;
  externalId: string | null;
  status: OnrampOrderResponse['status'];
  quote: OnrampOrderResponse['quote'];
  destination: OnrampOrderResponse['destination'];
  pix: {
    copyPaste: string;
    qrDataUrl: string;
    expiresAt: string | null;
    paidAt: string | null;
  } | null;
  timeline: OnrampOrderResponse['timeline'];
  failure: {
    code: string | null;
    reason: string | null;
  } | null;
};

export type PublicOfframpOrderResponse = {
  orderId: string;
  externalId: string | null;
  status: OfframpOrderResponse['status'];
  quote: OfframpOrderResponse['quote'];
  payout: {
    key: string;
    beneficiaryName: string | null;
    endToEndId: string | null;
  };
  deposit: {
    address: string;
    memo: string | null;
    expiresAt: string | null;
    receivedAmount: string | null;
    txHash: string | null;
  } | null;
  timeline: OfframpOrderResponse['timeline'];
  failure: {
    code: string | null;
    reason: string | null;
  } | null;
};

export type PublicV1OrderListItem = {
  orderId: string;
  externalId: string | null;
  status: string;
  amountBrl: string;
  amountUsdc: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicV1OrdersListResponse = {
  orders: PublicV1OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export function toPublicOnrampOrderResponse(order: OnrampOrderResponse, externalId: string | null): PublicOnrampOrderResponse {
  return {
    orderId: order.orderId,
    externalId,
    status: order.status,
    quote: order.quote,
    destination: order.destination,
    pix: order.pix
      ? {
          copyPaste: order.pix.copyPaste,
          qrDataUrl: order.pix.qrDataUrl,
          expiresAt: order.pix.expiresAt,
          paidAt: order.pix.paidAt,
        }
      : null,
    timeline: order.timeline,
    failure: order.failure
      ? {
          code: order.failure.code,
          reason: order.failure.reason,
        }
      : null,
  };
}

export function toPublicOfframpOrderResponse(
  order: OfframpOrderResponse,
  externalId: string | null,
): PublicOfframpOrderResponse {
  return {
    orderId: order.orderId,
    externalId,
    status: order.status,
    quote: order.quote,
    payout: {
      key: order.payout.key,
      beneficiaryName: order.payout.beneficiaryName,
      endToEndId: order.payout.endToEndId,
    },
    deposit: order.deposit
      ? {
          address: order.deposit.address,
          memo: order.deposit.memo,
          expiresAt: order.deposit.expiresAt,
          receivedAmount: order.deposit.receivedAmount,
          txHash: order.deposit.txHash,
        }
      : null,
    timeline: order.timeline,
    failure: order.failure
      ? {
          code: order.failure.code,
          reason: order.failure.reason,
        }
      : null,
  };
}
