export type TreasuryRunTrigger = 'manual' | 'scheduled' | 'threshold';
export type TreasuryRefillAsset = 'USDC' | 'XLM';
export type TreasuryRunKind = 'binance_usdc_refill' | 'binance_xlm_refill';
export type TreasuryRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dry_run';

export type TreasuryRunStep = {
  name: string;
  status: 'planned' | 'ok' | 'skipped' | 'failed';
  detail?: string;
  at?: string;
};

export type TreasuryRunRow = {
  id: string;
  trigger: TreasuryRunTrigger;
  kind: TreasuryRunKind;
  status: TreasuryRunStatus;
  dry_run: boolean;
  /** Historical column name; stores refill amount for USDC or XLM. */
  requested_amount_usdc: string | null;
  executed_amount_usdc: string | null;
  /** Historical column name; stores Binance free balance for the run asset. */
  binance_usdc_free: string | null;
  binance_withdraw_order_id: string | null;
  binance_withdraw_id: string | null;
  binance_withdraw_network: string | null;
  distributor_address: string | null;
  distributor_address_tag: string | null;
  steps: TreasuryRunStep[];
  error: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TreasuryRefillPlan = {
  kind: TreasuryRunKind;
  asset: TreasuryRefillAsset;
  amount: string;
  binanceFree: string;
  minWithdraw: string;
  distributor: {
    address: string;
    network: string;
    addressTag: string | null;
    name: string | null;
  };
  steps: TreasuryRunStep[];
};

export type TreasuryRefillRequest = {
  dryRun: boolean;
  asset: TreasuryRefillAsset;
  amount?: string | null;
  trigger?: TreasuryRunTrigger;
  actor?: {
    userId?: string | null;
    email?: string | null;
  };
};

export function treasuryKindForAsset(asset: TreasuryRefillAsset): TreasuryRunKind {
  return asset === 'XLM' ? 'binance_xlm_refill' : 'binance_usdc_refill';
}

export function treasuryAssetFromKind(kind: TreasuryRunKind): TreasuryRefillAsset {
  return kind === 'binance_xlm_refill' ? 'XLM' : 'USDC';
}
