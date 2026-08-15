import { describe, expect, it, vi } from 'vitest';

import { BinanceValidationError } from './errors';
import {
  buildDepositAddressQuery,
  getDepositAddress,
  parseBinanceDepositAddressResponse,
} from './deposit';

describe('buildDepositAddressQuery', () => {
  it('uppercases coin and network', () => {
    expect(buildDepositAddressQuery({ coin: 'usdc', network: 'xlm' })).toEqual({
      coin: 'USDC',
      network: 'XLM',
    });
  });

  it('rejects empty network', () => {
    expect(() => buildDepositAddressQuery({ coin: 'USDC', network: '  ' })).toThrow(
      BinanceValidationError,
    );
  });
});

describe('parseBinanceDepositAddressResponse', () => {
  it('reads address and tag', () => {
    expect(
      parseBinanceDepositAddressResponse(
        { address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX', tag: '12345', coin: 'USDC' },
        'USDC',
        'XLM',
      ),
    ).toMatchObject({
      address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWX',
      tag: '12345',
      coin: 'USDC',
      network: 'XLM',
    });
  });

  it('accepts memo / addressTag aliases and nested data', () => {
    expect(
      parseBinanceDepositAddressResponse(
        { data: { address: 'GDEST', memo: '999', url: 'https://binance.com' } },
        'USDC',
        'XLM',
      ),
    ).toEqual({
      address: 'GDEST',
      tag: '999',
      coin: 'USDC',
      network: 'XLM',
      url: 'https://binance.com',
    });
  });

  it('rejects missing address', () => {
    expect(() => parseBinanceDepositAddressResponse({ tag: '1' }, 'USDC', 'XLM')).toThrow(
      /missing address/i,
    );
  });
});

describe('getDepositAddress', () => {
  it('calls capital deposit address with coin and network', async () => {
    const signedGet = vi.fn().mockResolvedValue({
      address: 'GDEST',
      tag: '42',
      coin: 'USDC',
      url: 'https://example',
    });

    await expect(
      getDepositAddress({ coin: 'usdc', network: 'xlm' }, { signedGet } as never),
    ).resolves.toMatchObject({
      address: 'GDEST',
      tag: '42',
      network: 'XLM',
    });

    expect(signedGet).toHaveBeenCalledWith('/sapi/v1/capital/deposit/address', {
      coin: 'USDC',
      network: 'XLM',
    });
  });
});
