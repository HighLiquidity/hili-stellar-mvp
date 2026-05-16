import { CorpXError } from '@/lib/corpx/errors';

const MAX_BODY_SNIPPET = 400;

/** User-facing text for deposit PIX failures (server action → client). */
export function formatDepositPixErrorMessage(error: unknown): string {
  if (error instanceof CorpXError) {
    const parts: string[] = [];
    if (error.message.trim()) parts.push(error.message.trim());
    if (error.httpStatus != null) parts.push(`HTTP ${error.httpStatus}`);
    if (error.corpCode?.trim()) parts.push(`[${error.corpCode.trim()}]`);
    const snippet = error.bodySnippet?.trim();
    if (snippet && !error.message.includes(snippet.slice(0, 60))) {
      parts.push(snippet.slice(0, MAX_BODY_SNIPPET));
    }
    return parts.join(' · ');
  }

  if (error instanceof Error) return error.message.trim() || error.name;
  return String(error);
}
