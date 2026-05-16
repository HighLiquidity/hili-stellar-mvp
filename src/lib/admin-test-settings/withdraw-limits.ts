import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

const SETTINGS_ROW_ID = 1;

function normalizeBrlString(raw: string): string {
  return raw.trim().replace(',', '.');
}

export function parseMaxWithdrawBrl(maxWithdrawBrl: string): number | null {
  try {
    return brlStringToJsonNumber(normalizeBrlString(maxWithdrawBrl));
  } catch {
    return null;
  }
}

export function isWithdrawAboveMax(amount: number, maxWithdraw: number): boolean {
  return amount > maxWithdraw;
}

export type MaxWithdrawLoadResult =
  | { ok: true; maxWithdrawBrl: string }
  | { ok: false; reason: string };

export async function loadMaxWithdrawBrl(): Promise<MaxWithdrawLoadResult> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    const reason =
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor (necessária para ler o limite de saque).';
    console.error('[admin-test-settings]', reason);
    return { ok: false, reason };
  }

  const { data, error } = await admin
    .from('admin_test_settings')
    .select('max_withdraw_brl')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    const reason = `Falha ao ler admin_test_settings: ${error.message}`;
    console.error('[admin-test-settings] read max_withdraw_brl failed', error);
    return { ok: false, reason };
  }

  const value = data?.max_withdraw_brl;
  if (typeof value === 'string' && value.trim()) {
    return { ok: true, maxWithdrawBrl: value.trim() };
  }

  return {
    ok: false,
    reason:
      'Limite de saque não configurado (tabela admin_test_settings vazia ou migração não aplicada).',
  };
}
