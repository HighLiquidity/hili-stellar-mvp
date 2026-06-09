import '@/lib/server/only';

const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeIntegratorExternalId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('externalId must be a non-empty string.');
  }
  if (!EXTERNAL_ID_PATTERN.test(trimmed)) {
    throw new Error(
      'externalId must be 1–128 characters and contain only letters, digits, ".", "_", ":", or "-".',
    );
  }
  return trimmed;
}

export function readOptionalIntegratorExternalId(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    throw new Error('externalId must be a string when provided.');
  }
  return normalizeIntegratorExternalId(value);
}
