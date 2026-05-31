import { describe, expect, it } from 'vitest';

import { normalizePixWhitelistKey, PixWhitelistValidationError } from './normalize';

describe('normalizePixWhitelistKey', () => {
  it('normalizes email keys to lowercase', () => {
    expect(normalizePixWhitelistKey('  User@Example.COM ')).toBe('user@example.com');
  });

  it('normalizes CPF to digits', () => {
    expect(normalizePixWhitelistKey('123.456.789-09')).toBe('12345678909');
  });

  it('normalizes phone numbers to digits', () => {
    expect(normalizePixWhitelistKey('+55 (11) 98888-7777')).toBe('5511988887777');
  });

  it('keeps EVP keys trimmed', () => {
    expect(normalizePixWhitelistKey('  a1b2c3d4-e5f6-7890-abcd-ef1234567890  ')).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });

  it('rejects empty keys', () => {
    expect(() => normalizePixWhitelistKey('   ')).toThrow(PixWhitelistValidationError);
  });
});
