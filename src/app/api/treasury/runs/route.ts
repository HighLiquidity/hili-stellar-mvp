import { NextResponse } from 'next/server';

import { runTreasuryBinanceRefill } from '@/lib/treasury/refill';
import { listTreasuryRuns } from '@/lib/treasury/runs-store';
import type { TreasuryRefillAsset } from '@/lib/treasury/run-types';

import {
  handleTreasuryRouteError,
  jsonError,
  requireTreasuryAdminContext,
  requireTreasuryRouteAdmin,
} from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List recent treasury runs (admin). */
export async function GET(request: Request) {
  const authError = await requireTreasuryRouteAdmin(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '20');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const runs = await listTreasuryRuns(limit);
    return NextResponse.json({ runs }, { status: 200 });
  } catch (error) {
    return handleTreasuryRouteError(error);
  }
}

type PostBody = {
  dryRun?: unknown;
  amount?: unknown;
  amountUsdc?: unknown;
  asset?: unknown;
  kind?: unknown;
};

function parseAsset(raw: unknown): TreasuryRefillAsset | null {
  if (raw === 'USDC' || raw === 'XLM') return raw;
  return null;
}

function assetFromKind(kind: unknown): TreasuryRefillAsset | null {
  if (kind === 'binance_usdc_refill') return 'USDC';
  if (kind === 'binance_xlm_refill') return 'XLM';
  return null;
}

/** Dry-run or execute a Binance → distributor refill (admin). */
export async function POST(request: Request) {
  const auth = await requireTreasuryAdminContext(request);
  if (!auth.ok) return auth.response;

  try {
    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    if (typeof body.dryRun !== 'boolean') {
      return jsonError('dryRun (boolean) is required', 400);
    }

    const asset =
      parseAsset(body.asset) ??
      assetFromKind(body.kind) ??
      (body.asset == null && body.kind == null ? 'USDC' : null);

    if (!asset) {
      return jsonError('asset must be USDC or XLM', 400);
    }

    if (
      body.kind != null &&
      body.kind !== 'binance_usdc_refill' &&
      body.kind !== 'binance_xlm_refill'
    ) {
      return jsonError('Unsupported treasury run kind', 400);
    }

    const amountFromBody =
      typeof body.amount === 'string' && body.amount.trim()
        ? body.amount.trim()
        : typeof body.amountUsdc === 'string' && body.amountUsdc.trim()
          ? body.amountUsdc.trim()
          : null;

    if (!body.dryRun && !amountFromBody) {
      return jsonError(
        'amount is required when dryRun is false (use dry-run preview amount).',
        400,
      );
    }

    try {
      const result = await runTreasuryBinanceRefill({
        dryRun: body.dryRun,
        asset,
        amount: amountFromBody,
        trigger: 'manual',
        actor: {
          userId: auth.ctx.userId,
          email: auth.ctx.email,
        },
      });

      return NextResponse.json(
        {
          dryRun: result.dryRun,
          plan: result.plan,
          run: result.run,
        },
        { status: body.dryRun ? 200 : 201 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isValidation =
        /must be at least|exceeds Binance|must be a positive|required for treasury|Invalid (USDC|XLM)/i.test(
          message,
        );
      return jsonError(message, isValidation ? 400 : 502);
    }
  } catch (error) {
    return handleTreasuryRouteError(error);
  }
}
