/** Parsed fields from a PIX copia-e-cola (EMV BR Code) payload. */
export type ParsedPixEmv = {
  amountBrl: string | null;
  pixKey: string | null;
  merchantName: string | null;
};

export type ParsePixEmvResult =
  | { ok: true; data: ParsedPixEmv }
  | { ok: false; error: string };

const EMV_PAYLOAD_PREFIX = '000201';

function parseTlvBlock(payload: string, start: number, end: number): Map<string, string> {
  const fields = new Map<string, string>();
  let i = start;

  while (i + 4 <= end) {
    const id = payload.slice(i, i + 2);
    const len = Number.parseInt(payload.slice(i + 2, i + 4), 10);
    i += 4;
    if (!Number.isFinite(len) || len < 0 || i + len > end) break;
    fields.set(id, payload.slice(i, i + len));
    i += len;
  }

  return fields;
}

function extractPixKeyFromMerchantAccount(block: string): string | null {
  const nested = parseTlvBlock(block, 0, block.length);
  const gui = nested.get('00');
  if (gui?.toLowerCase() !== 'br.gov.bcb.pix') return null;

  const key = nested.get('01')?.trim();
  if (key) return key;

  const url = nested.get('25')?.trim();
  if (url) return url;

  return null;
}

function formatAmountFromTag54(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/**
 * Best-effort parse of PIX EMV (copia e cola). For production accuracy when CorpX is configured,
 * prefer {@link CorpXPixAdapter.decodePaymentQrEmv} on the server.
 */
export function parsePixEmv(payload: string): ParsePixEmvResult {
  const normalized = payload.trim();
  if (!normalized.startsWith(EMV_PAYLOAD_PREFIX)) {
    return { ok: false, error: 'Código PIX inválido (deve começar com 000201).' };
  }

  const root = parseTlvBlock(normalized, 0, normalized.length);
  const merchantAccount = root.get('26');
  const pixKey = merchantAccount ? extractPixKeyFromMerchantAccount(merchantAccount) : null;
  const amountRaw = root.get('54');
  const amountBrl = amountRaw ? formatAmountFromTag54(amountRaw) : null;
  const merchantName = root.get('59')?.trim() || null;

  return {
    ok: true,
    data: { amountBrl, pixKey, merchantName },
  };
}
