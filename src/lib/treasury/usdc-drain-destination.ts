import '@/lib/server/only';

import { binance } from '@/lib/server/binance';
import { truncateUtf8Bytes } from '@/lib/ramp/memo';

import { TREASURY_DEPOSIT_MEMO_MAX_BYTES } from '@/lib/onramp/treasury-deposit';

export type BinanceUsdcDepositDestination = {
  address: string;
  tag: string | null;
  network: string;
  source: 'api' | 'env';
};

const STELLAR_ACCOUNT_RE = /^G[A-Z2-7]{55}$/;

function normalizeOptional(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readDrainNetwork(): string {
  const network = process.env.ONRAMP_USDC_DISTRIBUTOR_NETWORK?.trim().toUpperCase();
  if (!network) {
    throw new Error('ONRAMP_USDC_DISTRIBUTOR_NETWORK is required for treasury USDC drain.');
  }
  return network;
}

function isStellarMemoNetwork(network: string): boolean {
  return network === 'XLM' || network === 'STELLAR';
}

function assertStellarDepositAddress(address: string, network: string): void {
  if (!isStellarMemoNetwork(network)) return;
  if (!STELLAR_ACCOUNT_RE.test(address)) {
    throw new Error(
      `Binance USDC deposit address is not a Stellar account (G…) for network ${network}.`,
    );
  }
}

function readEnvFallback(network: string): BinanceUsdcDepositDestination | null {
  const address = normalizeOptional(process.env.BINANCE_USDC_DEPOSIT_ADDRESS);
  if (!address) return null;
  const rawTag = normalizeOptional(process.env.BINANCE_USDC_DEPOSIT_ADDRESS_TAG);
  return {
    address,
    tag: rawTag ? truncateUtf8Bytes(rawTag, TREASURY_DEPOSIT_MEMO_MAX_BYTES) : null,
    network,
    source: 'env',
  };
}

function requireMemoForStellar(destination: BinanceUsdcDepositDestination): void {
  if (!isStellarMemoNetwork(destination.network)) return;
  if (!destination.tag) {
    throw new Error(
      'Binance USDC deposit tag/memo is required on Stellar (XLM). ' +
        'Retry after Binance returns a tag, or set BINANCE_USDC_DEPOSIT_ADDRESS_TAG.',
    );
  }
}

/**
 * Live Binance deposit address for USDC on the distributor network, with env fallback.
 * Binance does not accept a crypto push — this is the on-chain destination for Ramp.
 */
export async function resolveBinanceUsdcDepositDestination(): Promise<BinanceUsdcDepositDestination> {
  const network = readDrainNetwork();
  const fallback = readEnvFallback(network);

  try {
    const networkConfig = await binance.withdraw.getCoinNetworkConfig('USDC', network);
    if (!networkConfig.depositEnable) {
      throw new Error(`Binance USDC deposits are disabled on network ${network}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('deposits are disabled')) {
      throw error instanceof Error ? error : new Error(message);
    }
    console.warn('[treasury/usdc-drain] coin network config unavailable, continuing', {
      reason: message,
    });
  }

  try {
    const live = await binance.deposit.getAddress({ coin: 'USDC', network });
    const tag = live.tag ? truncateUtf8Bytes(live.tag, TREASURY_DEPOSIT_MEMO_MAX_BYTES) : null;
    const destination: BinanceUsdcDepositDestination = {
      address: live.address.trim(),
      tag,
      network: live.network ?? network,
      source: 'api',
    };
    assertStellarDepositAddress(destination.address, destination.network);
    requireMemoForStellar(destination);
    return destination;
  } catch (error) {
    if (fallback) {
      assertStellarDepositAddress(fallback.address, fallback.network);
      requireMemoForStellar(fallback);
      console.warn('[treasury/usdc-drain] using BINANCE_USDC_DEPOSIT_ADDRESS fallback', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return fallback;
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
