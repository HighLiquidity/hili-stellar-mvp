import { describe, expect, it } from 'vitest';

import {
  optionalPixApiField,
  PIX_USER_MESSAGE_MAX_LENGTH,
  sanitizePixUserMessage,
} from './user-message';

describe('sanitizePixUserMessage', () => {
  it('replaces the BACEN-rejected arrow used in treasury PIX', () => {
    expect(sanitizePixUserMessage('Treasury BRL→Binance run-1')).toBe('Treasury BRL-Binance run-1');
  });

  it('strips accents and other non-ASCII', () => {
    expect(sanitizePixUserMessage('Pagamento João')).toBe('Pagamento Joao');
  });

  it('returns undefined for empty or arrow-only input', () => {
    expect(sanitizePixUserMessage('')).toBeUndefined();
    expect(sanitizePixUserMessage('   ')).toBeUndefined();
    expect(sanitizePixUserMessage(null)).toBeUndefined();
  });

  it('keeps a hyphen when the message is only an arrow', () => {
    expect(sanitizePixUserMessage('→')).toBe('-');
  });

  it('truncates to the SPI max length', () => {
    const long = `Treasury ${'x'.repeat(200)}`;
    const cleaned = sanitizePixUserMessage(long);
    expect(cleaned).toHaveLength(PIX_USER_MESSAGE_MAX_LENGTH);
  });
});

describe('optionalPixApiField', () => {
  it('omits the field when sanitizing leaves nothing', () => {
    expect(optionalPixApiField('message', '   ')).toEqual({});
  });

  it('sets description after sanitizing', () => {
    expect(optionalPixApiField('description', 'Treasury BRL→Binance abc')).toEqual({
      description: 'Treasury BRL-Binance abc',
    });
  });
});
