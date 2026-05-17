/** Default: Stellar testnet tx page on StellarExpert (hash appended after `/tx/`). */
export const DEFAULT_STELLAR_EXPERT_TX_BASE = 'https://stellar.expert/explorer/testnet/tx/';

const STELLAR_TX_HASH_RE = /^[a-fA-F0-9]{64}$/;

function getStellarExpertTxBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_STELLAR_EXPERT_TX_URL?.trim();
  const base = fromEnv || DEFAULT_STELLAR_EXPERT_TX_BASE;
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Extracts a Stellar transaction hash from a raw callback value (hash only or full explorer URL).
 */
export function extractStellarTxHash(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /[\s<>"']/.test(trimmed)) {
    return null;
  }

  const txPathMatch = trimmed.match(/\/tx\/([a-fA-F0-9]{64})(?:[/?#]|$)/i);
  if (txPathMatch?.[1]) {
    return txPathMatch[1].toLowerCase();
  }

  if (trimmed.includes('://')) {
    const lastSegment = trimmed.split('/').pop()?.split(/[?#]/)[0] ?? '';
    if (STELLAR_TX_HASH_RE.test(lastSegment)) {
      return lastSegment.toLowerCase();
    }
    return null;
  }

  if (STELLAR_TX_HASH_RE.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

/** @deprecated Use {@link extractStellarTxHash}. */
export function normalizeStellarTxHash(txHash: string): string | null {
  return extractStellarTxHash(txHash);
}

/**
 * Builds a StellarExpert transaction URL: `{base}{hash}`.
 * Base defaults to testnet; override with `NEXT_PUBLIC_STELLAR_EXPERT_TX_URL`.
 */
export function buildStellarExpertTxUrl(txHash: string | null | undefined): string | null {
  if (!txHash) return null;
  const hash = extractStellarTxHash(txHash);
  if (!hash) return null;
  return `${getStellarExpertTxBase()}${hash}`;
}
