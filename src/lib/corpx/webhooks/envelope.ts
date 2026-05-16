import { CorpXInvalidRequestError } from '../errors';

/** Maps documented / observed CorpX event names to the Go adapter names. */
const EVENT_ALIASES: Record<string, string> = {
  'qrcode.paid': 'qr_code_paid',
  'qrcode_paid': 'qr_code_paid',
  'qr_code.paid': 'qr_code_paid',
  'QRCode.Paid': 'qr_code_paid',
  'pix.qrcode.paid': 'qr_code_paid',
  'pix.in.completed': 'pix_in_received',
  'pix_in.completed': 'pix_in_received',
  'pix.in.received': 'pix_in_received',
  'pix_in.received': 'pix_in_received',
  'pix.out.completed': 'pix_out_completed',
  'pix.out.failed': 'pix_out_failed',
};

export function normalizeCorpXWebhookEventType(raw: string): string {
  const key = raw.trim();
  return EVENT_ALIASES[key] ?? key;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

const META_KEYS = new Set([
  'event',
  'type',
  'eventType',
  'timestamp',
  'tenantId',
  'occurredAt',
  'data',
]);

function stripEnvelope(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (META_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Parses CorpX webhook JSON: event type from `X-Webhook-Event` header or body;
 * payload prefers `data`, otherwise body without common envelope keys.
 */
export function parseCorpXWebhookEnvelope(
  json: unknown,
  headerEventType: string | null,
): { eventType: string; payload: unknown } {
  if (!isRecord(json)) {
    throw new CorpXInvalidRequestError('Webhook body must be a JSON object');
  }

  const fromBody =
    json.event ?? json.type ?? json.eventType ?? json.name ?? json.event_name;
  const rawType = String(headerEventType ?? fromBody ?? '').trim();
  if (!rawType) {
    throw new CorpXInvalidRequestError('Missing webhook event type');
  }

  const eventType = normalizeCorpXWebhookEventType(rawType);

  let payload: unknown = json.data;
  if (payload === undefined) {
    payload = stripEnvelope(json);
  }

  return { eventType, payload };
}
