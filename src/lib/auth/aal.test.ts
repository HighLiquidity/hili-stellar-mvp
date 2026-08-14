import { describe, expect, it } from 'vitest';

import {
  getAalFromAccessToken,
  mfaSessionIsInsufficient,
  sessionNeedsMfaChallenge,
} from './aal';

function makeJwt(payload: Record<string, unknown>): string {
  const json = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `header.${json}.sig`;
}

describe('getAalFromAccessToken', () => {
  it('reads aal1 and aal2 from the JWT payload', () => {
    expect(getAalFromAccessToken(makeJwt({ aal: 'aal1' }))).toBe('aal1');
    expect(getAalFromAccessToken(makeJwt({ aal: 'aal2' }))).toBe('aal2');
  });

  it('returns null for missing or unknown aal', () => {
    expect(getAalFromAccessToken(makeJwt({ sub: 'user' }))).toBeNull();
    expect(getAalFromAccessToken(makeJwt({ aal: 'aal3' }))).toBeNull();
    expect(getAalFromAccessToken('not-a-jwt')).toBeNull();
  });
});

describe('sessionNeedsMfaChallenge', () => {
  it('is true only when a verified factor exists and the session is still aal1', () => {
    expect(sessionNeedsMfaChallenge('aal1', 'aal2')).toBe(true);
    expect(sessionNeedsMfaChallenge('aal2', 'aal2')).toBe(false);
    expect(sessionNeedsMfaChallenge('aal1', 'aal1')).toBe(false);
    expect(sessionNeedsMfaChallenge(null, null)).toBe(false);
  });
});

describe('mfaSessionIsInsufficient', () => {
  it('rejects aal1 when the user has verified TOTP', () => {
    expect(mfaSessionIsInsufficient('aal1', true)).toBe(true);
    expect(mfaSessionIsInsufficient(null, true)).toBe(true);
    expect(mfaSessionIsInsufficient('aal2', true)).toBe(false);
    expect(mfaSessionIsInsufficient('aal1', false)).toBe(false);
  });
});
