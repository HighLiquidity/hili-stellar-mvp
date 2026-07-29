import '@/lib/server/only';

import { getOnrampWithdrawNetwork } from '@/lib/withdraw-whitelist/onramp-network';

/** Circle USDC on Stellar public network. */
export const STELLAR_PUBLIC_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

/** Common Circle/Centre USDC issuer on Stellar testnet. */
export const STELLAR_TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const DEFAULT_HORIZON_PUBLIC = 'https://horizon.stellar.org';
const DEFAULT_HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

export type HorizonBalanceLine = {
  assetType: string;
  assetCode?: string;
  assetIssuer?: string;
  balance: string;
};

export type HorizonAccountBalances = {
  accountId: string;
  horizonUrl: string;
  network: 'STELLAR_PUBLIC' | 'STELLAR_TESTNET';
  xlm: string;
  usdc: string;
  usdcIssuer: string | null;
  balances: HorizonBalanceLine[];
};

type HorizonApiBalance = {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
};

type HorizonAccountResponse = {
  id?: string;
  account_id?: string;
  balances?: HorizonApiBalance[];
};

export function resolveHorizonUrl(): string {
  const fromEnv = process.env.STELLAR_HORIZON_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  return getOnrampWithdrawNetwork() === 'STELLAR_PUBLIC'
    ? DEFAULT_HORIZON_PUBLIC
    : DEFAULT_HORIZON_TESTNET;
}

export function resolveUsdcIssuer(): string | null {
  const fromEnv = process.env.STELLAR_USDC_ISSUER?.trim();
  if (fromEnv) {
    return fromEnv.toUpperCase();
  }

  return getOnrampWithdrawNetwork() === 'STELLAR_PUBLIC'
    ? STELLAR_PUBLIC_USDC_ISSUER
    : STELLAR_TESTNET_USDC_ISSUER;
}

function parseBalanceAmount(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return '0';
}

export function pickNativeBalance(balances: HorizonBalanceLine[]): string {
  const native = balances.find((line) => line.assetType === 'native');
  return native?.balance ?? '0';
}

/**
 * Selects USDC balance. When `issuer` is set, requires matching issuer;
 * otherwise sums all credit lines with asset code USDC.
 */
export function pickUsdcBalance(
  balances: HorizonBalanceLine[],
  issuer: string | null,
): { balance: string; issuer: string | null } {
  const usdcLines = balances.filter(
    (line) =>
      (line.assetType === 'credit_alphanum4' || line.assetType === 'credit_alphanum12') &&
      (line.assetCode ?? '').toUpperCase() === 'USDC',
  );

  if (issuer) {
    const normalizedIssuer = issuer.toUpperCase();
    const match = usdcLines.find((line) => (line.assetIssuer ?? '').toUpperCase() === normalizedIssuer);
    return {
      balance: match?.balance ?? '0',
      issuer: match?.assetIssuer ?? normalizedIssuer,
    };
  }

  if (usdcLines.length === 0) {
    return { balance: '0', issuer: null };
  }

  let total = 0;
  for (const line of usdcLines) {
    const n = Number(line.balance);
    if (Number.isFinite(n)) total += n;
  }

  return {
    balance: String(total),
    issuer: usdcLines[0]?.assetIssuer ?? null,
  };
}

export function mapHorizonBalances(raw: HorizonApiBalance[] | undefined): HorizonBalanceLine[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((entry) => ({
    assetType: typeof entry.asset_type === 'string' ? entry.asset_type : 'unknown',
    assetCode: typeof entry.asset_code === 'string' ? entry.asset_code : undefined,
    assetIssuer: typeof entry.asset_issuer === 'string' ? entry.asset_issuer : undefined,
    balance: parseBalanceAmount(entry.balance),
  }));
}

/** GET {horizon}/accounts/{accountId} — XLM + USDC balances for treasury overview. */
export async function fetchHorizonAccountBalances(
  accountId: string,
  options?: { signal?: AbortSignal; horizonUrl?: string; usdcIssuer?: string | null },
): Promise<HorizonAccountBalances> {
  const normalizedAccountId = accountId.trim().toUpperCase();
  if (!normalizedAccountId) {
    throw new Error('Stellar account id is required');
  }

  const horizonUrl = (options?.horizonUrl ?? resolveHorizonUrl()).replace(/\/+$/, '');
  const network = getOnrampWithdrawNetwork();
  const usdcIssuer =
    options?.usdcIssuer === undefined ? resolveUsdcIssuer() : options.usdcIssuer;

  const response = await fetch(`${horizonUrl}/accounts/${normalizedAccountId}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options?.signal,
    cache: 'no-store',
  });

  const rawText = await response.text().catch(() => '');
  if (!response.ok) {
    const detail = rawText.trim().slice(0, 240) || response.statusText;
    throw new Error(`Horizon account query failed (${response.status}): ${detail}`);
  }

  let parsed: HorizonAccountResponse;
  try {
    parsed = JSON.parse(rawText) as HorizonAccountResponse;
  } catch {
    throw new Error('Horizon account response is not valid JSON');
  }

  const balances = mapHorizonBalances(parsed.balances);
  const usdc = pickUsdcBalance(balances, usdcIssuer);

  return {
    accountId: (parsed.account_id ?? parsed.id ?? normalizedAccountId).toUpperCase(),
    horizonUrl,
    network,
    xlm: pickNativeBalance(balances),
    usdc: usdc.balance,
    usdcIssuer: usdc.issuer,
    balances,
  };
}
