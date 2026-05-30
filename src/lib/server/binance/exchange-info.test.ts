import { describe, expect, it } from 'vitest';

import {
  assertBinanceMarketQuoteNotional,
  parseMarketNotionalRulesFromFilters,
} from './exchange-info';
import { BinanceValidationError } from './errors';

describe('parseMarketNotionalRulesFromFilters', () => {
  it('reads NOTIONAL filter', () => {
    expect(
      parseMarketNotionalRulesFromFilters([
        {
          filterType: 'NOTIONAL',
          minNotional: '10.00000000',
          maxNotional: '9000000.00000000',
          applyMinToMarket: true,
          applyMaxToMarket: false,
        },
      ]),
    ).toEqual({
      minNotional: '10.00000000',
      maxNotional: '9000000.00000000',
      applyMinToMarket: true,
      applyMaxToMarket: false,
    });
  });

  it('falls back to MIN_NOTIONAL', () => {
    expect(
      parseMarketNotionalRulesFromFilters([
        {
          filterType: 'MIN_NOTIONAL',
          minNotional: '5.00000000',
          applyToMarket: true,
        },
      ]),
    ).toEqual({
      minNotional: '5.00000000',
      maxNotional: null,
      applyMinToMarket: true,
      applyMaxToMarket: false,
    });
  });
});

describe('assertBinanceMarketQuoteNotional', () => {
  const rules = {
    minNotional: '10.00',
    maxNotional: null,
    applyMinToMarket: true,
    applyMaxToMarket: false,
    quoteOrderQtyMarketAllowed: true,
  };

  it('accepts amounts at or above min notional', () => {
    expect(() => assertBinanceMarketQuoteNotional('10.00', rules, 'USDCBRL')).not.toThrow();
    expect(() => assertBinanceMarketQuoteNotional('100.00', rules, 'USDCBRL')).not.toThrow();
  });

  it('rejects amounts below min notional', () => {
    expect(() => assertBinanceMarketQuoteNotional('9.99', rules, 'USDCBRL')).toThrow(
      BinanceValidationError,
    );
  });
});
