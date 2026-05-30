import '@/lib/server/only';

import { BinanceClient, createBinanceClient } from './client';
import { BinanceValidationError } from './errors';

export type BinanceMarketNotionalRules = {
  minNotional: string;
  maxNotional: string | null;
  applyMinToMarket: boolean;
  applyMaxToMarket: boolean;
  quoteOrderQtyMarketAllowed: boolean;
};

type ExchangeInfoFilter = {
  filterType?: string;
  minNotional?: string;
  maxNotional?: string;
  applyMinToMarket?: boolean;
  applyMaxToMarket?: boolean;
  applyToMarket?: boolean;
};

type ExchangeInfoSymbol = {
  symbol?: string;
  quoteOrderQtyMarketAllowed?: boolean;
  filters?: ExchangeInfoFilter[];
};

type ExchangeInfoResponse = {
  symbols?: ExchangeInfoSymbol[];
};

function parsePositiveDecimal(value: string, fieldName: string): number {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new BinanceValidationError(`${fieldName} must be a positive decimal string`);
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BinanceValidationError(`${fieldName} must be greater than zero`);
  }

  return parsed;
}

export function parseMarketNotionalRulesFromFilters(
  filters: ExchangeInfoFilter[] | undefined,
): Omit<BinanceMarketNotionalRules, 'quoteOrderQtyMarketAllowed'> | null {
  if (!filters?.length) return null;

  for (const filter of filters) {
    if (filter.filterType === 'NOTIONAL' && filter.minNotional) {
      return {
        minNotional: filter.minNotional,
        maxNotional: filter.maxNotional?.trim() || null,
        applyMinToMarket: filter.applyMinToMarket ?? true,
        applyMaxToMarket: filter.applyMaxToMarket ?? false,
      };
    }
  }

  for (const filter of filters) {
    if (filter.filterType === 'MIN_NOTIONAL' && filter.minNotional) {
      return {
        minNotional: filter.minNotional,
        maxNotional: null,
        applyMinToMarket: filter.applyToMarket ?? true,
        applyMaxToMarket: false,
      };
    }
  }

  return null;
}

export function readBinanceMinNotionalBrlOverride(): string | null {
  const raw =
    process.env.BINANCE_MARKET_MIN_NOTIONAL_BRL?.trim() ||
    process.env.ONRAMP_BINANCE_MIN_NOTIONAL_BRL?.trim();
  if (!raw) return null;
  parsePositiveDecimal(raw, 'BINANCE_MARKET_MIN_NOTIONAL_BRL');
  return raw;
}

export async function getBinanceMarketNotionalRules(
  symbol: string,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceMarketNotionalRules | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new BinanceValidationError('Binance symbol is required');
  }

  const response = await client.publicGet<ExchangeInfoResponse>('/api/v3/exchangeInfo', {
    symbol: normalizedSymbol,
  });

  const entry = response.symbols?.find((row) => row.symbol?.toUpperCase() === normalizedSymbol);
  if (!entry) return null;

  const notional = parseMarketNotionalRulesFromFilters(entry.filters);
  if (!notional) return null;

  return {
    ...notional,
    quoteOrderQtyMarketAllowed: entry.quoteOrderQtyMarketAllowed ?? true,
  };
}

export function assertBinanceMarketQuoteNotional(
  quoteOrderQtyBrl: string,
  rules: BinanceMarketNotionalRules,
  symbol: string,
): void {
  if (!rules.quoteOrderQtyMarketAllowed) {
    throw new BinanceValidationError(
      `Binance does not allow MARKET orders by quote amount on ${symbol}.`,
    );
  }

  const amount = parsePositiveDecimal(quoteOrderQtyBrl, 'quoteOrderQty');

  if (rules.applyMinToMarket) {
    const min = parsePositiveDecimal(rules.minNotional, 'minNotional');
    if (amount + 1e-9 < min) {
      throw new BinanceValidationError(
        `Filter failure: NOTIONAL — minimum trade size on Binance for ${symbol} is ${rules.minNotional} BRL.`,
      );
    }
  }

  if (rules.applyMaxToMarket && rules.maxNotional) {
    const max = parsePositiveDecimal(rules.maxNotional, 'maxNotional');
    if (amount - 1e-9 > max) {
      throw new BinanceValidationError(
        `Filter failure: NOTIONAL — maximum trade size on Binance for ${symbol} is ${rules.maxNotional} BRL.`,
      );
    }
  }
}

export async function assertBinanceMarketQuoteNotionalForSymbol(
  symbol: string,
  quoteOrderQtyBrl: string,
  client?: BinanceClient,
): Promise<void> {
  const rules = await getBinanceMarketNotionalRules(symbol, client);
  if (rules) {
    assertBinanceMarketQuoteNotional(quoteOrderQtyBrl, rules, symbol);
    return;
  }

  const override = readBinanceMinNotionalBrlOverride();
  if (!override) return;

  assertBinanceMarketQuoteNotional(
    quoteOrderQtyBrl,
    {
      minNotional: override,
      maxNotional: null,
      applyMinToMarket: true,
      applyMaxToMarket: false,
      quoteOrderQtyMarketAllowed: true,
    },
    symbol,
  );
}

export function formatBinanceTradeErrorMessage(error: unknown, symbol: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/NOTIONAL|MIN_NOTIONAL/i.test(message)) {
    return `Valor em BRL abaixo (ou acima) do limite NOTIONAL da Binance para ${symbol}. Use um valor maior na cotação (consulte o mínimo do par USDC/BRL na Binance, em geral ~10 BRL).`;
  }

  return message;
}
