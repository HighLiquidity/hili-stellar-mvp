import { getRampApiBaseUrl, getRampApiKey } from './config';
import type {
  RampApiErrorBody,
  RampOfframpCreateRequest,
  RampOfframpCreateResponse,
  RampOnrampCreateRequest,
  RampOnrampCreateResponse,
  RampOperationDocument,
} from './types';

export class RampApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, httpStatus: number, message: string) {
    super(message);
    this.name = 'RampApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function parseErrorBody(text: string): RampApiErrorBody | null {
  try {
    return JSON.parse(text) as RampApiErrorBody;
  } catch {
    return null;
  }
}

async function rampFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getRampApiBaseUrl();
  const apiKey = getRampApiKey();
  if (!baseUrl || !apiKey) {
    throw new RampApiError('not_configured', 0, 'RAMP_API_BASE_URL or RAMP_API_KEY is not set');
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const body = parseErrorBody(text);
    const code = body?.error?.code ?? 'internal';
    const message = body?.error?.message ?? (text.slice(0, 300) || `HTTP ${res.status}`);
    throw new RampApiError(code, res.status, message);
  }

  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RampApiError('invalid_response', res.status, 'Ramp API returned non-JSON body');
  }
}

export async function createOnrampOperation(
  body: RampOnrampCreateRequest,
): Promise<RampOnrampCreateResponse> {
  return rampFetch<RampOnrampCreateResponse>('/v1/operations/onramp', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function createOfframpOperation(
  body: RampOfframpCreateRequest,
): Promise<RampOfframpCreateResponse> {
  return rampFetch<RampOfframpCreateResponse>('/v1/operations/offramp', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getRampOperation(operationId: string): Promise<RampOperationDocument> {
  return rampFetch<RampOperationDocument>(`/v1/operations/${encodeURIComponent(operationId)}`);
}
