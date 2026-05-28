# Onramp Backend Contract

## Objetivo

Definir o contrato real do backend para a nova jornada de on-ramp USDC via PIX,
alinhado ao orchestrator design e ao que o projeto ja possui implementado hoje:

- CorpX para cobranca PIX
- Ramp API para BRH / USDC on-chain
- modulo Binance para trade e withdraw
- Supabase para persistencia e leitura de status

Este contrato descreve:

- a entidade central da jornada
- rotas internas consumidas pelo frontend
- estados
- regras de autenticacao
- persistencia recomendada
- integracao com os modulos ja existentes

## Principios

1. A entidade central da jornada sera a **ordem de on-ramp**.
2. A quote nao sera uma entidade separada no MVP; ela sera o estado inicial da
   propria ordem (`quoted`), o que simplifica o fluxo e segue melhor a doc do
   orchestrator.
3. As rotas sao **internas ao painel**, nao uma API publica final.
4. A autenticacao deve exigir usuario autenticado no painel com role:
   - `admin`
   - `operator`
5. `viewer` nao deve conseguir criar ou executar on-ramp.
6. O frontend acompanha **a ordem inteira**, e nao apenas o txid da cobranca PIX.

## Entidade central

### `onramp_orders`

Nova tabela principal recomendada para representar toda a jornada.

Ela deve concentrar:

- dados do pedido do usuario
- quote travada
- cobranca PIX
- referencias de BRH
- referencias de entrega USDC
- referencias Binance
- status da ordem

### Campos recomendados

```text
id uuid pk
status text not null

tax_id text not null
amount_brl text not null
amount_usdc text not null
destination_address text not null
destination_memo text null

quote_symbol text not null default 'USDCBRL'
quote_side text not null default 'BUY'
quote_expires_at timestamptz not null
quote_locked_at timestamptz null
quote_rate text null
quote_source text null
quote_spread_bps integer null

corpx_txid text null
corpx_identifier text null
corpx_expires_at timestamptz null
pix_copy_paste text null

brh_sale_external_id text null
brh_sale_ramp_operation_id text null

usdc_delivery_external_id text null
usdc_delivery_ramp_operation_id text null
usdc_delivery_tx_hash text null

binance_symbol text null
binance_side text null
binance_quote_order_qty text null
binance_client_order_id text null
binance_order_id text null
binance_executed_qty text null
binance_cummulative_quote_qty text null
binance_status text null

brh_redemption_external_id text null
brh_redemption_ramp_operation_id text null

binance_withdraw_order_id text null
binance_withdraw_id text null
binance_withdraw_network text null
binance_withdraw_amount text null

failure_code text null
failure_reason text null
needs_review_reason text null

created_by_user_id uuid null
created_by_email text null

quoted_at timestamptz not null
pix_received_at timestamptz null
brh_sold_at timestamptz null
usdc_delivered_at timestamptz null
fx_settled_at timestamptz null
brh_redeemed_at timestamptz null
complete_at timestamptz null
expired_at timestamptz null
refunded_at timestamptz null

metadata jsonb null
created_at timestamptz not null
updated_at timestamptz not null
```

## Estados da ordem

Estados tecnicos recomendados:

- `quoted`
- `awaiting_pix`
- `pix_received`
- `brh_sold`
- `usdc_delivered`
- `fx_settled`
- `brh_redeemed`
- `complete`
- `expired`
- `failed`
- `refunded`
- `needs_review`

### Regra de interpretacao

- `usdc_delivered` = usuario ja foi atendido
- `complete` = reconciliacao assincrona concluida

## Autenticacao e autorizacao

### Escopo

As rotas de on-ramp sao rotas **internas do painel**.

### Regras

- exigir sessao valida do Supabase
- exigir registro ativo em `panel_access_list`
- permitir apenas:
  - `admin`
  - `operator`
- negar:
  - `viewer`
  - usuario anonimo

### Recomendacao tecnica

Seguir o padrao de token bearer ja usado nas rotas internas protegidas:

```http
Authorization: Bearer <supabase_access_token>
```

Criar helper especifico, por exemplo:

- `requireOperatorOrAdminFromAccessToken()`

## Rotas frontend -> backend

## 1. Criar quote

### Endpoint

`POST /api/onramp/orders/quote`

### Objetivo

Criar a ordem em estado `quoted`.

### Request

```json
{
  "taxId": "12345678900",
  "amountBrl": "100.00",
  "destinationAddress": "GABCD...",
  "destinationMemo": null
}
```

### Validacoes

- `taxId` obrigatorio
- `amountBrl` decimal positivo
- `destinationAddress` obrigatorio
- validar formato basico da wallet Stellar
- opcionalmente validar memo se informado

### Comportamento esperado

O backend:

1. valida input
2. calcula quote USDC
3. define TTL
4. persiste ordem com status `quoted`
5. reserva inventario logicamente

### Response 200

```json
{
  "orderId": "onramp_123",
  "status": "quoted",
  "quote": {
    "symbol": "USDCBRL",
    "side": "BUY",
    "amountBrl": "100.00",
    "amountUsdc": "17.82",
    "expiresAt": "2026-05-26T15:00:00.000Z"
  },
  "destination": {
    "address": "GABCD...",
    "memo": null
  }
}
```

## 2. Travar quote e gerar cobranca PIX

### Endpoint

`POST /api/onramp/orders/:id/lock`

### Objetivo

Transformar ordem `quoted` em `awaiting_pix` e gerar cobranca PIX efetiva.

### Request

Sem body obrigatorio para o MVP.

### Pre-condicoes

- ordem existe
- ordem esta em `quoted`
- quote nao expirou
- inventario ainda pode ser reservado

### Comportamento esperado

O backend:

1. carrega ordem
2. valida expiracao da quote
3. gera cobranca PIX via CorpX
4. registra `fiat_deposit_charges`
5. atualiza ordem com:
   - `status=awaiting_pix`
   - `corpx_txid`
   - `corpx_identifier`
   - `pix_copy_paste`
   - `corpx_expires_at`

### Response 200

```json
{
  "orderId": "onramp_123",
  "status": "awaiting_pix",
  "quote": {
    "symbol": "USDCBRL",
    "side": "BUY",
    "amountBrl": "100.00",
    "amountUsdc": "17.82",
    "expiresAt": "2026-05-26T15:00:00.000Z"
  },
  "pix": {
    "txid": "corpx_txid_123",
    "copyPaste": "000201...",
    "qrDataUrl": "data:image/png;base64,...",
    "expiresAt": "2026-05-26T15:05:00.000Z"
  },
  "destination": {
    "address": "GABCD...",
    "memo": null
  }
}
```

## 3. Consultar ordem

### Endpoint

`GET /api/onramp/orders/:id`

### Objetivo

Retornar o estado agregado da ordem para polling da UI.

### Response 200

```json
{
  "orderId": "onramp_123",
  "status": "usdc_delivered",
  "quote": {
    "symbol": "USDCBRL",
    "side": "BUY",
    "amountBrl": "100.00",
    "amountUsdc": "17.82",
    "expiresAt": "2026-05-26T15:00:00.000Z"
  },
  "destination": {
    "address": "GABCD...",
    "memo": null
  },
  "pix": {
    "txid": "corpx_txid_123",
    "copyPaste": "000201...",
    "qrDataUrl": "data:image/png;base64,...",
    "expiresAt": "2026-05-26T15:05:00.000Z",
    "paidAt": "2026-05-26T14:59:00.000Z"
  },
  "timeline": {
    "quotedAt": "2026-05-26T14:58:00.000Z",
    "pixReceivedAt": "2026-05-26T14:59:00.000Z",
    "brhSoldAt": "2026-05-26T14:59:20.000Z",
    "usdcDeliveredAt": "2026-05-26T14:59:45.000Z",
    "fxSettledAt": null,
    "completeAt": null
  },
  "references": {
    "brhSaleExternalId": "onramp:123:brh-sale",
    "usdcDeliveryExternalId": "onramp:123:client-usdc",
    "binanceClientOrderId": "onramp:123:fx",
    "binanceWithdrawOrderId": "onramp:123:usdc-refill",
    "deliveryTxHash": "stellar_tx_hash"
  },
  "failure": null
}
```

## 4. Listar ordens recentes (opcional para MVP)

### Endpoint

`GET /api/onramp/orders?status=...&limit=...`

### Objetivo

Permitir reabrir uma ordem em andamento ou acessar historico recente do operador.

### Observacao

Nao e obrigatorio para a primeira entrega da tela.

## Contrato de erro padrao

Todas as rotas devem retornar erro consistente, sem stack trace:

```json
{
  "error": {
    "code": "QUOTE_EXPIRED",
    "message": "A quote expirou. Consulte uma nova quote.",
    "retryable": true
  }
}
```

### Codigos recomendados

- `UNAUTHORIZED`
- `FORBIDDEN`
- `INVALID_INPUT`
- `QUOTE_EXPIRED`
- `ORDER_NOT_FOUND`
- `ORDER_STATE_INVALID`
- `PIX_CHARGE_FAILED`
- `RAMP_OPERATION_FAILED`
- `BINANCE_TRADE_FAILED`
- `BINANCE_WITHDRAW_FAILED`
- `NEEDS_REVIEW`
- `INTERNAL_ERROR`

## Fluxo interno de orquestracao

## A. Quote criada

Fonte:

- `POST /api/onramp/orders/quote`

Resultado:

- linha em `onramp_orders`
- status `quoted`

## B. Quote travada + PIX criado

Fonte:

- `POST /api/onramp/orders/:id/lock`

Resultado:

- update em `onramp_orders`
- registro em `fiat_deposit_charges`

## C. PIX pago

Fonte:

- webhook CorpX ja existente

Comportamento:

1. localizar `fiat_deposit_charges` por `corpx_txid`
2. localizar `onramp_orders` correspondente
3. marcar ordem como `pix_received`
4. iniciar BRH sale:
   - `POST /onramp asset=BRH category=client`
   - `externalId = onramp:{orderId}:brh-sale`

## D. BRH sold confirmado

Fonte:

- webhook Ramp API

Comportamento:

1. atualizar `ramp_operations`
2. atualizar `onramp_orders`
3. iniciar entrega USDC ao usuario:
   - `POST /onramp asset=USDC category=client`
   - `externalId = onramp:{orderId}:client-usdc`

## E. USDC entregue ao usuario

Fonte:

- webhook Ramp API

Comportamento:

1. atualizar ordem para `usdc_delivered`
2. registrar tx hash de entrega
3. disparar reconciliacao assincrona

## F. Reconciliacao assincrona

Comportamento:

1. executar trade Binance:
   - `symbol = USDCBRL`
   - `side = BUY`
   - `quoteOrderQty = amountBrl`
   - `clientOrderId = onramp:{orderId}:fx`
2. registrar BRH redemption:
   - `externalId = onramp:{orderId}:brh-redemption`
3. sacar USDC da Binance para o `usdc-distributor`:
   - `withdrawOrderId = onramp:{orderId}:usdc-refill`
   - rede previamente validada
4. atualizar ordem conforme callbacks/resultados:
   - `fx_settled`
   - `brh_redeemed`
   - `complete`

## Reaproveitamento do que ja existe no projeto

### Ja existente e reaproveitavel

- `generateDepositPixAction` (como referencia logica, nao necessariamente formato final)
- `fiat_deposit_charges`
- webhook CorpX
- `ramp_operations`
- webhook Ramp
- modulo Binance

### Nova camada necessaria

- `onramp_orders`
- servico de quote
- servico de lock + charge
- agregador de status da ordem
- atualizacao da ordem a partir de webhook CorpX / Ramp

## Idempotencia

### Chaves recomendadas

- ordem: `orderId`
- BRH sale: `onramp:{orderId}:brh-sale`
- USDC client delivery: `onramp:{orderId}:client-usdc`
- Binance trade: `onramp:{orderId}:fx`
- BRH redemption: `onramp:{orderId}:brh-redemption`
- Binance withdraw: `onramp:{orderId}:usdc-refill`
- PIX: `corpx_txid` + dedupe do PSP

### Regra

Cada etapa externa deve persistir estado antes de tentar a chamada e reutilizar a
mesma chave em retries.

## Regras de validacao de MVP

### Quote

- `amountBrl > 0`
- `taxId` presente
- wallet destino presente

### Lock

- ordem em `quoted`
- quote nao expirada

### Entrega

- so tentar USDC client delivery depois de BRH sale confirmado

### Binance

- usar `quoteOrderQty`
- usar rede previamente definida para withdraw
- nao permitir omit de `network` no withdraw wrapper

## Decisoes assumidas neste contrato

1. A quote passa a ser o estado inicial da ordem, e nao uma entidade separada.
2. O frontend consulta e acompanha uma **ordem**, nao um `txid` PIX.
3. O usuario e considerado atendido em `usdc_delivered`.
4. `complete` fica reservado para reconciliacao assincrona concluida.
5. A rota antiga `/api/deposit/charge-status` nao e mais suficiente como fonte
   de verdade da nova tela.

## Pendencias futuras

- query de ordem Binance por `clientOrderId`
- validacao de `exchangeInfo`
- listagem/reabertura de ordens no painel
- comprovante final da operacao
- politicas de retry/backoff
- observabilidade / alertas
