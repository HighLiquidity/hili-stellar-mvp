export function getRampApiBaseUrl(): string | null {
  const url = process.env.RAMP_API_BASE_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

export function getRampApiKey(): string | null {
  const key = process.env.RAMP_API_KEY?.trim();
  return key || null;
}

export function getRampCallbackSecret(): string | null {
  const secret = process.env.RAMP_CALLBACK_SECRET?.trim();
  return secret || null;
}

/** Absolute HTTPS URL for Ramp operation callbacks. */
export function getRampCallbackUrl(): string | null {
  const explicit = process.env.RAMP_CALLBACK_URL?.trim();
  if (explicit) return explicit;

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '');
  if (!site) return null;
  return `${site}/api/webhooks/ramp`;
}

export function isRampConfigured(): boolean {
  return Boolean(getRampApiBaseUrl() && getRampApiKey() && getRampCallbackUrl());
}
