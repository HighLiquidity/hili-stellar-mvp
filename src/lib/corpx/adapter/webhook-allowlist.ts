import { loadCorpXWebhookIpAllowlist } from '../webhooks/allowlist';

/**
 * Go `NewCorpXAdapter` used a CSV-only list when non-empty. If `CORPX_WEBHOOK_IPS` is set,
 * only those IPs are allowed for {@link CorpXAdapter.validateWebhookIp}. Otherwise the same
 * defaults + `CORPX_WEBHOOK_ALLOWED_IPS` as the webhook route are used.
 */
export function loadWebhookAllowlistForAdapter(): Set<string> {
  const csv = process.env.CORPX_WEBHOOK_IPS?.trim();
  if (csv) {
    const set = new Set<string>();
    for (const part of csv.split(',')) {
      const ip = part.trim();
      if (ip) set.add(ip);
    }
    return set;
  }
  return loadCorpXWebhookIpAllowlist();
}
