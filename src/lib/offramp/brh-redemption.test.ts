import { describe, expect, it } from 'vitest';

import { mapBrhRedemptionRampStatusToOfframpStatus } from './brh-redemption';
import {
  buildOfframpBrhIssueExternalId,
  buildOfframpBrhRedemptionExternalId,
  isOfframpBrhIssueExternalId,
  buildOfframpPixPayoutIdempotencyKey,
  buildOfframpPixPayoutReference,
  buildOfframpUsdcDepositExternalId,
  isOfframpBrhRedemptionExternalId,
  isOfframpUsdcDepositExternalId,
} from './references';

describe('offramp BRH redemption helpers', () => {
  it('builds stable external ids across orchestration stages', () => {
    expect(buildOfframpUsdcDepositExternalId('order-123')).toBe('offramp-usdc-deposit:order-123');
    expect(buildOfframpPixPayoutIdempotencyKey('order-123')).toBe('offramp-pix-payout:order-123');
    expect(buildOfframpPixPayoutReference('order-123')).toBe('offramp-pix:order-123');
    expect(buildOfframpBrhIssueExternalId('order-123')).toBe('offramp-brh-issue:order-123');
    expect(buildOfframpBrhRedemptionExternalId('order-123')).toBe('offramp-brh-redemption:order-123');
    expect(isOfframpBrhIssueExternalId('offramp-brh-issue:order-123')).toBe(true);
    expect(isOfframpUsdcDepositExternalId('offramp-usdc-deposit:order-123')).toBe(true);
    expect(isOfframpUsdcDepositExternalId('offramp-brh-redemption:order-123')).toBe(false);
    expect(isOfframpBrhRedemptionExternalId('offramp-brh-redemption:order-123')).toBe(true);
    expect(isOfframpBrhRedemptionExternalId('offramp-usdc-deposit:order-123')).toBe(false);
  });

  it('maps completed callbacks to brh_recorded', () => {
    expect(mapBrhRedemptionRampStatusToOfframpStatus('completed')).toEqual({
      nextStatus: 'brh_recorded',
    });
  });

  it('maps confirmed callbacks to brh_recorded', () => {
    expect(mapBrhRedemptionRampStatusToOfframpStatus('confirmed')).toEqual({
      nextStatus: 'brh_recorded',
    });
  });

  it('maps operational callback failures to needs_review or failed', () => {
    expect(mapBrhRedemptionRampStatusToOfframpStatus('failed')).toEqual({
      nextStatus: 'failed',
    });
    expect(mapBrhRedemptionRampStatusToOfframpStatus('insufficient_funds')).toEqual({
      nextStatus: 'needs_review',
    });
    expect(mapBrhRedemptionRampStatusToOfframpStatus('callback_failed')).toEqual({
      nextStatus: 'needs_review',
    });
  });

  it('ignores non-terminal intermediate statuses', () => {
    expect(mapBrhRedemptionRampStatusToOfframpStatus('pending')).toEqual({
      nextStatus: null,
    });
    expect(mapBrhRedemptionRampStatusToOfframpStatus('submitting')).toEqual({
      nextStatus: null,
    });
    expect(mapBrhRedemptionRampStatusToOfframpStatus('unexpected')).toEqual({
      nextStatus: null,
    });
  });
});
