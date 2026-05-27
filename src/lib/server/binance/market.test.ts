import { describe, expect, it, vi } from 'vitest';

import { BinanceValidationError } from './errors';
import {
  buildMarketOrderPayload,
  getTickerPrice,
  placeMarketOrder,
  placeMarketOrderByQuoteAmount,
} from './market';

describe('buildMarketOrderPayload', () => {
  it('builds a MARKET payload by base quantity', () => {
    expect(
      buildMarketOrderPayload({
        symbol: 'usdcbrl',
        side: 'BUY',
        quantity: '10.50',
      }),
    ).toEqual({
      symbol: 'USDCBRL',
      side: 'BUY',
      type: 'MARKET',
      quantity: '10.50',
      newOrderRespType: 'FULL',
    });
  });

  it('builds a MARKET payload by quote amount', () => {
    expect(
      buildMarketOrderPayload({
        symbol: 'usdcbrl',
        side: 'BUY',
        quoteOrderQty: '100.00',
        newClientOrderId: 'onramp:123:fx',
      }),
    ).toEqual({
      symbol: 'USDCBRL',
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: '100.00',
      newOrderRespType: 'FULL',
      newClientOrderId: 'onramp:123:fx',
    });
  });

  it('rejects empty symbol', () => {
    expect(() =>
      buildMarketOrderPayload({
        symbol: '   ',
        side: 'BUY',
        quantity: '1',
      }),
    ).toThrowError(BinanceValidationError);
  });

  it('rejects non-positive quoteOrderQty', () => {
    expect(() =>
      buildMarketOrderPayload({
        symbol: 'USDCBRL',
        side: 'BUY',
        quoteOrderQty: '0.000',
      }),
    ).toThrowError(BinanceValidationError);
  });
});

describe('market service functions', () => {
  it('uses the public client for ticker price lookups', async () => {
    const publicGet = vi.fn().mockResolvedValue({ symbol: 'USDTBRL', price: '5.45' });
    const client = { publicGet } as const;

    await expect(getTickerPrice('usdtbrl', client as never)).resolves.toEqual({
      symbol: 'USDTBRL',
      price: '5.45',
    });

    expect(publicGet).toHaveBeenCalledWith('/api/v3/ticker/price', { symbol: 'USDTBRL' });
  });

  it('places a MARKET order by quantity', async () => {
    const signedPost = vi.fn().mockResolvedValue({ orderId: 1 });
    const client = { signedPost } as const;

    await placeMarketOrder(
      {
        symbol: 'USDCBRL',
        side: 'BUY',
        quantity: '10.5',
      },
      client as never,
    );

    expect(signedPost).toHaveBeenCalledWith('/api/v3/order', {
      symbol: 'USDCBRL',
      side: 'BUY',
      type: 'MARKET',
      quantity: '10.5',
      newOrderRespType: 'FULL',
    });
  });

  it('places a MARKET order by quote notional', async () => {
    const signedPost = vi.fn().mockResolvedValue({ orderId: 2 });
    const client = { signedPost } as const;

    await placeMarketOrderByQuoteAmount(
      {
        symbol: 'USDCBRL',
        side: 'BUY',
        quoteOrderQty: '100.00',
        newClientOrderId: 'onramp:123:fx',
      },
      client as never,
    );

    expect(signedPost).toHaveBeenCalledWith('/api/v3/order', {
      symbol: 'USDCBRL',
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: '100.00',
      newOrderRespType: 'FULL',
      newClientOrderId: 'onramp:123:fx',
    });
  });
});
