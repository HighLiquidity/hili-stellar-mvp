/** Stellar text memo — max 28 UTF-8 bytes. */
export function buildOnrampMemo(providerTxId: string | undefined, dedupeKey: string): string {
  const raw = providerTxId?.trim() ? `pix:${providerTxId.trim()}` : `pix:${dedupeKey.trim().slice(0, 20)}`;
  return truncateUtf8Bytes(raw, 28);
}

function truncateUtf8Bytes(input: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(input).length <= maxBytes) return input;

  let out = '';
  for (const char of input) {
    const next = out + char;
    if (encoder.encode(next).length > maxBytes) break;
    out = next;
  }
  return out || input.slice(0, 1);
}
