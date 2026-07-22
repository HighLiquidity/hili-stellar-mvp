import '@/lib/server/only';

import { NextResponse } from 'next/server';

import { resolveListClientId, resolvePanelDataScope } from '@/lib/clients/scope';
import type { LedgerTypeFilter } from '@/lib/ledger/filters';
import { fetchLedgerPage } from '@/lib/ledger/query-entries';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { requirePanelMemberFromAccessToken } from '@/lib/users/require-panel-role';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readQueryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization')?.trim();
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function parseLedgerType(value: string | undefined): LedgerTypeFilter {
  if (value === 'deposit' || value === 'withdraw') {
    return value;
  }
  return 'all';
}

export async function GET(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: 'Authorization Bearer token is required' }, { status: 401 });
  }

  try {
    const ctx = await requirePanelMemberFromAccessToken(accessToken);
    const admin = createSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Supabase admin client is not configured' }, { status: 503 });
    }

    const url = new URL(request.url);
    const pageRaw = readQueryParam(url, 'page');
    const pageSizeRaw = readQueryParam(url, 'pageSize');
    const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
    const pageSize = pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : 25;

    const scope = resolvePanelDataScope(ctx);
    const result = await fetchLedgerPage(
      admin,
      {
        dateFrom: readQueryParam(url, 'dateFrom'),
        dateTo: readQueryParam(url, 'dateTo'),
        type: parseLedgerType(readQueryParam(url, 'type')),
        clientId: resolveListClientId(scope),
      },
      page,
      pageSize,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const status = message.includes('não autorizado') || message.includes('restrito') ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
