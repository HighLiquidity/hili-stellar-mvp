import { createHash } from 'node:crypto';

export type BrhMintRequestBody = {
  amount: string;
  providerTxId?: string;
  eventType: string;
  /** Stable dedupe id so the minter can be idempotent */
  idempotencyKey: string;
  source: 'corpx_pix_inbound';
  rawPayload: unknown;
};

/**
 * Fire-and-forget call to the BRH mint orchestration API (server-side only).
 * Never throws — failures are logged; webhook must still return 200 to CorpX.
 */
export async function triggerBrhMintRequest(body: BrhMintRequestBody): Promise<void> {
  const baseUrl = process.env.BRH_MINT_API_URL?.trim();
  if (!baseUrl) {
    console.info('[brh/mint] BRH_MINT_API_URL unset — skip mint request', {
      idempotencyKey: body.idempotencyKey,
    });
    return;
  }

  const secret = process.env.BRH_MINT_API_SECRET?.trim();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
  };

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const snippet = await res.text().catch(() => '');
      console.error('[brh/mint] mint API error', res.status, snippet.slice(0, 500));
    }
  } catch (e) {
    console.error('[brh/mint] mint request failed', e);
  }
}

/** Deterministic idempotency key for mint from webhook dedupe inputs. */
export function buildMintIdempotencyKey(eventType: string, providerTxId: string | undefined, payload: unknown): string {
  const base = `${eventType}:${providerTxId ?? ''}:${safeStableJson(payload)}`;
  return createHash('sha256').update(base).digest('hex');
}

function safeStableJson(payload: unknown): string {
  try {
    return JSON.stringify(payload ?? null);
  } catch {
    return String(payload);
  }
}
