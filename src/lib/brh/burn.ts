export type BrhBurnRequestBody = {
  amount: string;
  idempotencyKey: string;
  source: 'fiat_withdraw_pix';
  emv: string;
};

/**
 * Fire-and-forget BRH burn orchestration (server-only).
 * When `BRH_BURN_API_URL` is unset, returns `{ ok: false, skipped: true }` so callers can surface a clear message.
 */
export async function triggerBrhBurnRequest(
  body: BrhBurnRequestBody,
): Promise<{ ok: true } | { ok: false; skipped: true } | { ok: false; skipped: false; message: string }> {
  const baseUrl = process.env.BRH_BURN_API_URL?.trim();
  if (!baseUrl) {
    console.info('[brh/burn] BRH_BURN_API_URL unset — skip burn request', {
      idempotencyKey: body.idempotencyKey,
    });
    return { ok: false, skipped: true };
  }

  const secret = process.env.BRH_BURN_API_SECRET?.trim();
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
      const message = snippet.slice(0, 500) || `HTTP ${res.status}`;
      console.error('[brh/burn] burn API error', res.status, message);
      return { ok: false, skipped: false, message };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[brh/burn] burn request failed', e);
    return { ok: false, skipped: false, message };
  }
}
