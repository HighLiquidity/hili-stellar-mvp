import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findOfframpOrderByIdMock,
  findOfframpOrderByPayoutProviderTxIdMock,
  findOfframpOrderByPayoutEndToEndIdMock,
  markOfframpOrderStatusMock,
  retryOfframpReconciliationMock,
  logOfframpEventMock,
} = vi.hoisted(() => ({
  findOfframpOrderByIdMock: vi.fn(),
  findOfframpOrderByPayoutProviderTxIdMock: vi.fn(),
  findOfframpOrderByPayoutEndToEndIdMock: vi.fn(),
  markOfframpOrderStatusMock: vi.fn(),
  retryOfframpReconciliationMock: vi.fn(),
  logOfframpEventMock: vi.fn(),
}));

vi.mock('./order-store', () => ({
  findOfframpOrderById: findOfframpOrderByIdMock,
  findOfframpOrderByPayoutProviderTxId: findOfframpOrderByPayoutProviderTxIdMock,
  findOfframpOrderByPayoutEndToEndId: findOfframpOrderByPayoutEndToEndIdMock,
  markOfframpOrderStatus: markOfframpOrderStatusMock,
}));

vi.mock('./reconciliation', () => ({
  retryOfframpReconciliation: retryOfframpReconciliationMock,
}));

vi.mock('@/lib/fiat-operations/log-offramp', () => ({
  logOfframpEvent: logOfframpEventMock,
}));

import {
  orderIdMatchesCorpXPixIdentifier,
  resolveOfframpOrderFromPixOutWebhook,
  settleOutboundPixFromWebhook,
} from './pix-payout-webhook';

const ORDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('offramp pix payout webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOfframpOrderByPayoutProviderTxIdMock.mockResolvedValue(null);
    findOfframpOrderByPayoutEndToEndIdMock.mockResolvedValue(null);
    findOfframpOrderByIdMock.mockResolvedValue(null);
    retryOfframpReconciliationMock.mockResolvedValue({ accepted: true, orderId: ORDER_ID });
  });

  it('matches compact CorpX identifier to order id', () => {
    expect(orderIdMatchesCorpXPixIdentifier(ORDER_ID, 'a1b2c3d4e5f67890abcdef1234567890')).toBe(true);
    expect(orderIdMatchesCorpXPixIdentifier(ORDER_ID, ORDER_ID)).toBe(true);
  });

  it('resolves order by payout provider tx id', async () => {
    const row = { id: ORDER_ID, status: 'usdc_received', amount_brl: '100.00' };
    findOfframpOrderByPayoutProviderTxIdMock.mockResolvedValue(row);

    const order = await resolveOfframpOrderFromPixOutWebhook({
      payload: { transactionId: 'tx-out-1' },
      result: {
        eventType: 'pix_out_completed',
        status: 'completed',
        providerTxId: 'tx-out-1',
        requiresAction: 'mark_settlement_complete',
      },
    });

    expect(order?.id).toBe(ORDER_ID);
  });

  it('resolves order by off-ramp payout reference description', async () => {
    const row = { id: ORDER_ID, status: 'usdc_received', amount_brl: '100.00' };
    findOfframpOrderByIdMock.mockResolvedValue(row);

    const order = await resolveOfframpOrderFromPixOutWebhook({
      payload: {
        transactionId: 'tx-out-2',
        description: `offramp-pix:${ORDER_ID}`,
      },
      result: {
        eventType: 'pix_out_completed',
        status: 'completed',
        providerTxId: 'tx-out-2',
        requiresAction: 'mark_settlement_complete',
      },
    });

    expect(order?.id).toBe(ORDER_ID);
  });

  it('marks pix_sent and continues reconciliation on completed webhook', async () => {
    const row = {
      id: ORDER_ID,
      status: 'usdc_received',
      amount_brl: '100.00',
      payout_reference: null,
    };
    findOfframpOrderByPayoutProviderTxIdMock.mockResolvedValue(row);
    markOfframpOrderStatusMock.mockResolvedValue({
      ok: true,
      row: {
        ...row,
        status: 'pix_sent',
        payout_provider_tx_id: 'tx-out-3',
        payout_end_to_end_id: 'E2E-3',
      },
    });

    const settled = await settleOutboundPixFromWebhook({
      dedupeKey: 'dedupe-1',
      eventType: 'pix_out_completed',
      payload: { transactionId: 'tx-out-3', endToEndId: 'E2E-3', amount: 100 },
      result: {
        eventType: 'pix_out_completed',
        status: 'completed',
        providerTxId: 'tx-out-3',
        requiresAction: 'mark_settlement_complete',
        updatedFields: { amount: '100.00', end_to_end_id: 'E2E-3' },
      },
    });

    expect(settled).toBe(true);
    expect(markOfframpOrderStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: ORDER_ID,
        status: 'pix_sent',
      }),
    );
    expect(retryOfframpReconciliationMock).toHaveBeenCalledWith(ORDER_ID);
  });
});
