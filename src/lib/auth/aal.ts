export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getAalFromAccessToken(accessToken: string): AuthenticatorAssuranceLevel | null {
  const aal = decodeJwtPayload(accessToken)?.aal;
  if (aal === 'aal1' || aal === 'aal2') {
    return aal;
  }

  return null;
}

export function sessionNeedsMfaChallenge(
  currentLevel: string | null | undefined,
  nextLevel: string | null | undefined,
): boolean {
  return nextLevel === 'aal2' && currentLevel !== 'aal2';
}

export function mfaSessionIsInsufficient(
  aal: AuthenticatorAssuranceLevel | null,
  hasVerifiedTotp: boolean,
): boolean {
  return hasVerifiedTotp && aal !== 'aal2';
}
