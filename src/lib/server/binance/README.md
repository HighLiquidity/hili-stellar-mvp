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
- `BINANCE_LOCAL_ADDRESS`
  - Optional.
  - Host IPv4/IPv6 used as the TCP source address for Binance requests.
  - Must be an address assigned to the production NIC.
- `BINANCE_API_KEY_SECONDARY` / `BINANCE_API_SECRET_SECONDARY`
  - Optional second API key of the **same** Binance account, bound to the other production egress IP.
  - Both must be set together. When present, signed calls retry **once** on Binance `-2015` (invalid API-key / IP / permissions) with this profile.
- `BINANCE_LOCAL_ADDRESS_SECONDARY`
  - Optional source address for the secondary profile.
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
- Signed capital deposit address via:
  - `getDepositAddress({ coin, network })` → `GET /sapi/v1/capital/deposit/address`
  - Crypto cannot be deposited by a push API; send on-chain to the returned `address` + `tag`
- Signed fiat (BRL / PIX) support via:
  - `createFiatDeposit({ amount, currency?, apiPaymentMethod? })` → `POST /sapi/v1/fiat/deposit`
  - `createFiatWithdraw({ amount, accountInfo, currency?, apiPaymentMethod? })` → `POST /sapi/v2/fiat/withdraw`
  - `getFiatOrderDetail(orderNo)` → `GET /sapi/v1/fiat/get-order-detail`
  - `getFiatOrders({ transactionType, ... })` → `GET /sapi/v1/fiat/orders`
  - Client helper `signedPostJson` (query signature + JSON body)

## Current limitations

- No generic retry or backoff for transient upstream failures. The only retry is a single signed-call failover on `-2015` when a secondary egress profile is configured. Timeouts, 5xx, and other codes are not retried (fiat SAPI has no client idempotency key).
- No cache layer for market/account data
- No exchange-info validation for precision, lot size, min notional, or symbol status
- No business-level guardrails before order placement
- Internal utility routes are admin-protected but are not a final public API design
- `quoteOrderQty` support is intentionally restricted to `MARKET` orders in this module
- Travel-rule/local-entity withdraw flows are not implemented (`/sapi/v1/localentity/*`)
- Binance withdraw apply only returns an `id`; richer operational state should be fetched through withdraw history
- This wrapper intentionally requires `network` for withdraws, even though Binance allows omitting it
- Network support for a coin must be checked through capital config; do not assume assets such as `USDC` are withdrawable on a specific network like Stellar without verifying Binance support first
- Fiat deposit / withdraw require KYC/KYB + fiat services enabled; API key needs TRADE / WITHDRAW as applicable
- `POST /sapi/v1/fiat/deposit` has a very high UID weight (45000) — call sparingly
- Fiat withdraw uses `POST /sapi/v2/fiat/withdraw` with `bank_transfer` to a **pre-bound** bank account
- Fiat deposit create returns an `orderId`; whether PIX EMV/QR is available via `get-order-detail` must be confirmed with a production smoke test (see checklist below)

## Fiat BRL/PIX smoke checklist (admin)

Admin routes (Bearer admin token), preferably from the production IP allowlist:

### Deposit (CorpX → Binance funding)

1. `GET /api/binance/fiat/orders?transactionType=0` — confirms fiat deposit history access
2. `POST /api/binance/fiat/deposit` with `{ "amount": 30, "confirm": true }` — creates a real deposit order (omit `confirm` to refuse)
3. `GET /api/binance/fiat/order?orderNo=<id>` — inspect response for PIX fields (`qr`, `emv`, `qrCode`, `pixKey`, `ext`, …)
4. Record finding: “PIX utilizável via API?” yes/no → unlocks CorpX→Binance treasury design

**Known prod finding (2026-07-29):** `get-order-detail` may first return
`ORDER_INITIAL` with empty `ext`, then `ORDER_NEED_ADDITIONAL_ACTION` with
`ext.qrCode` (uppercase `BR.GOV.BCB.PIX`). Treasury transfer polls up to ~60s for
that EMV (QR/copia-e-cola) and pays it via CorpX `/pix/out/qr-code/async`. A
decoded PIX key is not used — Binance matches the cobranca to that QR. If EMV
never appears, fail the run and pay the order manually.

### Withdraw (Binance → CorpX funding)

1. Bind the CorpX bank account on Binance web/app, then set:
   `BINANCE_BRL_WITHDRAW_ACCOUNT_NUMBER` (+ optional agency / bankCodeForPix / accountType)
2. `GET /api/binance/fiat/orders?transactionType=1` — confirms fiat withdraw history access
3. `POST /api/binance/fiat/withdraw` with `{ "amount": 20, "confirm": true }` — creates a real withdraw
4. `GET /api/binance/fiat/order?orderNo=<id>` — poll until success/failure
5. Confirm BRL credited on CorpX; treasury UI uses kind `binance_brl_to_corpx`

Do **not** pay a decoded/static PIX key for Binance fiat deposits — only the order QR/EMV identifies the cobranca.
Do **not** automate Binance→CorpX withdraw until withdraw smoke above succeeds with the bound account.

## Security notes

- This module must remain server-only.
- Never expose Binance keys through `NEXT_PUBLIC_*`.
- Route handlers should avoid returning stack traces or raw upstream payloads.
- Do not log request payloads that could be correlated with sensitive trading operations unless properly redacted.
- Dual egress keys must belong to the same Binance account. Failover reuses the original `newClientOrderId` / `withdrawOrderId` and only runs after a `-2015` rejection (request was not authorized).
