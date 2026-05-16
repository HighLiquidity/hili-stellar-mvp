import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

const SETTINGS_ROW_ID = 1;

function normalizeBrlString(raw: string): string {
  return raw.trim().replace(',', '.');
}

export function parseMaxDepositBrl(maxDepositBrl: string): number | null {
  try {
    return brlStringToJsonNumber(normalizeBrlString(maxDepositBrl));
  } catch {
    return null;
  }
}

export function isDepositAboveMax(amount: number, maxDeposit: number): boolean {
  return amount > maxDeposit;
}

export type MaxDepositLoadResult =
  | { ok: true; maxDepositBrl: string }
  | { ok: false; reason: string };

export async function loadMaxDepositBrl(): Promise<MaxDepositLoadResult> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    const reason =
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor (necessária para ler o limite de depósito).';
    console.error('[admin-test-settings]', reason);
    return { ok: false, reason };
  }

  const { data, error } = await admin
    .from('admin_test_settings')
    .select('max_deposit_brl')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    const reason = `Falha ao ler admin_test_settings: ${error.message}`;
    console.error('[admin-test-settings] read max_deposit_brl failed', error);
    return { ok: false, reason };
  }

  const value = data?.max_deposit_brl;
  if (typeof value === 'string' && value.trim()) {
    return { ok: true, maxDepositBrl: value.trim() };
  }

  return {
    ok: false,
    reason:
      'Limite de depósito não configurado (tabela admin_test_settings vazia ou migração não aplicada).',
  };
}
