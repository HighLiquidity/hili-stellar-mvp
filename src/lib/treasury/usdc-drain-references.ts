export const TREASURY_USDC_DRAIN_EXTERNAL_ID_PREFIX = 'treasury:usdc-drain:';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildTreasuryUsdcDrainExternalId(runId: string): string {
  const id = runId.trim();
  if (!id) {
    throw new Error('treasury run id is required');
  }
  return `${TREASURY_USDC_DRAIN_EXTERNAL_ID_PREFIX}${id}`;
}

export function parseTreasuryUsdcDrainRunId(externalId: string): string | null {
  const trimmed = externalId.trim();
  if (!trimmed.startsWith(TREASURY_USDC_DRAIN_EXTERNAL_ID_PREFIX)) return null;
  const id = trimmed.slice(TREASURY_USDC_DRAIN_EXTERNAL_ID_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
}

export function isTreasuryUsdcDrainExternalId(externalId: string): boolean {
  return parseTreasuryUsdcDrainRunId(externalId) != null;
}
