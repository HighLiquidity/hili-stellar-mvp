import '@/lib/server/only';

import { NextResponse } from 'next/server';

import {
  BinanceConfigError,
  BinanceRequestError,
  BinanceValidationError,
} from '@/lib/server/binance';
import {
  OnrampConfigError,
  OnrampOperationError,
  OnrampValidationError,
} from '@/lib/onramp/errors';
import {
  requireOperatorOrAdminFromAccessToken,
  type PanelAccessContext,
} from '@/lib/users/require-panel-role';

type RouteAuthResult =
  | { ok: true; ctx: PanelAccessContext }
  | { ok: false; response: NextResponse };

function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Internal on-ramp routes are restricted to admin and operator panel users. */
export async function requireOnrampRouteOperator(request: Request): Promise<RouteAuthResult> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return {
      ok: false,
      response: jsonError('Authorization Bearer token is required', 401),
    };
  }

  try {
    const ctx = await requireOperatorOrAdminFromAccessToken(accessToken);
    return { ok: true, ctx };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status =
      message === 'Acesso restrito a administradores ou operadores.'
        ? 403
        : message === 'Acesso restrito a administradores.'
          ? 403
          : 401;

    return {
      ok: false,
      response: jsonError(message, status),
    };
  }
}

export function badRequest(message: string) {
  return jsonError(message, 400);
}

export function handleOnrampRouteError(error: unknown) {
  if (error instanceof OnrampValidationError || error instanceof BinanceValidationError) {
    return jsonError(error.message, 400);
  }

  if (error instanceof OnrampConfigError || error instanceof BinanceConfigError) {
    return jsonError(error.message, 503);
  }

  if (error instanceof BinanceRequestError) {
    return jsonError(error.message, 502, {
      code: error.code,
      upstreamStatus: error.status || undefined,
    });
  }

  if (error instanceof OnrampOperationError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof SyntaxError) {
    return jsonError('Invalid JSON', 400);
  }

  console.error('[api/onramp] unexpected route error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });

  return jsonError('Internal server error', 500);
}
