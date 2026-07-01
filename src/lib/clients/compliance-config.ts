import '@/lib/server/only';

export function isClientKybRequired(): boolean {
  const raw = process.env.CLIENT_KYB_REQUIRED?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}
