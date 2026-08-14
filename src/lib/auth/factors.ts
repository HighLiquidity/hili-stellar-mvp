export type MfaFactorLike = {
  id?: string;
  factor_type?: string;
  status?: string;
};

export function collectMfaFactors(data: unknown): MfaFactorLike[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  if (Array.isArray(data)) {
    return data as MfaFactorLike[];
  }

  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.factors)) {
    return obj.factors as MfaFactorLike[];
  }
  if (Array.isArray(obj.all)) {
    return obj.all as MfaFactorLike[];
  }

  const totp = Array.isArray(obj.totp) ? (obj.totp as MfaFactorLike[]) : [];
  const phone = Array.isArray(obj.phone) ? (obj.phone as MfaFactorLike[]) : [];
  return [...totp, ...phone];
}

export function verifiedTotpFactors(data: unknown): MfaFactorLike[] {
  return collectMfaFactors(data).filter((factor) => {
    const isTotp = !factor.factor_type || factor.factor_type === 'totp';
    return isTotp && factor.status === 'verified' && Boolean(factor.id);
  });
}

export function unverifiedTotpFactors(data: unknown): MfaFactorLike[] {
  return collectMfaFactors(data).filter((factor) => {
    const isTotp = !factor.factor_type || factor.factor_type === 'totp';
    return isTotp && factor.status === 'unverified' && Boolean(factor.id);
  });
}

export function hasVerifiedTotpFactor(data: unknown): boolean {
  return verifiedTotpFactors(data).length > 0;
}
