import { describe, expect, it } from 'vitest';

import { OnrampValidationError } from './errors';
import {
  applyOnrampQuoteSpread,
  calculateQuotedBrlAmount,
  calculateQuotedUsdcAmount,
  normalizeOnrampAmountBrl,
  normalizeOnrampAmountUsdc,
  normalizeOnrampDestinationAddress,
  normalizeOnrampDestinationMemo,
  normalizeOnrampTaxId,
} from './quote';

const VALID_STELLAR_ADDRESS = `G${'A'.repeat(55)}`;

describe('onramp quote helpers', () => {
  it('normalizes CPF/CNPJ digits', () => {
    expect(normalizeOnrampTaxId('123.456.789-00')).toBe('12345678900');
    expect(normalizeOnrampTaxId('12.345.678/0001-99')).toBe('12345678000199');
  });

  it('rejects invalid tax ids', () => {
    expect(() => normalizeOnrampTaxId('123')).toThrowError(OnrampValidationError);
  });

  it('normalizes BRL amounts to cents', () => {
    expect(normalizeOnrampAmountBrl('100')).toBe('100.00');
    expect(normalizeOnrampAmountBrl('100,5')).toBe('100.50');
  });

  it('truncates Stellar memo to 28 UTF-8 bytes', () => {
    expect(normalizeOnrampDestinationMemo('short-memo')).toBe('short-memo');
    expect(normalizeOnrampDestinationMemo('a'.repeat(40))?.length).toBeLessThanOrEqual(28);
  });

  it('validates Stellar destination format', () => {
    expect(normalizeOnrampDestinationAddress(VALID_STELLAR_ADDRESS.toLowerCase())).toBe(
      VALID_STELLAR_ADDRESS,
    );
    expect(() => normalizeOnrampDestinationAddress('wallet-123')).toThrowError(OnrampValidationError);
  });

  it('applies spread bps over the market rate', () => {
    expect(applyOnrampQuoteSpread('5.4321', 100)).toBe('5.486421');
    expect(applyOnrampQuoteSpread('5.4321', 0)).toBe('5.4321');
  });

  it('calculates quoted USDC from BRL using decimal-safe rounding', () => {
    expect(calculateQuotedUsdcAmount('100.00', '5.00')).toBe('20.00');
    expect(calculateQuotedUsdcAmount('100.00', '5.486421')).toBe('18.2268185');
  });

  it('normalizes USDC amounts to up to 7 decimals', () => {
    expect(normalizeOnrampAmountUsdc('20')).toBe('20.00');
    expect(normalizeOnrampAmountUsdc('18,2268185')).toBe('18.2268185');
  });

  it('calculates quoted BRL from USDC using decimal-safe rounding', () => {
    expect(calculateQuotedBrlAmount('20.00', '5.00')).toBe('100.00');
    expect(calculateQuotedBrlAmount('18.2268185', '5.486421')).toBe('100.00');
  });
});
