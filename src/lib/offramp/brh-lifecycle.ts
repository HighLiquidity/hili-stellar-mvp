/** Ramp statuses that mean off-ramp BRH issue (mint) succeeded on the omnibus. */
export const OFFRAMP_BRH_ISSUE_COMPLETED_STATUSES = new Set(['confirmed', 'completed']);

/** Ramp statuses that mean off-ramp BRH redemption (burn) succeeded. */
export const OFFRAMP_BRH_REDEMPTION_COMPLETED_STATUSES = new Set(['confirmed', 'completed']);

export function isOfframpBrhIssueCompleted(status: string | null | undefined): boolean {
  const normalized = status?.trim();
  return Boolean(normalized && OFFRAMP_BRH_ISSUE_COMPLETED_STATUSES.has(normalized));
}

export function isOfframpBrhRedemptionCompleted(status: string | null | undefined): boolean {
  const normalized = status?.trim();
  return Boolean(normalized && OFFRAMP_BRH_REDEMPTION_COMPLETED_STATUSES.has(normalized));
}
