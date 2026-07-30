import { describe, expect, it } from 'vitest';

import {
  extractPixEmvFromUnknown,
  extractPixKeyFromUnknown,
  summarizeFiatOrderDetail,
} from './pix-emv-extract';

const SAMPLE_EMV =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426614174000520400005303986540530.005802BR5913Fulano de Tal6008BRASILIA62070503***6304ABCD';

describe('extractPixEmvFromUnknown', () => {
  it('finds EMV under common qrCode key', () => {
    expect(extractPixEmvFromUnknown({ qrCode: SAMPLE_EMV })).toBe(SAMPLE_EMV);
  });

  it('finds nested EMV', () => {
    expect(
      extractPixEmvFromUnknown({
        data: { payment: { pix_code: SAMPLE_EMV } },
      }),
    ).toBe(SAMPLE_EMV);
  });

  it('accepts EMV that embeds PIX GUI without requiring 000201 prefix alone', () => {
    const weird = `xx${SAMPLE_EMV}`;
    expect(extractPixEmvFromUnknown({ code: weird })).toBe(weird);
  });

  it('returns null when absent', () => {
    expect(extractPixEmvFromUnknown({ orderId: 'abc', status: 'Processing', ext: null })).toBeNull();
  });

  it('parses stringified ext JSON', () => {
    expect(
      extractPixEmvFromUnknown({
        ext: JSON.stringify({ qrCode: SAMPLE_EMV }),
      }),
    ).toBe(SAMPLE_EMV);
  });

  it('finds Binance fiat ext.qrCode with uppercase PIX GUI', () => {
    const binanceEmv =
      '00020126890014BR.GOV.BCB.PIX2567api-pix.bancobs2.com.br/spi/v2/d18d6517-2dfe-4ab5-9fd0-2779b627a9cf520400005303986540510.005802BR5904Gowd6014Belo Horizonte61083038040362070503***63042928';
    expect(
      extractPixEmvFromUnknown({
        orderId: '03779136318298432512073079',
        orderStatus: 'ORDER_NEED_ADDITIONAL_ACTION',
        ext: { qrCode: binanceEmv },
      }),
    ).toBe(binanceEmv);
  });
});

describe('extractPixKeyFromUnknown', () => {
  it('finds pixKey in ext', () => {
    expect(
      extractPixKeyFromUnknown({
        orderStatus: 'Processing',
        ext: { pixKey: '123e4567-e12b-12d1-a456-426614174000' },
      }),
    ).toBe('123e4567-e12b-12d1-a456-426614174000');
  });

  it('parses stringified ext for pixKey', () => {
    expect(
      extractPixKeyFromUnknown({
        ext: JSON.stringify({ pixKey: 'abc-def-ghi-jkl' }),
      }),
    ).toBe('abc-def-ghi-jkl');
  });

  it('skips EMV mistaken as key', () => {
    expect(extractPixKeyFromUnknown({ pixKey: SAMPLE_EMV })).toBeNull();
  });
});

describe('summarizeFiatOrderDetail', () => {
  it('includes status and ext snippet', () => {
    const summary = summarizeFiatOrderDetail({
      orderId: 'ord-1',
      orderStatus: 'Processing',
      errorCode: '',
      errorMessage: '',
      ext: { foo: 'bar' },
    });
    expect(summary).toContain('orderStatus=Processing');
    expect(summary).toContain('ext=');
  });
});
