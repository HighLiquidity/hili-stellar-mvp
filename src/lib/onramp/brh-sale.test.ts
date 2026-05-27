import { describe, expect, it } from 'vitest';

import { mapBrhSaleRampStatusToOnrampStatus } from './brh-sale';
import {
  buildOnrampBinanceClientOrderId,
  buildOnrampBinanceWithdrawOrderId,
  buildOnrampBrhSaleExternalId,
  buildOnrampBrhRedemptionExternalId,
  buildOnrampUsdcDeliveryExternalId,
  isOnrampBrhSaleExternalId,
} from './references';

describe('onramp BRH sale helpers', () => {
  it('builds stable external ids for the next orchestration steps', () => {
    expect(buildOnrampBrhSaleExternalId('order-123')).toBe('onramp:order-123:brh-sale');
    expect(buildOnrampUsdcDeliveryExternalId('order-123')).toBe('onramp:order-123:client-usdc');
    expect(buildOnrampBinanceClientOrderId('order-123')).toBe('onramp:order-123:fx');
    expect(buildOnrampBrhRedemptionExternalId('order-123')).toBe('onramp:order-123:brh-redemption');
    expect(buildOnrampBinanceWithdrawOrderId('order-123')).toBe('onramp:order-123:usdc-refill');
    expect(isOnrampBrhSaleExternalId('onramp:order-123:brh-sale')).toBe(true);
    expect(isOnrampBrhSaleExternalId('onramp:order-123:client-usdc')).toBe(false);
  });

  it('maps confirmed callbacks to brh_sold', () => {
    expect(mapBrhSaleRampStatusToOnrampStatus('confirmed')).toEqual({
      nextStatus: 'brh_sold',
      failureCode: null,
    });
  });

  it('maps operational callback failures to needs_review or failed', () => {
    expect(mapBrhSaleRampStatusToOnrampStatus('failed')).toEqual({
      nextStatus: 'failed',
      failureCode: 'BRH_SALE_FAILED',
    });
    expect(mapBrhSaleRampStatusToOnrampStatus('insufficient_funds')).toEqual({
      nextStatus: 'needs_review',
      failureCode: 'BRH_SALE_INSUFFICIENT_FUNDS',
    });
    expect(mapBrhSaleRampStatusToOnrampStatus('callback_failed')).toEqual({
      nextStatus: 'needs_review',
      failureCode: 'BRH_SALE_CALLBACK_FAILED',
    });
  });

  it('ignores non-terminal intermediate statuses', () => {
    expect(mapBrhSaleRampStatusToOnrampStatus('pending')).toEqual({
      nextStatus: null,
      failureCode: null,
    });
    expect(mapBrhSaleRampStatusToOnrampStatus('submitting')).toEqual({
      nextStatus: null,
      failureCode: null,
    });
    expect(mapBrhSaleRampStatusToOnrampStatus('unexpected')).toEqual({
      nextStatus: null,
      failureCode: null,
    });
  });
});
