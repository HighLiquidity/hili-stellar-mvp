/** SPI user-to-user PIX message (`campo livre`) is ASCII-only; BACEN rejects arrows such as `→`. */
export const PIX_USER_MESSAGE_MAX_LENGTH = 140;

const ARROWS = /[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F]/g;
const UNICODE_DASHES = /[\u2010-\u2015\u2212]/g;
const NON_ASCII = /[^\x20-\x7E]/g;
const DISALLOWED_ASCII = /[^A-Za-z0-9 .,:/_+\-#()]/g;

/**
 * Returns a BACEN-safe PIX message, or undefined when nothing usable remains
 * (omitting the field is valid — that is what settled the R$125 treasury PIX).
 */
export function sanitizePixUserMessage(value: string | undefined | null): string | undefined {
  if (!value) return undefined;

  const cleaned = value
    .normalize('NFKD')
    .replace(ARROWS, '-')
    .replace(UNICODE_DASHES, '-')
    .replace(NON_ASCII, '')
    .replace(DISALLOWED_ASCII, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PIX_USER_MESSAGE_MAX_LENGTH);

  return cleaned || undefined;
}

export function optionalPixApiField(
  key: 'message' | 'description',
  value: string | undefined,
): Partial<Record<'message' | 'description', string>> {
  const cleaned = sanitizePixUserMessage(value);
  return cleaned ? { [key]: cleaned } : {};
}
