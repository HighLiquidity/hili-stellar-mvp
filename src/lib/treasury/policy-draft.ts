/** Local-only draft of automatic rebalancing policy. Not persisted yet. */

export type TreasuryRefillMode = 'per_order' | 'batch';

export type TreasuryRailId = 'usdc' | 'xlm' | 'brl';

export type TreasuryRailBands = {
  autoEnabled: boolean;
  target: string;
  minAbs: string;
  minPct: string;
  /** Empty when the rail has no high-water (XLM gas). */
  maxAbs: string;
  maxPct: string;
  cooldownMinutes: string;
  maxPerRun: string;
  dailyCap: string;
};

export type TreasuryPolicyDraft = {
  autoEnabled: boolean;
  shadowMode: boolean;
  checkIntervalMinutes: string;
  usdcRefillMode: TreasuryRefillMode;
  usdcBatchThreshold: string;
  circuitBreakerFailures: string;
  rails: Record<TreasuryRailId, TreasuryRailBands>;
};

function rail(partial: TreasuryRailBands): TreasuryRailBands {
  return { ...partial };
}

/** Illustrative starting values for the settings tab — not an approved policy. */
export function createDefaultTreasuryPolicyDraft(): TreasuryPolicyDraft {
  return {
    autoEnabled: false,
    shadowMode: true,
    checkIntervalMinutes: '15',
    usdcRefillMode: 'batch',
    usdcBatchThreshold: '100',
    circuitBreakerFailures: '3',
    rails: {
      usdc: rail({
        autoEnabled: true,
        target: '5000',
        minAbs: '500',
        minPct: '20',
        maxAbs: '15000',
        maxPct: '180',
        cooldownMinutes: '15',
        maxPerRun: '2000',
        dailyCap: '20000',
      }),
      xlm: rail({
        autoEnabled: true,
        target: '40',
        minAbs: '15',
        minPct: '40',
        maxAbs: '',
        maxPct: '',
        cooldownMinutes: '30',
        maxPerRun: '50',
        dailyCap: '200',
      }),
      brl: rail({
        autoEnabled: false,
        target: '50000',
        minAbs: '10000',
        minPct: '20',
        maxAbs: '150000',
        maxPct: '200',
        cooldownMinutes: '30',
        maxPerRun: '20000',
        dailyCap: '100000',
      }),
    },
  };
}

export function parsePolicyNumber(value: string): number {
  const n = Number(value.replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

/** Low = max(absolute min, target × min%). */
export function effectiveLow(minAbs: string, target: string, minPct: string): number {
  const abs = parsePolicyNumber(minAbs);
  const fromPct = (parsePolicyNumber(target) * parsePolicyNumber(minPct)) / 100;
  return Math.max(abs, fromPct);
}

/** High = min(absolute max, target × max%). */
export function effectiveHigh(maxAbs: string, target: string, maxPct: string): number {
  const abs = parsePolicyNumber(maxAbs);
  const fromPct = (parsePolicyNumber(target) * parsePolicyNumber(maxPct)) / 100;
  if (abs <= 0) return fromPct;
  if (fromPct <= 0) return abs;
  return Math.min(abs, fromPct);
}
