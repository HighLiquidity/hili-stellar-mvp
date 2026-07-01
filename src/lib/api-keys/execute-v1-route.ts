import '@/lib/server/only';

import { NextResponse } from 'next/server';

import type { ApiKeyScope } from './types';
import { ApiRateLimitError } from './errors';
import { findIdempotentResponse, readIdempotencyKey, saveIdempotentResponse } from './idempotency';
import { assertApiKeyRateLimit } from './rate-limit';
import { logApiKeyRequest } from './request-log';
import { apiKeyHasScope, authenticateApiKeySecret, type ApiKeyAuthContext } from './store';

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export type ExecuteV1RouteOptions = {
  request: Request;
  route: string;
  requiredScope?: ApiKeyScope;
  idempotent?: boolean;
  errorHandler: (error: unknown) => NextResponse;
  handler: (ctx: ApiKeyAuthContext) => Promise<NextResponse>;
};

export async function executeV1Route(options: ExecuteV1RouteOptions): Promise<NextResponse> {
  const startedAt = Date.now();
  const method = options.request.method.toUpperCase();
  const idempotencyKey = options.idempotent ? readIdempotencyKey(options.request) : null;

  const secret = getBearerToken(options.request);
  if (!secret) {
    return jsonError('Authorization Bearer API secret is required', 401);
  }

  let ctx: ApiKeyAuthContext | undefined;
  try {
    const authenticated = await authenticateApiKeySecret(secret);
    if (!authenticated) {
      return jsonError('Invalid or revoked API key', 401);
    }
    ctx = authenticated;

    if (options.requiredScope && !apiKeyHasScope(ctx, options.requiredScope)) {
      const response = jsonError(`API key missing required scope: ${options.requiredScope}`, 403);
      await logApiKeyRequest({
        apiKeyId: ctx.apiKeyId,
        keyPrefix: ctx.keyPrefix,
        clientId: ctx.clientId,
        method,
        route: options.route,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        idempotencyKey,
      });
      return response;
    }

    await assertApiKeyRateLimit(ctx.apiKeyId);

    if (idempotencyKey) {
      const cached = await findIdempotentResponse({
        apiKeyId: ctx.apiKeyId,
        route: options.route,
        idempotencyKey,
      });
      if (cached) {
        const response = NextResponse.json(cached.body, { status: cached.statusCode });
        await logApiKeyRequest({
          apiKeyId: ctx.apiKeyId,
          keyPrefix: ctx.keyPrefix,
          method,
          route: options.route,
          statusCode: cached.statusCode,
          durationMs: Date.now() - startedAt,
          idempotencyKey,
        });
        return response;
      }
    }
  } catch (error) {
    if (error instanceof ApiRateLimitError && ctx) {
      const response = jsonError(error.message, error.status);
      await logApiKeyRequest({
        apiKeyId: ctx.apiKeyId,
        keyPrefix: ctx.keyPrefix,
        clientId: ctx.clientId,
        method,
        route: options.route,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        idempotencyKey,
      });
      return response;
    }
    const message = error instanceof Error ? error.message : 'Unauthorized';
    return jsonError(message, 503);
  }

  if (!ctx) {
    return jsonError('Unauthorized', 401);
  }

  let response: NextResponse;
  try {
    response = await options.handler(ctx);
  } catch (error) {
    response = options.errorHandler(error);
  }

  const durationMs = Date.now() - startedAt;
  const statusCode = response.status;

  if (
    options.idempotent &&
    idempotencyKey &&
    statusCode >= 200 &&
    statusCode < 300
  ) {
    try {
      const body = await response.clone().json();
      await saveIdempotentResponse({
        apiKeyId: ctx.apiKeyId,
        route: options.route,
        idempotencyKey,
        statusCode,
        body,
      });
    } catch {
      // Non-JSON success responses are not cached for replay.
    }
  }

  await logApiKeyRequest({
    apiKeyId: ctx.apiKeyId,
    keyPrefix: ctx.keyPrefix,
    clientId: ctx.clientId,
    method,
    route: options.route,
    statusCode,
    durationMs,
    idempotencyKey,
  });

  return response;
}
