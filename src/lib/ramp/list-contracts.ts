/** Shared list/summary types for on-ramp and off-ramp order screens (client-safe). */

export type RampOrderFlow = 'onramp' | 'offramp';

export type RampOrderListItem = {
  flow: RampOrderFlow;
  orderId: string;
  status: string;
  amountBrl: string;
  amountUsdc: string;
  createdAt: string;
  updatedAt: string;
  quotedAt: string;
  pixReceivedAt: string | null;
  pixSentAt: string | null;
  usdcDeliveredAt: string | null;
  counterpartLabel: string | null;
};

export type RampOrdersListResponse = {
  orders: RampOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type RampOrdersListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};
