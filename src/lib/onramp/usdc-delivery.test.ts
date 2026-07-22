import { describe, expect, it } from 'vitest';

import { isOnrampUsdcDeliveryExternalId } from './references';
import {
  buildOnrampUsdcDeliveryRampRequest,
  mapUsdcDeliveryRampStatusToOnrampStatus,
} from './usdc-delivery';

const VALID_G = `G${'A'.repeat(55)}`;
const VALID_C = `C${'A'.repeat(55)}`;

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

  it('builds classic Ramp payload with memo for G destinations', () => {
    const body = buildOnrampUsdcDeliveryRampRequest({
      amount: '10.0',
      externalId: 'onramp:order-1:client-usdc',
      callbackUrl: 'https://example.com/api/webhooks/ramp',
      destinationAddress: VALID_G,
      destinationMemo: 'invoice-1',
      orderId: 'order-1',
    });
    expect(body.payoutMethod).toBe('classic');
    expect(body.memo).toBe('invoice-1');
    expect(body.destination).toBe(VALID_G);
  });

  it('builds soroban Ramp payload without memo for C destinations', () => {
    const body = buildOnrampUsdcDeliveryRampRequest({
      amount: '10.0',
      externalId: 'onramp:order-2:client-usdc',
      callbackUrl: 'https://example.com/api/webhooks/ramp',
      destinationAddress: VALID_C,
      destinationMemo: 'should-be-ignored',
      orderId: 'order-2',
    });
    expect(body.payoutMethod).toBe('soroban');
    expect(body).not.toHaveProperty('memo');
    expect(body.destination).toBe(VALID_C);
  });
});
