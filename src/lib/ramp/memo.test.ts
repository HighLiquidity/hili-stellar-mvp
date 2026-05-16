import { describe, expect, it } from 'vitest';

import { buildOnrampMemo } from './memo';

describe('buildOnrampMemo', () => {
  it('stays within 28 utf-8 bytes', () => {
    const memo = buildOnrampMemo('x'.repeat(40), 'dedupe');
    expect(new TextEncoder().encode(memo).length).toBeLessThanOrEqual(28);
  });
});
