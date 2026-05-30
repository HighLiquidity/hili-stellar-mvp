import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createCorpXAdapterFromEnvMock,
  getTransferStatusMock,
  findOfframpOrderByIdMock,
  markOfframpOrderStatusMock,
  confirmOfframpPixPayoutMock,
  retryOfframpReconciliationMock,
} = vi.hoisted(() => ({
  createCorpXAdapterFromEnvMock: vi.fn(),
  getTransferStatusMock: vi.fn(),
  findOfframpOrderByIdMock: vi.fn(),
  markOfframpOrderStatusMock: vi.fn(),
  confirmOfframpPixPayoutMock: vi.fn(),
  retryOfframpReconciliationMock: vi.fn(),
}));

vi.mock('@/lib/corpx/adapter', () => ({
  createCorpXAdapterFromEnv: createCorpXAdapterFromEnvMock,
}));

vi.mock('./order-store', () => ({
  findOfframpOrderById: findOfframpOrderByIdMock,
  markOfframpOrderStatus: markOfframpOrderStatusMock,
}));

vi.mock('./pix-payout-webhook', () => ({
  confirmOfframpPixPayout: confirmOfframpPixPayoutMock,
}));

vi.mock('./reconciliation', () => ({
  retryOfframpReconciliation: retryOfframpReconciliationMock,
}));

import { syncOfframpPixPayoutFromCorpX } from './pix-payout-sync';

const ORDER_ID = 'order-123';

describe('syncOfframpPixPayoutFromCorpX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCorpXAdapterFromEnvMock.mockResolvedValue({
      pix: { getTransferStatus: getTransferStatusMock },
    });
    retryOfframpReconciliationMock.mockResolvedValue({ accepted: true, orderId: ORDER_ID });
    findOfframpOrderByIdMock.mockResolvedValue(null);
  });

  it('promotes order to pix_sent when CorpX transfer is completed', async () => {
    const order = {
      id: ORDER_ID,
      status: 'usdc_received',
      amount_brl: '100.00',
      payout_end_to_end_id: 'E2E-123',
      payout_provider_tx_id: null,
    };

    getTransferStatusMock.mockResolvedValue({
      providerTxId: 'txn-123',
      e2eId: 'E2E-123',
      status: 'completed',
      updatedAt: '2026-05-28T00:00:00Z',
    });

    confirmOfframpPixPayoutMock.mockResolvedValue({
      ...order,
      status: 'pix_sent',
      payout_provider_tx_id: 'txn-123',
    });

    findOfframpOrderByIdMock.mockResolvedValue({
      ...order,
      status: 'pix_sent',
      payout_provider_tx_id: 'txn-123',
    });

    const result = await syncOfframpPixPayoutFromCorpX(order as never);

    expect(confirmOfframpPixPayoutMock).toHaveBeenCalledWith(order, {
      providerTxId: 'txn-123',
      endToEndId: 'E2E-123',
      source: 'offramp/pix-sync',
    });
    expect(retryOfframpReconciliationMock).toHaveBeenCalledWith(ORDER_ID);
    expect(result.status).toBe('pix_sent');
  });

  it('does nothing when order has no end-to-end id', async () => {
    const order = {
      id: ORDER_ID,
      status: 'usdc_received',
      payout_end_to_end_id: null,
    };

    const result = await syncOfframpPixPayoutFromCorpX(order as never);

    expect(createCorpXAdapterFromEnvMock).not.toHaveBeenCalled();
    expect(result).toBe(order);
  });
});
