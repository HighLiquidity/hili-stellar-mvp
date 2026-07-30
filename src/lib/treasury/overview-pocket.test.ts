import { describe, expect, it } from 'vitest';

import { isTreasuryPocketId, TREASURY_POCKET_IDS } from './overview';

describe('isTreasuryPocketId', () => {
  it('accepts known pocket ids', () => {
    for (const id of TREASURY_POCKET_IDS) {
      expect(isTreasuryPocketId(id)).toBe(true);
    }
  });

  it('rejects unknown ids', () => {
    expect(isTreasuryPocketId('')).toBe(false);
    expect(isTreasuryPocketId('stellar')).toBe(false);
  });
});
