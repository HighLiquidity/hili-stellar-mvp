import { describe, expect, it } from 'vitest';

import {
  buildTreasuryUsdcDrainExternalId,
  isTreasuryUsdcDrainExternalId,
  parseTreasuryUsdcDrainRunId,
} from './usdc-drain-references';

const RUN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('treasury USDC drain external ids', () => {
  it('builds and parses a run id', () => {
    const externalId = buildTreasuryUsdcDrainExternalId(RUN_ID);
    expect(externalId).toBe(`treasury:usdc-drain:${RUN_ID}`);
    expect(parseTreasuryUsdcDrainRunId(externalId)).toBe(RUN_ID);
    expect(isTreasuryUsdcDrainExternalId(externalId)).toBe(true);
  });

  it('ignores client delivery ids', () => {
    expect(isTreasuryUsdcDrainExternalId('onramp:order-123:client-usdc')).toBe(false);
    expect(parseTreasuryUsdcDrainRunId('onramp:order-123:client-usdc')).toBeNull();
  });
});
