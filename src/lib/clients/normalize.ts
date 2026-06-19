import '@/lib/server/only';

export function normalizeClientTaxId(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos.');
  }
  return digits;
}
