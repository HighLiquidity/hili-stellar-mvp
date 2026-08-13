import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BinanceConfigError } from './errors';
import {
  BINANCE_ENV_VARS,
  DEFAULT_BINANCE_BASE_URL,
  DEFAULT_BINANCE_TIMEOUT_MS,
  getBinanceConfig,
  listBinanceEgressProfiles,
} from './config';

const ENV_KEYS = Object.values(BINANCE_ENV_VARS);

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    snap[key] = process.env[key];
  }
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snap)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearBinanceEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('getBinanceConfig egress profiles', () => {
  let previous: Record<string, string | undefined>;

  beforeEach(() => {
    previous = snapshotEnv();
    clearBinanceEnv();
  });

  afterEach(() => {
    restoreEnv(previous);
  });

  it('returns a single primary profile and defaults when secondary env is unset', () => {
    process.env.BINANCE_API_KEY = 'primary-key';
    process.env.BINANCE_API_SECRET = 'primary-secret';

    const config = getBinanceConfig();

    expect(config.baseUrl).toBe(DEFAULT_BINANCE_BASE_URL);
    expect(config.timeoutMs).toBe(DEFAULT_BINANCE_TIMEOUT_MS);
    expect(config.apiKey).toBe('primary-key');
    expect(config.apiSecret).toBe('primary-secret');
    expect(config.localAddress).toBeNull();
    expect(config.secondary).toBeNull();
    expect(listBinanceEgressProfiles(config)).toEqual([
      {
        id: 'primary',
        apiKey: 'primary-key',
        apiSecret: 'primary-secret',
        localAddress: null,
      },
    ]);
  });

  it('parses a secondary profile and local addresses', () => {
    process.env.BINANCE_API_KEY = 'primary-key';
    process.env.BINANCE_API_SECRET = 'primary-secret';
    process.env.BINANCE_LOCAL_ADDRESS = '203.0.113.10';
    process.env.BINANCE_API_KEY_SECONDARY = 'secondary-key';
    process.env.BINANCE_API_SECRET_SECONDARY = 'secondary-secret';
    process.env.BINANCE_LOCAL_ADDRESS_SECONDARY = '2001:db8::1';

    const config = getBinanceConfig();

    expect(config.localAddress).toBe('203.0.113.10');
    expect(config.secondary).toEqual({
      apiKey: 'secondary-key',
      apiSecret: 'secondary-secret',
      localAddress: '2001:db8::1',
    });
    expect(listBinanceEgressProfiles(config)).toEqual([
      {
        id: 'primary',
        apiKey: 'primary-key',
        apiSecret: 'primary-secret',
        localAddress: '203.0.113.10',
      },
      {
        id: 'secondary',
        apiKey: 'secondary-key',
        apiSecret: 'secondary-secret',
        localAddress: '2001:db8::1',
      },
    ]);
  });

  it('rejects a partial secondary profile', () => {
    process.env.BINANCE_API_KEY_SECONDARY = 'secondary-key';

    expect(() => getBinanceConfig()).toThrow(BinanceConfigError);
    expect(() => getBinanceConfig()).toThrow(
      'BINANCE_API_KEY_SECONDARY and BINANCE_API_SECRET_SECONDARY are required together',
    );
  });

  it('rejects secondary local address without secondary credentials', () => {
    process.env.BINANCE_LOCAL_ADDRESS_SECONDARY = '203.0.113.11';

    expect(() => getBinanceConfig()).toThrow(BinanceConfigError);
  });

  it('rejects an invalid local address', () => {
    process.env.BINANCE_LOCAL_ADDRESS = 'not-an-ip';

    expect(() => getBinanceConfig()).toThrow('BINANCE_LOCAL_ADDRESS must be a valid IPv4 or IPv6 address');
  });
});
