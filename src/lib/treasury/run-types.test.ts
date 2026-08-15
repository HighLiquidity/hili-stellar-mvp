import { describe, expect, it } from 'vitest';

import { treasuryAssetFromKind } from './run-types';

describe('treasuryAssetFromKind', () => {
  it('maps BRL kinds', () => {
    expect(treasuryAssetFromKind('corpx_brl_to_binance')).toBe('BRL');
    expect(treasuryAssetFromKind('binance_brl_to_corpx')).toBe('BRL');
  });

  it('maps crypto refill kinds', () => {
    expect(treasuryAssetFromKind('binance_usdc_refill')).toBe('USDC');
    expect(treasuryAssetFromKind('binance_xlm_refill')).toBe('XLM');
    expect(treasuryAssetFromKind('distributor_usdc_to_binance')).toBe('USDC');
  });
});
