import { NextResponse } from 'next/server';

import { resolveListClientId, resolvePanelDataScope } from '@/lib/clients/scope';
import { listOnrampOrders } from '@/lib/onramp/list-orders';

import { handleOnrampRouteError, requireOnrampRouteOperator } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readQueryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim();
  return value || undefined;
}

export async function GET(request: Request) {
  const auth = await requireOnrampRouteOperator(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const pageRaw = readQueryParam(url, 'page');
  const pageSizeRaw = readQueryParam(url, 'pageSize');

  try {
    const scope = resolvePanelDataScope(auth.ctx);
    const result = await listOnrampOrders({
      page: pageRaw ? Number.parseInt(pageRaw, 10) : undefined,
      pageSize: pageSizeRaw ? Number.parseInt(pageSizeRaw, 10) : undefined,
      status: readQueryParam(url, 'status'),
      dateFrom: readQueryParam(url, 'dateFrom'),
      dateTo: readQueryParam(url, 'dateTo'),
      clientId: resolveListClientId(scope),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleOnrampRouteError(error);
  }
}
