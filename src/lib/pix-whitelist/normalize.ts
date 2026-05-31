import '@/lib/server/only';

export class PixWhitelistValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PixWhitelistValidationError';
  }
}

/** Normalizes PIX keys for stable whitelist matching (email, tax id, phone, EVP). */
export function normalizePixWhitelistKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new PixWhitelistValidationError('pixKey is required.');
  }

  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length === 11 || digitsOnly.length === 14) {
    return digitsOnly;
  }

  if (/^\+?\d{10,13}$/.test(trimmed) || (digitsOnly.length >= 10 && digitsOnly.length <= 13)) {
    return digitsOnly;
  }

  return trimmed;
}

export function normalizePixWhitelistBeneficiaryName(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
