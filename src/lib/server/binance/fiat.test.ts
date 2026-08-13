import { describe, expect, it, vi } from 'vitest';

import { BinanceRequestError, BinanceValidationError } from './errors';
import {
  buildFiatDepositBody,
  buildFiatWithdrawBody,
  createFiatDeposit,
  createFiatWithdraw,
  getFiatOrderDetail,
  getFiatOrders,
  maskBankAccountNumber,
  normalizeFiatDepositAmount,
  unwrapFiatApiResponse,
} from './fiat';

describe('normalizeFiatDepositAmount', () => {
  it('accepts positive numbers and decimal strings', () => {
    expect(normalizeFiatDepositAmount(30)).toBe(30);
    expect(normalizeFiatDepositAmount('30.5')).toBe(30.5);
  });

  it('rejects non-positive amounts', () => {
    expect(() => normalizeFiatDepositAmount(0)).toThrow(BinanceValidationError);
    expect(() => normalizeFiatDepositAmount('-1')).toThrow(BinanceValidationError);
  });
});

describe('buildFiatDepositBody', () => {
  it('defaults to BRL Pix deposit body', () => {
    expect(buildFiatDepositBody({ amount: '30' })).toEqual({
      currency: 'BRL',
      apiPaymentMethod: 'Pix',
      amount: 30,
    });
  });

  it('rejects unsupported currency', () => {
    expect(() => buildFiatDepositBody({ amount: 10, currency: 'USD' as 'BRL' })).toThrow(
      /BRL only/i,
    );
  });
});

describe('buildFiatWithdrawBody', () => {
  it('builds BRL bank_transfer body', () => {
    expect(
      buildFiatWithdrawBody({
        amount: '20',
        accountInfo: {
          accountNumber: '1056894222',
          agency: '1234',
          bankCodeForPix: '222',
          accountType: 'current',
        },
      }),
    ).toEqual({
      currency: 'BRL',
      apiPaymentMethod: 'bank_transfer',
      amount: 20,
      accountInfo: {
        accountNumber: '1056894222',
        agency: '1234',
        bankCodeForPix: '222',
        accountType: 'current',
      },
    });
  });

  it('forwards ext on Binance fiat withdraw for treasury correlation', () => {
    expect(
      buildFiatWithdrawBody({
        amount: '60',
        accountInfo: { accountNumber: '1056894222' },
        ext: { hiliTreasuryRunId: 'run-1', hiliPurpose: 'binance_brl_to_corpx' },
      }),
    ).toMatchObject({
      ext: { hiliTreasuryRunId: 'run-1', hiliPurpose: 'binance_brl_to_corpx' },
    });
  });

  it('requires accountNumber', () => {
    expect(() =>
      buildFiatWithdrawBody({
        amount: 10,
        accountInfo: { accountNumber: '' },
      }),
    ).toThrow(/accountNumber/i);
  });
});

describe('maskBankAccountNumber', () => {
  it('keeps last 4 digits', () => {
    expect(maskBankAccountNumber('1056894222')).toBe('******4222');
  });
});

describe('unwrapFiatApiResponse', () => {
  it('returns data on success code', () => {
    expect(
      unwrapFiatApiResponse({ code: '000000', message: 'success', data: { orderId: 'a' } }),
    ).toEqual({ orderId: 'a' });
  });

  it('throws BinanceRequestError on business failure codes', () => {
    expect(() =>
      unwrapFiatApiResponse({ code: -16009, message: 'KYC required', data: null }),
    ).toThrow(BinanceRequestError);

    try {
      unwrapFiatApiResponse({ code: '-16010', message: 'unsupported', data: null });
    } catch (error) {
      expect(error).toBeInstanceOf(BinanceRequestError);
      expect((error as BinanceRequestError).code).toBe('-16010');
    }
  });
});

describe('fiat services', () => {
  it('createFiatDeposit posts JSON body and unwraps orderId', async () => {
    const signedPostJson = vi.fn().mockResolvedValue({
      code: '000000',
      message: 'success',
      data: { orderId: '04595xxxxxxxxx37' },
    });

    await expect(
      createFiatDeposit({ amount: 30 }, { signedPostJson } as never),
    ).resolves.toEqual({ orderId: '04595xxxxxxxxx37' });

    expect(signedPostJson).toHaveBeenCalledWith(
      '/sapi/v1/fiat/deposit',
      { currency: 'BRL', apiPaymentMethod: 'Pix', amount: 30 },
      {},
    );
  });

  it('createFiatWithdraw posts JSON body and unwraps orderId', async () => {
    const signedPostJson = vi.fn().mockResolvedValue({
      code: '000000',
      message: 'success',
      data: { orderId: 'wd-04595xxxxxxxxx37' },
    });

    await expect(
      createFiatWithdraw(
        {
          amount: 20,
          accountInfo: { accountNumber: '1056894222', accountType: 'current' },
        },
        { signedPostJson } as never,
      ),
    ).resolves.toEqual({ orderId: 'wd-04595xxxxxxxxx37' });

    expect(signedPostJson).toHaveBeenCalledWith(
      '/sapi/v2/fiat/withdraw',
      {
        currency: 'BRL',
        apiPaymentMethod: 'bank_transfer',
        amount: 20,
        accountInfo: { accountNumber: '1056894222', accountType: 'current' },
      },
      {},
    );
  });

  it('getFiatOrderDetail queries by orderNo', async () => {
    const signedGet = vi.fn().mockResolvedValue({
      code: '000000',
      message: 'success',
      data: { orderNo: 'ord-1', status: 'Processing', qrCode: '000201...' },
    });

    await expect(getFiatOrderDetail('ord-1', { signedGet } as never)).resolves.toMatchObject({
      orderNo: 'ord-1',
      qrCode: '000201...',
    });

    expect(signedGet).toHaveBeenCalledWith('/sapi/v1/fiat/get-order-detail', {
      orderNo: 'ord-1',
    });
  });

  it('getFiatOrders validates transactionType and unwraps list payload', async () => {
    const signedGet = vi.fn().mockResolvedValue({
      code: '000000',
      data: { data: [{ orderNo: '1' }], total: 1 },
    });

    await expect(
      getFiatOrders({ transactionType: 0, page: 1, rows: 10 }, { signedGet } as never),
    ).resolves.toEqual({ data: [{ orderNo: '1' }], total: 1 });

    await expect(
      getFiatOrders({ transactionType: 2 as 0 }, { signedGet } as never),
    ).rejects.toThrow(BinanceValidationError);
  });
});
