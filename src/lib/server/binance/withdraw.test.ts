import { describe, expect, it, vi } from 'vitest';

import { BinanceValidationError } from './errors';
import type { BinanceCoinConfig } from './types';
import {
  buildCryptoWithdrawPayload,
  filterWithdrawEnabledNetworks,
  getWithdrawHistory,
  requestCryptoWithdraw,
  selectCoinConfig,
  selectCoinNetworkConfig,
} from './withdraw';

const sampleCoinConfigs: BinanceCoinConfig[] = [
  {
    coin: 'USDC',
    name: 'USD Coin',
    depositAllEnable: true,
    withdrawAllEnable: true,
    free: '0',
    locked: '0',
    freeze: '0',
    withdrawing: '0',
    ipoing: '0',
    ipoable: '0',
    storage: '0',
    isLegalMoney: false,
    trading: true,
    networkList: [
      {
        network: 'ETH',
        coin: 'USDC',
        name: 'Ethereum (ERC20)',
        isDefault: true,
        depositEnable: true,
        withdrawEnable: true,
        withdrawTag: false,
        busy: false,
        addressRegex: '^0x',
        memoRegex: '',
        withdrawFee: '5',
        withdrawMin: '10',
        withdrawMax: '100000',
      },
      {
        network: 'XRP',
        coin: 'USDC',
        name: 'XRP',
        isDefault: false,
        depositEnable: true,
        withdrawEnable: true,
        withdrawTag: true,
        busy: false,
        addressRegex: '^r',
        memoRegex: '^[0-9]+$',
        withdrawFee: '1',
        withdrawMin: '5',
        withdrawMax: '100000',
      },
      {
        network: 'BSC',
        coin: 'USDC',
        name: 'BNB Smart Chain',
        isDefault: false,
        depositEnable: true,
        withdrawEnable: false,
        withdrawTag: false,
        busy: false,
        addressRegex: '^0x',
        memoRegex: '',
        withdrawFee: '0.5',
        withdrawMin: '1',
        withdrawMax: '100000',
      },
    ],
  },
];

describe('withdraw helpers', () => {
  it('selects coin and network config case-insensitively', () => {
    const coinConfig = selectCoinConfig([...sampleCoinConfigs], 'usdc');
    const networkConfig = selectCoinNetworkConfig(coinConfig, 'eth');

    expect(coinConfig.coin).toBe('USDC');
    expect(networkConfig.network).toBe('ETH');
  });

  it('filters withdraw-enabled networks', () => {
    const coinConfig = selectCoinConfig([...sampleCoinConfigs], 'USDC');

    expect(filterWithdrawEnabledNetworks(coinConfig.networkList).map((entry) => entry.network)).toEqual([
      'ETH',
      'XRP',
    ]);
  });

  it('builds withdraw payload and enforces tag rules', () => {
    const coinConfig = selectCoinConfig([...sampleCoinConfigs], 'USDC');
    const ethNetwork = selectCoinNetworkConfig(coinConfig, 'ETH');
    const xrpNetwork = selectCoinNetworkConfig(coinConfig, 'XRP');

    expect(
      buildCryptoWithdrawPayload(
        {
          coin: 'usdc',
          address: '0xabc',
          amount: '100.00',
          network: 'eth',
          name: ' Treasury wallet ',
        },
        ethNetwork,
      ),
    ).toEqual({
      coin: 'USDC',
      address: '0xabc',
      amount: '100.00',
      network: 'ETH',
      name: 'Treasury wallet',
      addressTag: undefined,
      withdrawOrderId: undefined,
      transactionFeeFlag: undefined,
      walletType: undefined,
      recvWindow: undefined,
    });

    expect(() =>
      buildCryptoWithdrawPayload(
        {
          coin: 'USDC',
          address: 'rExample',
          amount: '50',
          network: 'XRP',
        },
        xrpNetwork,
      ),
    ).toThrowError(BinanceValidationError);

    expect(() =>
      buildCryptoWithdrawPayload(
        {
          coin: 'USDC',
          address: '0xabc',
          amount: '50',
          network: 'ETH',
          addressTag: 'memo',
        },
        ethNetwork,
      ),
    ).toThrowError(BinanceValidationError);
  });
});

describe('withdraw services', () => {
  it('requests crypto withdraw after validating network config', async () => {
    const signedGet = vi.fn().mockResolvedValue([...sampleCoinConfigs]);
    const signedPost = vi.fn().mockResolvedValue({ id: 'withdraw-123' });
    const client = { signedGet, signedPost } as const;

    await expect(
      requestCryptoWithdraw(
        {
          coin: 'USDC',
          address: '0xabc',
          amount: '100.00',
          network: 'ETH',
          withdrawOrderId: 'pix-onramp-1',
        },
        client as never,
      ),
    ).resolves.toEqual({ id: 'withdraw-123' });

    expect(signedGet).toHaveBeenCalledWith('/sapi/v1/capital/config/getall');
    expect(signedPost).toHaveBeenCalledWith('/sapi/v1/capital/withdraw/apply', {
      coin: 'USDC',
      address: '0xabc',
      amount: '100.00',
      network: 'ETH',
      withdrawOrderId: 'pix-onramp-1',
      addressTag: undefined,
      name: undefined,
      transactionFeeFlag: undefined,
      walletType: undefined,
      recvWindow: undefined,
    });
  });

  it('serializes withdraw history filters consistently', async () => {
    const signedGet = vi.fn().mockResolvedValue([]);
    const client = { signedGet } as const;

    await getWithdrawHistory(
      {
        coin: 'usdc',
        idList: ['id-1', 'id-2'],
        limit: 100,
        offset: 0,
      },
      client as never,
    );

    expect(signedGet).toHaveBeenCalledWith('/sapi/v1/capital/withdraw/history', {
      coin: 'USDC',
      withdrawOrderId: undefined,
      status: undefined,
      offset: 0,
      limit: 100,
      idList: 'id-1,id-2',
      startTime: undefined,
      endTime: undefined,
      recvWindow: undefined,
    });
  });
});
