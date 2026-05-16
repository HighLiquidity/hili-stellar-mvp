import { describe, expect, it } from 'vitest';

import { CorpXError } from '@/lib/corpx/errors';

import { formatDepositPixErrorMessage } from './format-pix-error';

describe('formatDepositPixErrorMessage', () => {
  it('includes HTTP status, corp code, and body snippet for CorpXError', () => {
    const msg = formatDepositPixErrorMessage(
      new CorpXError('PIX QR generation failed', 'invalid_identifier', 400, '{"message":"too long"}'),
    );
    expect(msg).toContain('PIX QR generation failed');
    expect(msg).toContain('HTTP 400');
    expect(msg).toContain('[invalid_identifier]');
    expect(msg).toContain('too long');
  });

  it('uses Error message for generic errors', () => {
    expect(formatDepositPixErrorMessage(new Error('CorpX login failed: HTTP 401'))).toBe(
      'CorpX login failed: HTTP 401',
    );
  });
});
