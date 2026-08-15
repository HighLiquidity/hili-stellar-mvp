/** Row shape for `public.admin_test_settings` (singleton). */
export type AdminTestSettingsRow = {
  id: number;
  max_deposit_brl: string;
  max_withdraw_brl: string;
  max_onramp_brl: string;
  max_offramp_brl: string;
  usdc_ramp_enabled: boolean;
  brh_ramp_enabled: boolean;
  brh_wallet_address: string;
  fiat_pix_withdraw_key: string;
  updated_at?: string;
  updated_by_email?: string | null;
};

export type PlatformRampFlags = {
  usdcRampEnabled: boolean;
  brhRampEnabled: boolean;
};

export type UsdcRampSettings = PlatformRampFlags & {
  maxOnrampBrl: string;
  maxOfframpBrl: string;
};

export type BrhRampSettings = PlatformRampFlags & {
  maxDepositBrl: string;
  maxWithdrawBrl: string;
};

export type AdminRampSettings = {
  usdcRampEnabled: boolean;
  brhRampEnabled: boolean;
  maxOnrampBrl: string;
  maxOfframpBrl: string;
  maxDepositBrl: string;
  maxWithdrawBrl: string;
};
