import { describe, expect, it } from 'vitest';

import { extractPixEmvFromUnknown } from './pix-emv-extract';

const SAMPLE_EMV =
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426614174000520400005303986540530.005802BR5913Fulano de Tal6008BRASILIA62070503***6304ABCD';

describe('extractPixEmvFromUnknown', () => {
  it('finds EMV under common qrCode key', () => {
    expect(extractPixEmvFromUnknown({ qrCode: SAMPLE_EMV })).toBe(SAMPLE_EMV);
  });

  it('finds nested EMV', () => {
    expect(
      extractPixEmvFromUnknown({
        data: { payment: { pix_code: SAMPLE_EMV } },
      }),
    ).toBe(SAMPLE_EMV);
  });

  it('returns null when absent', () => {
    expect(extractPixEmvFromUnknown({ orderId: 'abc', status: 'Processing' })).toBeNull();
  });
});
