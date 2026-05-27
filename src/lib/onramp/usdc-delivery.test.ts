import { describe, expect, it } from 'vitest';

import { isOnrampUsdcDeliveryExternalId } from './references';
import { mapUsdcDeliveryRampStatusToOnrampStatus } from './usdc-delivery';

describe('onramp USDC delivery helpers', () => {
  it('detects the dedicated external id pattern', () => {
    expect(isOnrampUsdcDeliveryExternalId('onramp:order-123:client-usdc')).toBe(true);
    expect(isOnrampUsdcDeliveryExternalId('onramp:order-123:brh-sale')).toBe(false);
  });

  it('maps confirmed callbacks to usdc_delivered', () => {
    expect(mapUsdcDeliveryRampStatusToOnrampStatus('confirmed')).toEqual({
      nextStatus: 'usdc_delivered',
      failureCode: null,
    });
  });

  it('maps operational callback failures to needs_review or failed', () => {
    expect(mapUsdcDeliveryRampStatusToOnrampStatus('failed')).toEqual({
      nextStatus: 'failed',
      failureCode: 'USDC_DELIVERY_FAILED',
    });
    expect(mapUsdcDeliveryRampStatusToOnrampStatus('insufficient_funds')).toEqual({
      nextStatus: 'needs_review',
      failureCode: 'USDC_DELIVERY_INSUFFICIENT_FUNDS',
    });
    expect(mapUsdcDeliveryRampStatusToOnrampStatus('callback_failed')).toEqual({
      nextStatus: 'needs_review',
      failureCode: 'USDC_DELIVERY_CALLBACK_FAILED',
    });
  });

  it('ignores non-terminal intermediate statuses', () => {
    expect(mapUsdcDeliveryRampStatusToOnrampStatus('pending')).toEqual({
      nextStatus: null,
      failureCode: null,
    });
    expect(mapUsdcDeliveryRampStatusToOnrampStatus('submitting')).toEqual({
      nextStatus: null,
      failureCode: null,
    });
    expect(mapUsdcDeliveryRampStatusToOnrampStatus('unexpected')).toEqual({
      nextStatus: null,
      failureCode: null,
    });
  });
});
