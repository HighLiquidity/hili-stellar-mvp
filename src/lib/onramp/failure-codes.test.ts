import { describe, expect, it } from 'vitest';

import {
  ONRAMP_FAILURE_CODES,
  buildOnrampFailurePatch,
  clearOnrampFailurePatch,
} from './failure-codes';

describe('onramp failure code helpers', () => {
  it('builds a standardized needs_review failure patch', () => {
    expect(
      buildOnrampFailurePatch({
        code: ONRAMP_FAILURE_CODES.FX_TRADE_FAILED,
        reason: 'upstream timeout',
      }),
    ).toEqual({
      failure_code: ONRAMP_FAILURE_CODES.FX_TRADE_FAILED,
      failure_reason: 'upstream timeout',
      needs_review_reason: 'upstream timeout',
    });
  });

  it('can clear failure state consistently', () => {
    expect(clearOnrampFailurePatch()).toEqual({
      failure_code: null,
      failure_reason: null,
      needs_review_reason: null,
    });
  });

  it('supports non-needs-review failures', () => {
    expect(
      buildOnrampFailurePatch({
        code: ONRAMP_FAILURE_CODES.QUOTE_EXPIRED,
        reason: 'quote expired',
        needsReview: false,
      }),
    ).toEqual({
      failure_code: ONRAMP_FAILURE_CODES.QUOTE_EXPIRED,
      failure_reason: 'quote expired',
      needs_review_reason: null,
    });
  });
});
