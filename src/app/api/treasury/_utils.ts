import '@/lib/server/only';

import { NextResponse } from 'next/server';

import { requireAdminFromAccessToken } from '@/lib/users/require-admin';
import type { PanelAccessContext } from '@/lib/users/require-panel-role';

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status });
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Internal admin-only guard for treasury routes. */
export async function requireTreasuryRouteAdmin(request: Request): Promise<NextResponse | null> {
  const result = await requireTreasuryAdminContext(request);
  return result.ok ? null : result.response;
}

export async function requireTreasuryAdminContext(
  request: Request,
): Promise<{ ok: true; ctx: PanelAccessContext } | { ok: false; response: NextResponse }> {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return { ok: false, response: jsonError('Authorization Bearer token is required', 401) };
  }

  try {
    const ctx = await requireAdminFromAccessToken(accessToken);
    return { ok: true, ctx };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status = message === 'Acesso restrito a administradores.' ? 403 : 401;
    return { ok: false, response: jsonError(message, status) };
  }
}

export function handleTreasuryRouteError(error: unknown) {
  console.error('[api/treasury] unexpected route error', {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });

  return jsonError('Internal server error', 500);
}
