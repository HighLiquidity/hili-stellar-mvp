export function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Unwraps nested `data` / `payload` envelopes from CorpX webhooks. */
export function unwrapWebhookPayload(payload: unknown): Record<string, unknown> {
  let current: unknown = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current)) break;
    const inner = current.data ?? current.payload ?? current.payment ?? current.qrCode;
    if (isRecord(inner)) {
      current = inner;
      continue;
    }
    break;
  }
  return isRecord(current) ? current : {};
}

export function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const direct = obj[key];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    const snake = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    const alt = obj[snake];
    if (typeof alt === 'string' && alt.trim()) return alt.trim();
  }
  return undefined;
}

export function jsonNumberToAmountString(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return (Math.round(v * 100) / 100).toFixed(2);
  }
  if (typeof v === 'string' && v.trim()) {
    const normalized = v.trim().replace(',', '.');
    const n = Number(normalized);
    if (Number.isFinite(n)) return (Math.round(n * 100) / 100).toFixed(2);
  }
  return null;
}

export function isStrictlyPositiveAmount(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}
