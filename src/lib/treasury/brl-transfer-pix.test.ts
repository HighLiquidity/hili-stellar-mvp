import { describe, expect, it } from 'vitest';

import {
  amountForEmvPayout,
  assertCorpXPixOutAccepted,
  isBinanceFiatOrderFailed,
  isBinanceFiatOrderInitializing,
  isBinanceFiatOrderPaid,
  readFiatOrderStatus,
  resolvePixPaymentFromOrderDetail,
} from './brl-transfer-pix';

const BINANCE_EMV =
  '00020126890014BR.GOV.BCB.PIX2567api-pix.bancobs2.com.br/spi/v2/d18d6517-2dfe-4ab5-9fd0-2779b627a9cf520400005303986540510.005802BR5904Gowd6014Belo Horizonte61083038040362070503***63042928';

describe('binance fiat order status helpers', () => {
  it('treats ORDER_INITIAL with empty ext as initializing', () => {
    const detail = {
      orderId: '1',
      orderStatus: 'ORDER_INITIAL',
      ext: {},
    };
    expect(readFiatOrderStatus(detail)).toBe('ORDER_INITIAL');
    expect(isBinanceFiatOrderInitializing(detail)).toBe(true);
    expect(resolvePixPaymentFromOrderDetail(detail)).toBeNull();
  });

  it('resolves EMV once ORDER_NEED_ADDITIONAL_ACTION exposes qrCode', () => {
    const detail = {
      orderId: '1',
      orderStatus: 'ORDER_NEED_ADDITIONAL_ACTION',
      ext: { qrCode: BINANCE_EMV },
    };
    expect(isBinanceFiatOrderInitializing(detail)).toBe(false);
    expect(resolvePixPaymentFromOrderDetail(detail)).toEqual({ mode: 'emv', emv: BINANCE_EMV });
  });

  it('detects paid and failed statuses', () => {
    expect(isBinanceFiatOrderPaid({ orderStatus: 'SUCCESS' })).toBe(true);
    expect(isBinanceFiatOrderFailed({ orderStatus: 'FAILED', errorCode: '' })).toBe(true);
    expect(isBinanceFiatOrderFailed({ orderStatus: 'ORDER_INITIAL', errorCode: '-16012' })).toBe(
      true,
    );
  });
});

describe('assertCorpXPixOutAccepted', () => {
  it('rejects empty provider ids (false success)', () => {
    expect(() =>
      assertCorpXPixOutAccepted({
        providerTxId: '',
        e2eId: '',
        status: 'pending',
        amount: '10',
        fee: '0',
      }),
    ).toThrow(/missing transactionId/);
  });

  it('rejects failed status', () => {
    expect(() =>
      assertCorpXPixOutAccepted({
        providerTxId: 'tx-1',
        e2eId: '',
        status: 'failed',
        amount: '10',
        fee: '0',
      }),
    ).toThrow(/failed/);
  });

  it('accepts submitted payout with transaction id', () => {
    expect(() =>
      assertCorpXPixOutAccepted({
        providerTxId: 'tx-1',
        e2eId: 'E2E',
        status: 'submitted',
        amount: '10',
        fee: '0',
      }),
    ).not.toThrow();
  });
});

describe('amountForEmvPayout', () => {
  it('omits amount when Binance EMV already has tag 54', () => {
    expect(amountForEmvPayout(BINANCE_EMV, '10')).toBeUndefined();
  });

  it('keeps planned amount when EMV has no tag 54', () => {
    const staticEmv =
      '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5910NOME TESTE6008BRASILIA62070503***6304ABCD';
    expect(amountForEmvPayout(staticEmv, '10')).toBe('10');
  });
});
