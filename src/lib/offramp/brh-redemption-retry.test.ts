import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findOfframpOrderByIdMock,
  markOfframpOrderStatusMock,
  resolveOfframpBrhIssueRampStatusMock,
  resolveOfframpBrhRedemptionRampStatusMock,
  deleteRampOperationByExternalIdMock,
  retryOfframpReconciliationMock,
} = vi.hoisted(() => ({
  findOfframpOrderByIdMock: vi.fn(),
  markOfframpOrderStatusMock: vi.fn(),
  resolveOfframpBrhIssueRampStatusMock: vi.fn(),
  resolveOfframpBrhRedemptionRampStatusMock: vi.fn(),
  deleteRampOperationByExternalIdMock: vi.fn(),
  retryOfframpReconciliationMock: vi.fn(),
}));

vi.mock('./order-store', () => ({
  findOfframpOrderById: findOfframpOrderByIdMock,
  markOfframpOrderStatus: markOfframpOrderStatusMock,
}));

vi.mock('./brh-record', () => ({
  resolveOfframpBrhIssueRampStatus: resolveOfframpBrhIssueRampStatusMock,
  resolveOfframpBrhRedemptionRampStatus: resolveOfframpBrhRedemptionRampStatusMock,
}));

vi.mock('@/lib/ramp/operation-store', () => ({
  deleteRampOperationByExternalId: deleteRampOperationByExternalIdMock,
}));

vi.mock('./reconciliation', () => ({
  retryOfframpReconciliation: retryOfframpReconciliationMock,
}));

import { resetOfframpBrhRedemptionForRetry } from './brh-redemption-retry';

describe('resetOfframpBrhRedemptionForRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteRampOperationByExternalIdMock.mockResolvedValue({ ok: true });
    retryOfframpReconciliationMock.mockResolvedValue({ accepted: true, orderId: 'order-1' });
    resolveOfframpBrhIssueRampStatusMock.mockResolvedValue('confirmed');
    resolveOfframpBrhRedemptionRampStatusMock.mockResolvedValue('needs_review');
    findOfframpOrderByIdMock.mockResolvedValue({
      id: 'order-1',
      status: 'needs_review',
      payout_provider_tx_id: 'pix-1',
      brh_redemption_external_id: 'offramp-brh-redemption:order-1',
      brh_redemption_ramp_operation_id: 'ramp-redemption-1',
    });
    markOfframpOrderStatusMock.mockResolvedValue({
      ok: true,
      row: {
        id: 'order-1',
        status: 'pix_sent',
        brh_redemption_external_id: 'offramp-brh-redemption:order-1:r123',
      },
    });
  });

  it('clears the failed redemption row and submits a fresh external id', async () => {
    const result = await resetOfframpBrhRedemptionForRetry('order-1');

    expect(deleteRampOperationByExternalIdMock).toHaveBeenCalledWith('offramp-brh-redemption:order-1');
    expect(markOfframpOrderStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pix_sent',
        patch: expect.objectContaining({
          brh_redemption_ramp_operation_id: null,
        }),
      }),
    );
    expect(result.previousRedemptionExternalId).toBe('offramp-brh-redemption:order-1');
    expect(result.nextRedemptionExternalId).toContain(':r');
    expect(retryOfframpReconciliationMock).toHaveBeenCalledWith('order-1');
  });
});
