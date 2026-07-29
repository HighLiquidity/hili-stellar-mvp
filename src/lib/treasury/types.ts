export type TreasuryPocketOk<T extends Record<string, unknown>> = { ok: true } & T;

export type TreasuryPocketError = {
  ok: false;
  error: string;
};

export type TreasuryPocketResult<T extends Record<string, unknown>> =
  | TreasuryPocketOk<T>
  | TreasuryPocketError;

export type TreasuryAssetSpot = {
  free: string;
  locked: string;
};

export type TreasuryPendingRefillItem = {
  orderId: string;
  status: string;
  amountBrl: string;
  amountUsdc: string;
  updatedAt: string;
  usdcDeliveredAt: string | null;
};

export type TreasuryOverviewResponse = {
  generatedAt: string;
  pockets: {
    corpx: TreasuryPocketResult<{
      accountId: string;
      available: string;
      reserved: string;
      total: string;
      currency: string;
      lastUpdated: string;
    }>;
    binance: TreasuryPocketResult<{
      brl: TreasuryAssetSpot;
      usdc: TreasuryAssetSpot;
    }>;
    distributor: TreasuryPocketResult<{
      address: string;
      network: string;
      horizonUrl: string;
      stellarNetwork: 'STELLAR_PUBLIC' | 'STELLAR_TESTNET';
      usdc: string;
      xlm: string;
      usdcIssuer: string | null;
      addressTag: string | null;
    }>;
    brh: TreasuryPocketResult<{
      balance: string;
    }>;
  };
  pendingRefills: {
    count: number;
    items: TreasuryPendingRefillItem[];
  };
};
