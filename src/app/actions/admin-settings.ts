'use server';

import { parseMaxDepositBrl } from '@/lib/admin-test-settings/deposit-limits';
import {
  ADMIN_TEST_SETTINGS_TABLE,
  SETTINGS_ROW_ID,
  loadAdminRampSettings,
  loadPlatformRampFlags,
} from '@/lib/admin-test-settings/store';
import type { AdminRampSettings, PlatformRampFlags } from '@/lib/admin-test-settings/types';
import {
  requireAdminFromAccessToken,
  requirePanelMemberFromAccessToken,
} from '@/lib/users/require-panel-role';

export type AdminSettingsActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function parseRequiredMaxBrl(value: string): string {
  const trimmed = value.trim().replace(',', '.');
  const parsed = parseMaxDepositBrl(trimmed);
  if (parsed == null || parsed <= 0) {
    throw new Error('Limit must be a positive BRL amount.');
  }
  return trimmed;
}

export async function getPlatformRampFlagsAction(
  accessToken: string,
): Promise<AdminSettingsActionResult<PlatformRampFlags>> {
  try {
    await requirePanelMemberFromAccessToken(accessToken);
    const flags = await loadPlatformRampFlags();
    if (!flags.ok) return { ok: false, message: flags.reason };
    return { ok: true, data: flags.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function getAdminRampSettingsAction(
  accessToken: string,
): Promise<AdminSettingsActionResult<AdminRampSettings>> {
  try {
    await requireAdminFromAccessToken(accessToken);
    const settings = await loadAdminRampSettings();
    if (!settings.ok) return { ok: false, message: settings.reason };
    return { ok: true, data: settings.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateUsdcRampSettingsAction(
  accessToken: string,
  input: { maxOnrampBrl: string; maxOfframpBrl: string },
): Promise<AdminSettingsActionResult<AdminRampSettings>> {
  try {
    const { admin, email } = await requireAdminFromAccessToken(accessToken);
    const maxOnrampBrl = parseRequiredMaxBrl(input.maxOnrampBrl);
    const maxOfframpBrl = parseRequiredMaxBrl(input.maxOfframpBrl);

    const { error } = await admin
      .from(ADMIN_TEST_SETTINGS_TABLE)
      .update({
        max_onramp_brl: maxOnrampBrl,
        max_offramp_brl: maxOfframpBrl,
        updated_by_email: email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', SETTINGS_ROW_ID);

    if (error) return { ok: false, message: error.message };

    const settings = await loadAdminRampSettings();
    if (!settings.ok) return { ok: false, message: settings.reason };
    return { ok: true, data: settings.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateBrhRampSettingsAction(
  accessToken: string,
  input: { maxDepositBrl: string; maxWithdrawBrl: string },
): Promise<AdminSettingsActionResult<AdminRampSettings>> {
  try {
    const { admin, email } = await requireAdminFromAccessToken(accessToken);
    const maxDepositBrl = parseRequiredMaxBrl(input.maxDepositBrl);
    const maxWithdrawBrl = parseRequiredMaxBrl(input.maxWithdrawBrl);

    const { error } = await admin
      .from(ADMIN_TEST_SETTINGS_TABLE)
      .update({
        max_deposit_brl: maxDepositBrl,
        max_withdraw_brl: maxWithdrawBrl,
        updated_by_email: email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', SETTINGS_ROW_ID);

    if (error) return { ok: false, message: error.message };

    const settings = await loadAdminRampSettings();
    if (!settings.ok) return { ok: false, message: settings.reason };
    return { ok: true, data: settings.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateUsdcRampEnabledAction(
  accessToken: string,
  enabled: boolean,
): Promise<AdminSettingsActionResult<AdminRampSettings>> {
  try {
    const { admin, email } = await requireAdminFromAccessToken(accessToken);
    const { error } = await admin
      .from(ADMIN_TEST_SETTINGS_TABLE)
      .update({
        usdc_ramp_enabled: enabled,
        updated_by_email: email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', SETTINGS_ROW_ID);

    if (error) return { ok: false, message: error.message };

    const settings = await loadAdminRampSettings();
    if (!settings.ok) return { ok: false, message: settings.reason };
    return { ok: true, data: settings.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateBrhRampEnabledAction(
  accessToken: string,
  enabled: boolean,
): Promise<AdminSettingsActionResult<AdminRampSettings>> {
  try {
    const { admin, email } = await requireAdminFromAccessToken(accessToken);
    const { error } = await admin
      .from(ADMIN_TEST_SETTINGS_TABLE)
      .update({
        brh_ramp_enabled: enabled,
        updated_by_email: email,
        updated_at: new Date().toISOString(),
      })
      .eq('id', SETTINGS_ROW_ID);

    if (error) return { ok: false, message: error.message };

    const settings = await loadAdminRampSettings();
    if (!settings.ok) return { ok: false, message: settings.reason };
    return { ok: true, data: settings.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
