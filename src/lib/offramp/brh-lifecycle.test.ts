import { describe, expect, it } from 'vitest';

import {
  isOfframpBrhIssueCompleted,
  isOfframpBrhRedemptionCompleted,
} from './brh-lifecycle';

describe('offramp BRH lifecycle helpers', () => {
  it('treats confirmed and completed issue statuses as mint-complete', () => {
    expect(isOfframpBrhIssueCompleted('confirmed')).toBe(true);
    expect(isOfframpBrhIssueCompleted('completed')).toBe(true);
    expect(isOfframpBrhIssueCompleted('pending')).toBe(false);
  });

  it('treats confirmed and completed redemption statuses as burn-complete', () => {
    expect(isOfframpBrhRedemptionCompleted('confirmed')).toBe(true);
    expect(isOfframpBrhRedemptionCompleted('completed')).toBe(true);
    expect(isOfframpBrhRedemptionCompleted('needs_review')).toBe(false);
  });
});
