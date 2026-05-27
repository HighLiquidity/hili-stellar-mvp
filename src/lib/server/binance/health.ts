import '@/lib/server/only';

import { BinanceClient, createBinanceClient } from './client';
import type { BinancePingResult } from './types';

/** Lightweight connectivity checks for the Binance REST API. */
export async function ping(client: BinanceClient = createBinanceClient()): Promise<BinancePingResult> {
  await client.publicGet<Record<string, never>>('/api/v3/ping');
  return { ok: true };
}
