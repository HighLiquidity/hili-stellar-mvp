import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { ADMIN_TEST_SETTINGS_TABLE, SETTINGS_ROW_ID } from './constants';
import type { AdminRampSettings, PlatformRampFlags } from './types';

const RAMP_SETTINGS_COLUMNS =
  'usdc_ramp_enabled, brh_ramp_enabled, max_onramp_brl, max_offramp_brl, max_deposit_brl, max_withdraw_brl';

type RampSettingsRow = {
  usdc_ramp_enabled: boolean | null;
  brh_ramp_enabled: boolean | null;
  max_onramp_brl: string | null;
  max_offramp_brl: string | null;
  max_deposit_brl: string | null;
  max_withdraw_brl: string | null;
};

export type SettingsLoadResult<T> = { ok: true; data: T } | { ok: false; reason: string };

function asBoolean(value: boolean | null | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asRequiredText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapAdminRampSettings(row: RampSettingsRow): AdminRampSettings | null {
  const maxOnrampBrl = asRequiredText(row.max_onramp_brl);
  const maxOfframpBrl = asRequiredText(row.max_offramp_brl);
  const maxDepositBrl = asRequiredText(row.max_deposit_brl);
  const maxWithdrawBrl = asRequiredText(row.max_withdraw_brl);
  if (!maxOnrampBrl || !maxOfframpBrl || !maxDepositBrl || !maxWithdrawBrl) {
    return null;
  }

  return {
    usdcRampEnabled: asBoolean(row.usdc_ramp_enabled, true),
    brhRampEnabled: asBoolean(row.brh_ramp_enabled, true),
    maxOnrampBrl,
    maxOfframpBrl,
    maxDepositBrl,
    maxWithdrawBrl,
  };
}

async function loadRampSettingsRow(): Promise<SettingsLoadResult<RampSettingsRow>> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    const reason =
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor (necessária para ler as configurações da plataforma).';
    console.error('[admin-test-settings]', reason);
    return { ok: false, reason };
  }

  const { data, error } = await admin
    .from(ADMIN_TEST_SETTINGS_TABLE)
    .select(RAMP_SETTINGS_COLUMNS)
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    const reason = `Falha ao ler admin_test_settings: ${error.message}`;
    console.error('[admin-test-settings] read ramp settings failed', error);
    return { ok: false, reason };
  }

  if (!data) {
    return {
      ok: false,
      reason: 'Configurações da plataforma não encontradas (tabela admin_test_settings vazia).',
    };
  }

  return { ok: true, data: data as RampSettingsRow };
}

export async function loadAdminRampSettings(): Promise<SettingsLoadResult<AdminRampSettings>> {
  const row = await loadRampSettingsRow();
  if (!row.ok) return row;

  const mapped = mapAdminRampSettings(row.data);
  if (!mapped) {
    return {
      ok: false,
      reason: 'Limites de rampa não configurados (migração não aplicada ou valores vazios).',
    };
  }

  return { ok: true, data: mapped };
}

export async function loadPlatformRampFlags(): Promise<SettingsLoadResult<PlatformRampFlags>> {
  const row = await loadRampSettingsRow();
  if (!row.ok) return row;

  return {
    ok: true,
    data: {
      usdcRampEnabled: asBoolean(row.data.usdc_ramp_enabled, true),
      brhRampEnabled: asBoolean(row.data.brh_ramp_enabled, true),
    },
  };
}

export async function loadPlatformUsdcMaxBrl(
  flow: 'onramp' | 'offramp',
): Promise<SettingsLoadResult<string>> {
  const settings = await loadAdminRampSettings();
  if (!settings.ok) return settings;
  return {
    ok: true,
    data: flow === 'onramp' ? settings.data.maxOnrampBrl : settings.data.maxOfframpBrl,
  };
}

export { SETTINGS_ROW_ID, ADMIN_TEST_SETTINGS_TABLE };
