import { describe, expect, it } from 'vitest';

import { fingerprintPixEmv } from './log-event';

describe('fingerprintPixEmv', () => {
  it('returns empty for blank input', () => {
    expect(fingerprintPixEmv('')).toBe('');
    expect(fingerprintPixEmv('   ')).toBe('');
  });

  it('is stable for the same payload', () => {
    const emv = '00020126580014br.gov.bcb.pix';
    expect(fingerprintPixEmv(emv)).toBe(fingerprintPixEmv(emv));
    expect(fingerprintPixEmv(emv)).toHaveLength(16);
  });

  it('differs when payload changes', () => {
    expect(fingerprintPixEmv('payload-a')).not.toBe(fingerprintPixEmv('payload-b'));
  });
});
