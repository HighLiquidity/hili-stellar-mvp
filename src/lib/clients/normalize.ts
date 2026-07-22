import '@/lib/server/only';

import type { ClientType } from './types';

export function normalizeClientTaxId(raw: string, type: ClientType = 'company'): string {
  const digits = raw.replace(/\D/g, '');

  if (type === 'individual') {
    if (digits.length !== 11) {
      throw new Error('CPF deve ter 11 dígitos.');
    }
    return digits;
  }

  if (digits.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos.');
  }

  return digits;
}
