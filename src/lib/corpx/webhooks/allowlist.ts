/**
 * CorpX outbound webhook IPs (production) from integrator guide.
 * https://docs.corpxapi.com/docs/integrators-guide
 */
export const DEFAULT_CORPX_WEBHOOK_IPS: readonly string[] = [
  '34.138.140.223',
  '34.138.161.100',
  '35.231.250.193',
  '35.196.71.29',
  '34.138.56.192',
];

/**
 * Builds the allowlist: default CorpX IPs plus optional extras from
 * `CORPX_WEBHOOK_ALLOWED_IPS` (comma-separated).
 */
export function loadCorpXWebhookIpAllowlist(): Set<string> {
  const set = new Set<string>(DEFAULT_CORPX_WEBHOOK_IPS);
  const extra = process.env.CORPX_WEBHOOK_ALLOWED_IPS?.trim();
  if (extra) {
    for (const part of extra.split(',')) {
      const ip = part.trim();
      if (ip) set.add(ip);
    }
  }
  return set;
}

/**
 * Best-effort client IP for serverless (Vercel: `x-forwarded-for` first hop).
 */
export function getRequestClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim();
  return 'unknown';
}
