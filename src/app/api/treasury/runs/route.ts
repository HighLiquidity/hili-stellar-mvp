import { NextResponse } from 'next/server';

import { runTreasuryBinanceBrlToCorpx } from '@/lib/treasury/brl-receive';
import { runTreasuryCorpxBrlToBinance } from '@/lib/treasury/brl-transfer';
import { runTreasuryBinanceRefill } from '@/lib/treasury/refill';
import { listTreasuryRuns } from '@/lib/treasury/runs-store';
import type { TreasuryRefillAsset, TreasuryRunKind } from '@/lib/treasury/run-types';

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
  amountBrl?: unknown;
  asset?: unknown;
  kind?: unknown;
};

function parseAsset(raw: unknown): TreasuryRefillAsset | null {
  if (raw === 'USDC' || raw === 'XLM') return raw;
  return null;
}

function parseKind(raw: unknown): TreasuryRunKind | null {
  if (
    raw === 'binance_usdc_refill' ||
    raw === 'binance_xlm_refill' ||
    raw === 'corpx_brl_to_binance' ||
    raw === 'binance_brl_to_corpx'
  ) {
    return raw;
  }
  return null;
}

function readAmountString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

/** Dry-run or execute a treasury capital move (admin). */
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

    const kind =
      parseKind(body.kind) ??
      (body.kind == null && body.asset == null
        ? 'binance_usdc_refill'
        : body.kind == null && parseAsset(body.asset)
          ? body.asset === 'XLM'
            ? 'binance_xlm_refill'
            : 'binance_usdc_refill'
          : null);

    if (!kind) {
      return jsonError(
        'kind must be binance_usdc_refill, binance_xlm_refill, corpx_brl_to_binance, or binance_brl_to_corpx',
        400,
      );
    }

    const actor = {
      userId: auth.ctx.userId,
      email: auth.ctx.email,
    };

    try {
      if (kind === 'corpx_brl_to_binance' || kind === 'binance_brl_to_corpx') {
        const amountBrl = readAmountString(body.amountBrl, body.amount);
        if (!body.dryRun && !amountBrl) {
          return jsonError(
            'amountBrl (or amount) is required when dryRun is false.',
            400,
          );
        }

        if (kind === 'binance_brl_to_corpx') {
          const result = await runTreasuryBinanceBrlToCorpx({
            dryRun: body.dryRun,
            amountBrl,
            trigger: 'manual',
            actor,
          });

          return NextResponse.json(
            {
              dryRun: result.dryRun,
              plan: result.plan,
              run: result.run,
              ...(result.binanceOrder ? { binanceOrder: result.binanceOrder } : {}),
            },
            { status: body.dryRun ? 200 : 201 },
          );
        }

        const result = await runTreasuryCorpxBrlToBinance({
          dryRun: body.dryRun,
          amountBrl,
          trigger: 'manual',
          actor,
        });

        return NextResponse.json(
          {
            dryRun: result.dryRun,
            plan: result.plan,
            run: result.run,
            ...(result.binanceOrder ? { binanceOrder: result.binanceOrder } : {}),
          },
          { status: body.dryRun ? 200 : 201 },
        );
      }

      const asset: TreasuryRefillAsset =
        parseAsset(body.asset) ?? (kind === 'binance_xlm_refill' ? 'XLM' : 'USDC');

      const amountFromBody = readAmountString(body.amount, body.amountUsdc);
      if (!body.dryRun && !amountFromBody) {
        return jsonError(
          'amount is required when dryRun is false (use dry-run preview amount).',
          400,
        );
      }

      const result = await runTreasuryBinanceRefill({
        dryRun: body.dryRun,
        asset,
        amount: amountFromBody,
        trigger: 'manual',
        actor,
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
        /must be at least|exceeds (Binance|CorpX)|must be a positive|required for treasury|BINANCE_BRL_WITHDRAW|Invalid (USDC|XLM|BRL)|2 decimals/i.test(
          message,
        );
      return jsonError(message, isValidation ? 400 : 502);
    }
  } catch (error) {
    return handleTreasuryRouteError(error);
  }
}
