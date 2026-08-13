import type { TreasuryRunStep } from './run-types';

export const TREASURY_CORPX_INBOUND_STEP = 'corpx_inbound_matched';

/** Bank PIX from Binance can land after weekends; 5 days covers that without matching stale runs. */
export const TREASURY_BRL_RECEIVE_MATCH_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

export type TreasuryBrlReceiveMatchCandidate = {
  id: string;
  kind: string;
  status: string;
  dry_run: boolean;
  requested_amount_usdc: string | null;
  executed_amount_usdc: string | null;
  created_at: string;
  created_by_email?: string | null;
  created_by_user_id?: string | null;
  steps: TreasuryRunStep[];
};

export function canonicalBrlCents(amount: string): number | null {
  const normalized = amount.trim().replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function treasuryBrlReceiveAmount(run: TreasuryBrlReceiveMatchCandidate): string | null {
  const executed = run.executed_amount_usdc?.trim();
  if (executed) return executed;
  const requested = run.requested_amount_usdc?.trim();
  return requested || null;
}

export function isTreasuryRunAwaitingCorpxCredit(run: TreasuryBrlReceiveMatchCandidate): boolean {
  if (run.kind !== 'binance_brl_to_corpx') return false;
  if (run.dry_run) return false;
  if (run.status !== 'running' && run.status !== 'completed') return false;
  return !run.steps.some(
    (step) => step.name === TREASURY_CORPX_INBOUND_STEP && step.status === 'ok',
  );
}

/**
 * Picks the oldest unmatched Binance→CorpX run whose amount matches the inbound PIX.
 * Returns null when none or when the amount is ambiguous across overlapping runs.
 */
export function pickTreasuryBrlReceiveMatch(
  runs: TreasuryBrlReceiveMatchCandidate[],
  amountBrl: string,
  now: Date = new Date(),
  windowMs: number = TREASURY_BRL_RECEIVE_MATCH_WINDOW_MS,
): TreasuryBrlReceiveMatchCandidate | null {
  const cents = canonicalBrlCents(amountBrl);
  if (cents == null) return null;

  const nowMs = now.getTime();
  const matches = runs
    .filter((run) => isTreasuryRunAwaitingCorpxCredit(run))
    .filter((run) => {
      const created = Date.parse(run.created_at);
      if (!Number.isFinite(created)) return false;
      return nowMs - created <= windowMs && nowMs >= created - 60_000;
    })
    .filter((run) => {
      const amount = treasuryBrlReceiveAmount(run);
      if (!amount) return false;
      return canonicalBrlCents(amount) === cents;
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  return matches[0] ?? null;
}

export function formatTreasuryCorpxInboundStepDetail(input: {
  corpxTxid: string;
  e2eId?: string | null;
  eventType: string;
}): string {
  const e2e = input.e2eId?.trim();
  return e2e
    ? `txid=${input.corpxTxid} e2e=${e2e} event=${input.eventType}`
    : `txid=${input.corpxTxid} event=${input.eventType}`;
}
