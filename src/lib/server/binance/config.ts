import '@/lib/server/only';

import { isIP } from 'node:net';

import { BinanceConfigError } from './errors';

/** Centralized server-side Binance env parsing and validation. */
export type BinanceSecondaryCredentials = {
  apiKey: string;
  apiSecret: string;
  localAddress: string | null;
};

export type BinanceConfig = {
  baseUrl: string;
  apiKey: string | null;
  apiSecret: string | null;
  timeoutMs: number;
  localAddress?: string | null;
  secondary?: BinanceSecondaryCredentials | null;
};

export type BinanceSignedConfig = BinanceConfig & {
  apiKey: string;
  apiSecret: string;
};

export type BinanceEgressProfileId = 'primary' | 'secondary';

export type BinanceEgressProfile = {
  id: BinanceEgressProfileId;
  apiKey: string;
  apiSecret: string;
  localAddress: string | null;
};

export const BINANCE_ENV_VARS = {
  baseUrl: 'BINANCE_BASE_URL',
  apiKey: 'BINANCE_API_KEY',
  apiSecret: 'BINANCE_API_SECRET',
  timeout: 'BINANCE_TIMEOUT',
  localAddress: 'BINANCE_LOCAL_ADDRESS',
  apiKeySecondary: 'BINANCE_API_KEY_SECONDARY',
  apiSecretSecondary: 'BINANCE_API_SECRET_SECONDARY',
  localAddressSecondary: 'BINANCE_LOCAL_ADDRESS_SECONDARY',
} as const;

/** Default REST base for production spot endpoints. Override only when intentionally targeting another environment. */
export const DEFAULT_BINANCE_BASE_URL = 'https://api.binance.com';
/** Timeout applied to each Binance request when no env override is provided. */
export const DEFAULT_BINANCE_TIMEOUT_MS = 10_000;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function normalizeBaseUrl(value: string | null): string {
  const raw = value ?? DEFAULT_BINANCE_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BinanceConfigError('BINANCE_BASE_URL must be a valid absolute URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BinanceConfigError('BINANCE_BASE_URL must start with http:// or https://');
  }

  if (parsed.username || parsed.password) {
    throw new BinanceConfigError('BINANCE_BASE_URL must not include embedded credentials');
  }

  if (parsed.search || parsed.hash) {
    throw new BinanceConfigError('BINANCE_BASE_URL must not include query string or hash fragments');
  }

  return raw.replace(/\/+$/, '');
}

function parseTimeout(value: string | null): number {
  if (!value) return DEFAULT_BINANCE_TIMEOUT_MS;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BinanceConfigError('BINANCE_TIMEOUT must be a positive integer in milliseconds');
  }

  return parsed;
}

function parseLocalAddress(value: string | null, envName: string): string | null {
  if (!value) return null;
  if (isIP(value) === 0) {
    throw new BinanceConfigError(`${envName} must be a valid IPv4 or IPv6 address`);
  }
  return value;
}

function parseSecondary(): BinanceSecondaryCredentials | null {
  const apiKey = readEnv(BINANCE_ENV_VARS.apiKeySecondary);
  const apiSecret = readEnv(BINANCE_ENV_VARS.apiSecretSecondary);
  const localAddressRaw = readEnv(BINANCE_ENV_VARS.localAddressSecondary);

  if (!apiKey && !apiSecret && !localAddressRaw) {
    return null;
  }

  if (!apiKey || !apiSecret) {
    throw new BinanceConfigError(
      'BINANCE_API_KEY_SECONDARY and BINANCE_API_SECRET_SECONDARY are required together when configuring a secondary Binance egress profile',
    );
  }

  return {
    apiKey,
    apiSecret,
    localAddress: parseLocalAddress(localAddressRaw, BINANCE_ENV_VARS.localAddressSecondary),
  };
}

export function getBinanceConfig(options: { requireCredentials?: boolean } = {}): BinanceConfig {
  const config: BinanceConfig = {
    baseUrl: normalizeBaseUrl(readEnv(BINANCE_ENV_VARS.baseUrl)),
    apiKey: readEnv(BINANCE_ENV_VARS.apiKey),
    apiSecret: readEnv(BINANCE_ENV_VARS.apiSecret),
    timeoutMs: parseTimeout(readEnv(BINANCE_ENV_VARS.timeout)),
    localAddress: parseLocalAddress(readEnv(BINANCE_ENV_VARS.localAddress), BINANCE_ENV_VARS.localAddress),
    secondary: parseSecondary(),
  };

  if (options.requireCredentials && (!config.apiKey || !config.apiSecret)) {
    throw new BinanceConfigError('BINANCE_API_KEY and BINANCE_API_SECRET are required for signed Binance requests');
  }

  return config;
}

export function assertBinanceCredentials(
  config: BinanceConfig,
): asserts config is BinanceSignedConfig {
  if (!config.apiKey || !config.apiSecret) {
    throw new BinanceConfigError('BINANCE_API_KEY and BINANCE_API_SECRET are required for signed Binance requests');
  }
}

/** Signed egress profiles available for the given config (primary, then optional secondary). */
export function listBinanceEgressProfiles(config: BinanceConfig): BinanceEgressProfile[] {
  const profiles: BinanceEgressProfile[] = [];

  if (config.apiKey && config.apiSecret) {
    profiles.push({
      id: 'primary',
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      localAddress: config.localAddress ?? null,
    });
  }

  if (config.secondary) {
    profiles.push({
      id: 'secondary',
      apiKey: config.secondary.apiKey,
      apiSecret: config.secondary.apiSecret,
      localAddress: config.secondary.localAddress,
    });
  }

  return profiles;
}

/** Returns config narrowed for signed REST calls. */
export function getBinanceSignedConfig(): BinanceSignedConfig {
  const config = getBinanceConfig({ requireCredentials: true });
  assertBinanceCredentials(config);
  return config;
}

/** Safe default config for server-side imports; credentials stay nullable until required. */
export const binanceConfig: BinanceConfig = getBinanceConfig();

export function isBinanceConfigured(): boolean {
  try {
    getBinanceSignedConfig();
    return true;
  } catch {
    return false;
  }
}
