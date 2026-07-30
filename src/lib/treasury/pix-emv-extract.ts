/** Walks a JSON tree looking for a PIX EMV / copia-e-cola string. */
export function extractPixEmvFromUnknown(value: unknown, depth = 0): string | null {
  if (depth > 8 || value == null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('000201') && trimmed.includes('br.gov.bcb.pix')) {
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
