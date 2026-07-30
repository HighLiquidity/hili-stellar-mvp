import { describe, expect, it } from 'vitest';

import { parsePixEmv } from './emv-parser';

/** Static PIX sample (EVP key, no amount in tag 54). */
const STATIC_EVP =
  '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5910NOME TESTE6008BRASILIA62070503***6304ABCD';

describe('parsePixEmv', () => {
  it('rejects non-EMV strings', () => {
    expect(parsePixEmv('invalid')).toEqual({
      ok: false,
      error: 'Código PIX inválido (deve começar com 000201).',
    });
  });

  it('extracts EVP key from merchant account', () => {
    const result = parsePixEmv(STATIC_EVP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pixKey).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(result.data.amountBrl).toBeNull();
    expect(result.data.merchantName).toBe('NOME TESTE');
  });

  it('extracts amount from tag 54 when present', () => {
    const withAmount =
      '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865405100.005802BR5910NOME TESTE6008BRASILIA62070503***6304ABCD';
    const result = parsePixEmv(withAmount);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.amountBrl).toBe('100.00');
  });

  it('accepts uppercase PIX GUI from Binance fiat QR', () => {
    const binanceEmv =
      '00020126890014BR.GOV.BCB.PIX2567api-pix.bancobs2.com.br/spi/v2/d18d6517-2dfe-4ab5-9fd0-2779b627a9cf520400005303986540510.005802BR5904Gowd6014Belo Horizonte61083038040362070503***63042928';
    const result = parsePixEmv(binanceEmv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.amountBrl).toBe('10.00');
  });
});
