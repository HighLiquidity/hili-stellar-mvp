import { describe, expect, it } from 'vitest';

import { normalizeCorpXApiBaseURL } from './api-base-url';

describe('normalizeCorpXApiBaseURL', () => {
  it('strips trailing slashes and /v1 suffix', () => {
    expect(normalizeCorpXApiBaseURL('https://tenant.api.corpx.com/v1')).toBe(
      'https://tenant.api.corpx.com',
    );
    expect(normalizeCorpXApiBaseURL('https://tenant.api.corpx.com/v1/')).toBe(
      'https://tenant.api.corpx.com',
    );
  });

  it('leaves host-only base unchanged', () => {
    expect(normalizeCorpXApiBaseURL('https://tenant.api.corpx.com')).toBe(
      'https://tenant.api.corpx.com',
    );
  });
});
