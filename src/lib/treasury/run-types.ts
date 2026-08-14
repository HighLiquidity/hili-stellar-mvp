export type TreasuryRunTrigger = 'manual' | 'scheduled' | 'threshold';
export type TreasuryRefillAsset = 'USDC' | 'XLM';
export type TreasuryRunAsset = 'USDC' | 'XLM' | 'BRL';
export type TreasuryRunKind =
  | 'binance_usdc_refill'
  | 'binance_xlm_refill'
  | 'corpx_brl_to_binance'
  | 'binance_brl_to_corpx';
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
  /** Historical column name; stores refill/transfer amount for USDC, XLM, or BRL. */
  requested_amount_usdc: string | null;
  executed_amount_usdc: string | null;
  /** Historical column name; free balance context (Binance asset or CorpX available). */
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
  kind: 'binance_usdc_refill' | 'binance_xlm_refill';
  asset: TreasuryRefillAsset;
  amount: string;
  binanceFree: string;
  binanceAfter: string;
  distributorBalance: string;
  distributorAfter: string;
  minWithdraw: string;
  distributor: {
    address: string;
    network: string;
    addressTag: string | null;
    name: string | null;
  };
  steps: TreasuryRunStep[];
};

export type TreasuryBrlTransferPlan = {
  kind: 'corpx_brl_to_binance';
  amountBrl: string;
  corpxAvailable: string;
  binanceBrlFree: string;
  corpxBrlAfter: string;
  binanceBrlAfter: string;
  /** How execute will attempt to pay Binance (discovered at dry-run when possible). */
  paymentHint: 'binance_fiat_deposit_then_corpx_pix';
  steps: TreasuryRunStep[];
};

export type TreasuryBrlReceivePlan = {
  kind: 'binance_brl_to_corpx';
  amountBrl: string;
  /** Requested amount minus the Binance fiat withdraw fee (credited to CorpX). */
  amountNetBrl: string;
  withdrawFeeBrl: string;
  corpxAvailable: string;
  binanceBrlFree: string;
  binanceBrlAfter: string;
  /** Estimated CorpX available after the net credit, or `unavailable`. */
  corpxBrlAfter: string;
  destinationMasked: string;
  paymentHint: 'binance_fiat_withdraw_bank_transfer';
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

export type TreasuryBrlTransferRequest = {
  dryRun: boolean;
  amountBrl?: string | null;
  trigger?: TreasuryRunTrigger;
  actor?: {
    userId?: string | null;
    email?: string | null;
  };
};

export type TreasuryBrlReceiveRequest = {
  dryRun: boolean;
  amountBrl?: string | null;
  trigger?: TreasuryRunTrigger;
  actor?: {
    userId?: string | null;
    email?: string | null;
  };
};

export function treasuryKindForAsset(asset: TreasuryRefillAsset): Exclude<
  TreasuryRunKind,
  'corpx_brl_to_binance' | 'binance_brl_to_corpx'
> {
  return asset === 'XLM' ? 'binance_xlm_refill' : 'binance_usdc_refill';
}

export function treasuryAssetFromKind(kind: TreasuryRunKind): TreasuryRunAsset {
  if (kind === 'binance_xlm_refill') return 'XLM';
  if (kind === 'corpx_brl_to_binance' || kind === 'binance_brl_to_corpx') return 'BRL';
  return 'USDC';
}
