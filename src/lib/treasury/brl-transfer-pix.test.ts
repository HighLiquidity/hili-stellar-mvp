import { describe, expect, it } from 'vitest';

import {
  amountForEmvPayout,
  assertCorpXPixOutAccepted,
  assertCorpXPixOutSettled,
  classifyTreasuryPixOutOutcome,
  formatMissingPixError,
  inferPixKeyType,
  isBacenPixEndToEndId,
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

  it('prefers the QR/copia-e-cola over a decoded PIX key', () => {
    const detail = {
      orderId: '1',
      orderStatus: 'ORDER_NEED_ADDITIONAL_ACTION',
      ext: { qrCode: BINANCE_EMV, pixKey: '656079c8-0d7d-46cf-9c2f-b8c68d70b475' },
    };
    expect(resolvePixPaymentFromOrderDetail(detail)).toEqual({ mode: 'emv', emv: BINANCE_EMV });
  });

  it('does not treat a PIX key alone as the Binance cobranca identifier', () => {
    const detail = {
      orderId: '1',
      orderStatus: 'ORDER_NEED_ADDITIONAL_ACTION',
      ext: { pixKey: '656079c8-0d7d-46cf-9c2f-b8c68d70b475' },
    };
    expect(resolvePixPaymentFromOrderDetail(detail)).toEqual({
      mode: 'key',
      key: '656079c8-0d7d-46cf-9c2f-b8c68d70b475',
      keyType: 'EVP',
    });
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
  it('uses tag 54 amount from Binance EMV', () => {
    expect(amountForEmvPayout(BINANCE_EMV, '10')).toBe('10.00');
  });

  it('keeps planned amount when EMV has no tag 54', () => {
    const staticEmv =
      '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5910NOME TESTE6008BRASILIA62070503***6304ABCD';
    expect(amountForEmvPayout(staticEmv, '10')).toBe('10');
  });
});

describe('assertCorpXPixOutSettled', () => {
  it('accepts completed lookup only', () => {
    expect(() => assertCorpXPixOutSettled('completed', 'ok')).not.toThrow();
  });

  it('rejects submitted as a false success', () => {
    expect(() => assertCorpXPixOutSettled('submitted', 'identifier=run-1')).toThrow(
      /did not settle/,
    );
  });

  it('does not treat a BACEN E2E still PROCESSING as a failed send', () => {
    expect(() =>
      assertCorpXPixOutSettled(
        'pending',
        'identifier=27faaf81e1c848dbade5b98b4df1ec5a',
        'E50871921202608140429VA2U2AN46PB',
      ),
    ).not.toThrow();
  });

  it('rejects PENDING_APPROVAL even when an E2E-looking id is present', () => {
    expect(() =>
      assertCorpXPixOutSettled(
        'pending_approval',
        'identifier=27faaf81e1c848dbade5b98b4df1ec5a',
        'E50871921202608140429VA2U2AN46PB',
      ),
    ).toThrow(/PENDING_APPROVAL \(settlement-bank risk hold\)/);
  });
});

describe('classifyTreasuryPixOutOutcome', () => {
  const bacenE2e = 'E50871921202608140429VA2U2AN46PB';

  it('recognizes a BACEN E2E id', () => {
    expect(isBacenPixEndToEndId(bacenE2e)).toBe(true);
    expect(isBacenPixEndToEndId('E2E')).toBe(false);
  });

  it('treats Binance paid as settled even if CorpX is still pending', () => {
    expect(
      classifyTreasuryPixOutOutcome({
        corpxStatus: 'pending',
        e2eId: bacenE2e,
        binancePaid: true,
      }),
    ).toBe('settled');
  });

  it('treats pending without E2E as not sent', () => {
    expect(
      classifyTreasuryPixOutOutcome({
        corpxStatus: 'pending',
        e2eId: '',
        binancePaid: false,
      }),
    ).toBe('not_sent');
  });

  it('treats pending with BACEN E2E as in flight', () => {
    expect(
      classifyTreasuryPixOutOutcome({
        corpxStatus: 'pending',
        e2eId: bacenE2e,
        binancePaid: false,
      }),
    ).toBe('in_flight');
  });

  it('treats PENDING_APPROVAL as awaiting approval, not in flight', () => {
    expect(
      classifyTreasuryPixOutOutcome({
        corpxStatus: 'pending_approval',
        e2eId: bacenE2e,
        binancePaid: false,
      }),
    ).toBe('awaiting_approval');
  });
});

describe('inferPixKeyType', () => {
  it('classifies a UUID as EVP', () => {
    expect(inferPixKeyType('656079c8-0d7d-46cf-9c2f-b8c68d70b475')).toBe('EVP');
  });
});

describe('formatMissingPixError', () => {
  it('asks for the Binance QR, not a static PIX key fallback', () => {
    const message = formatMissingPixError('order-1', { orderStatus: 'ORDER_INITIAL', ext: {} });
    expect(message).toMatch(/QR\/copia-e-cola \(EMV\)/);
    expect(message).toMatch(/ext\.qrCode/);
    expect(message).not.toMatch(/BINANCE_BRL_DEPOSIT_PIX_KEY/);
  });
});
