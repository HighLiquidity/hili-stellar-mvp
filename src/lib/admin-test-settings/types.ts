/** Row shape for `public.admin_test_settings` (singleton). */
export type AdminTestSettingsRow = {
  id: number;
  max_deposit_brl: string;
  max_withdraw_brl: string;
  brh_wallet_address: string;
  fiat_pix_withdraw_key: string;
  updated_at?: string;
  updated_by_email?: string | null;
};
