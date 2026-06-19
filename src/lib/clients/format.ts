export function formatClientTaxId(taxId: string): string {
  const digits = taxId.replace(/\D/g, '');
  if (digits.length !== 14) return taxId;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
