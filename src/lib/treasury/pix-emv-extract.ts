/** If a string looks like JSON object/array, parse and continue walking. */
function tryParseJsonContainer(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** Walks a JSON tree looking for a PIX EMV / copia-e-cola string. */
export function extractPixEmvFromUnknown(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Prefer structured JSON (e.g. stringified `ext`) over treating the whole blob as EMV.
    const parsed = tryParseJsonContainer(trimmed);
    if (parsed != null) {
      return extractPixEmvFromUnknown(parsed, depth + 1);
    }
    // Full EMV usually starts with 000201; accept any string that embeds the PIX GUI.
    // Binance BRL returns uppercase `BR.GOV.BCB.PIX` inside ext.qrCode.
    if (trimmed.toLowerCase().includes('br.gov.bcb.pix') && trimmed.length >= 40) {
      return trimmed;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = extractPixEmvFromUnknown(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      'qrCode',
      'qrcode',
      'qr_code',
      'emv',
      'pixEmv',
      'pixCode',
      'pix_code',
      'qrcodeData',
      'qrcode_data',
      'paymentCode',
      'copyPaste',
      'copiaCola',
      'qrContent',
      'qr_content',
      'code',
    ];
    for (const key of preferredKeys) {
      if (key in record) {
        const found = extractPixEmvFromUnknown(record[key], depth + 1);
        if (found) return found;
      }
    }
    for (const nested of Object.values(record)) {
      const found = extractPixEmvFromUnknown(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

const PIX_KEY_FIELD_NAMES = new Set([
  'pixKey',
  'pix_key',
  'pixAddress',
  'pix_address',
  'key',
  'chave',
  'chavePix',
  'chave_pix',
]);

/** Best-effort extraction of a destination PIX key (EVP/CNPJ/etc.) from order detail. */
export function extractPixKeyFromUnknown(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) return null;

  if (typeof value === 'string') {
    const parsed = tryParseJsonContainer(value);
    if (parsed != null) {
      return extractPixKeyFromUnknown(parsed, depth + 1);
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = extractPixKeyFromUnknown(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [key, nested] of Object.entries(record)) {
      if (PIX_KEY_FIELD_NAMES.has(key) && typeof nested === 'string' && nested.trim()) {
        const candidate = nested.trim();
        // Skip EMV payloads mistaken for keys
        if (candidate.toLowerCase().includes('br.gov.bcb.pix')) continue;
        if (candidate.length >= 8 && candidate.length <= 128) {
          return candidate;
        }
      }
      const found = extractPixKeyFromUnknown(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

export function summarizeFiatOrderDetail(detail: unknown): string {
  if (!detail || typeof detail !== 'object') {
    return 'detail=empty';
  }
  const record = detail as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['orderId', 'orderNo', 'orderStatus', 'status', 'errorCode', 'errorMessage']) {
    if (record[key] != null && String(record[key]).trim()) {
      parts.push(`${key}=${String(record[key]).trim()}`);
    }
  }
  if ('ext' in record) {
    try {
      const raw = record.ext;
      const extValue =
        typeof raw === 'string'
          ? (() => {
              try {
                return JSON.parse(raw) as unknown;
              } catch {
                return raw;
              }
            })()
          : raw;
      const extJson = JSON.stringify(extValue);
      parts.push(`ext=${extJson && extJson.length > 400 ? `${extJson.slice(0, 400)}…` : extJson}`);
    } catch {
      parts.push('ext=[unserializable]');
    }
  }
  return parts.join(' ');
}
