# Binance Server Module

Server-only integration layer for Binance spot REST endpoints used by the MVP.

## Required env vars

- `BINANCE_BASE_URL`
  - Optional.
  - Default: `https://api.binance.com`
  - Override only when intentionally targeting another Binance environment.
- `BINANCE_API_KEY`
  - Required for signed endpoints such as account and order routes.
- `BINANCE_API_SECRET`
  - Required for signed endpoints such as account and order routes.
- `BINANCE_TIMEOUT`
  - Optional.
  - Timeout in milliseconds for each Binance request.
  - Default: `10000`

## Current capabilities

- Public health check via `ping()`
- Public ticker lookup via `getTickerPrice(symbol)`
- Signed account lookup via `getAccountInfo()`
- Non-zero balance filtering via `getNonZeroBalances()`
- Signed spot market order execution via:
  - `placeMarketOrder({ symbol, side, quantity })`
  - `placeMarketOrderByQuoteAmount({ symbol, side, quoteOrderQty })`
- Signed capital withdraw support via:
  - `requestCryptoWithdraw({ coin, address, amount, network, ... })`
  - `getWithdrawHistory(...)`
  - `getWithdrawById(...)`
  - `getWithdrawByOrderId(...)`
  - `getCoinConfig(...)`
  - `getCoinNetworkConfig(...)`
  - `getWithdrawEnabledCoinNetworks(...)`

## Current limitations

- No retry or backoff for transient upstream failures
- No cache layer for market/account data
- No exchange-info validation for precision, lot size, min notional, or symbol status
- No business-level guardrails before order placement
- Internal utility routes are admin-protected but are not a final public API design
- `quoteOrderQty` support is intentionally restricted to `MARKET` orders in this module
- Travel-rule/local-entity withdraw flows are not implemented (`/sapi/v1/localentity/*`)
- Binance withdraw apply only returns an `id`; richer operational state should be fetched through withdraw history
- This wrapper intentionally requires `network` for withdraws, even though Binance allows omitting it
- Network support for a coin must be checked through capital config; do not assume assets such as `USDC` are withdrawable on a specific network like Stellar without verifying Binance support first

## Security notes

- This module must remain server-only.
- Never expose Binance keys through `NEXT_PUBLIC_*`.
- Route handlers should avoid returning stack traces or raw upstream payloads.
- Do not log request payloads that could be correlated with sensitive trading operations unless properly redacted.
