import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getRampOperationMock,
  applyOfframpBrhIssueRampCallbackMock,
  applyOfframpBrhRedemptionRampCallbackMock,
  resolveOfframpBrhIssueRampStatusMock,
  findOfframpOrderByIdMock,
} = vi.hoisted(() => ({
  getRampOperationMock: vi.fn(),
  applyOfframpBrhIssueRampCallbackMock: vi.fn(),
  applyOfframpBrhRedemptionRampCallbackMock: vi.fn(),
  resolveOfframpBrhIssueRampStatusMock: vi.fn(),
  findOfframpOrderByIdMock: vi.fn(),
}));

vi.mock('@/lib/ramp/client', () => ({
  getRampOperation: getRampOperationMock,
}));

vi.mock('@/lib/ramp/config', () => ({
  isRampConfigured: () => true,
}));

vi.mock('./brh-issue', () => ({
  applyOfframpBrhIssueRampCallback: applyOfframpBrhIssueRampCallbackMock,
}));

vi.mock('./brh-redemption', () => ({
  applyOfframpBrhRedemptionRampCallback: applyOfframpBrhRedemptionRampCallbackMock,
}));

vi.mock('./brh-record', () => ({
  resolveOfframpBrhIssueRampStatus: resolveOfframpBrhIssueRampStatusMock,
}));

vi.mock('./order-store', () => ({
  findOfframpOrderById: findOfframpOrderByIdMock,
}));

import { syncOfframpBrhRecordFromRamp } from './brh-sync';

describe('syncOfframpBrhRecordFromRamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findOfframpOrderByIdMock.mockResolvedValue(null);
    resolveOfframpBrhIssueRampStatusMock.mockResolvedValue('confirmed');
  });

  it('does not sync redemption before issue is confirmed', async () => {
    const order = {
      id: 'order-1',
      status: 'pix_sent',
      brh_issue_external_id: 'offramp-brh-issue:order-1',
      brh_issue_ramp_operation_id: 'ramp-issue-1',
      brh_redemption_external_id: 'offramp-brh-redemption:order-1',
      brh_redemption_ramp_operation_id: 'ramp-redemption-1',
    };

    resolveOfframpBrhIssueRampStatusMock.mockResolvedValue('pending');

    await syncOfframpBrhRecordFromRamp(order as never);

    expect(getRampOperationMock).toHaveBeenCalledTimes(1);
    expect(getRampOperationMock).toHaveBeenCalledWith('ramp-issue-1');
    expect(applyOfframpBrhRedemptionRampCallbackMock).not.toHaveBeenCalled();
  });

  it('syncs redemption only after issue is confirmed', async () => {
    const order = {
      id: 'order-1',
      status: 'pix_sent',
      brh_issue_external_id: 'offramp-brh-issue:order-1',
      brh_issue_ramp_operation_id: 'ramp-issue-1',
      brh_redemption_external_id: 'offramp-brh-redemption:order-1',
      brh_redemption_ramp_operation_id: 'ramp-redemption-1',
    };

    getRampOperationMock
      .mockResolvedValueOnce({ id: 'ramp-issue-1', status: 'confirmed' })
      .mockResolvedValueOnce({ id: 'ramp-redemption-1', status: 'completed' });

    await syncOfframpBrhRecordFromRamp(order as never);

    expect(applyOfframpBrhIssueRampCallbackMock).toHaveBeenCalled();
    expect(applyOfframpBrhRedemptionRampCallbackMock).toHaveBeenCalled();
  });
});
