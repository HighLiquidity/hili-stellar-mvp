/**
 * CorpX REST paths in this codebase include the `/v1` prefix (e.g. `/v1/accounts/...`).
 * Docs often show the host as `https://tenant.api.corpx.com/v1` — strip a trailing `/v1`
 * so `CORPX_API_URL` works with or without that suffix.
 */
export function normalizeCorpXApiBaseURL(apiBaseURL: string): string {
  return apiBaseURL.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}
