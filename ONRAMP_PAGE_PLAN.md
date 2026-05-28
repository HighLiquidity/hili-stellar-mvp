# Onramp Page Plan

## Objetivo

Definir o desenho funcional da nova tela de on-ramp USDC via PIX, separada da
tela legada de deposito fiat.

Esta pagina deve refletir o fluxo descrito no orchestrator design:

1. consultar quote
2. travar quote
3. gerar cobranca PIX
4. aguardar pagamento
5. acompanhar o processamento da ordem
6. informar a entrega de USDC ao usuario

## Decisao de produto / UX

### Direcao escolhida

- criar uma nova tela dedicada: `OnrampPage`
- manter `DepositPage` legada por enquanto
- nao usar modal como estrutura principal da jornada
- usar uma pagina em 2 etapas com painel PIX condicional

### Motivo

O fluxo de on-ramp e uma jornada transacional com duracao de minutos, polling,
status e tratamento de excecao. Modal tende a perder contexto e piorar a
experiencia. Painel contextual dentro da pagina suporta melhor:

- QR code
- copia e cola
- countdown
- status da ordem
- erros e expiracao

## Estrutura da tela

### Layout sugerido

#### Desktop

- coluna principal:
  - formulario da ordem
  - card da quote
  - bloco de status da ordem
- coluna secundaria:
  - painel PIX condicional

#### Mobile

- formulario e quote na pagina
- painel PIX em drawer / bottom sheet quando a quote for travada

## Wireframe textual

### Estado inicial

```text
+---------------------------------------------------------------+
| Comprar USDC via PIX                                          |
| Jornada de on-ramp com quote travada e entrega em wallet      |
+---------------------------------------------------------------+

+----------------------------------------+  +-------------------+
| [Formulario da ordem]                  |  | [Painel PIX]      |
| Tax ID                                 |  | oculto            |
| Valor BRL                              |  |                   |
| Wallet destino USDC                    |  |                   |
|                                        |  |                   |
| [Consultar quote]                      |  |                   |
+----------------------------------------+  +-------------------+

+----------------------------------------+
| [Status da operacao]                   |
| Nenhuma ordem criada ainda             |
+----------------------------------------+
```

### Depois de consultar quote

```text
+----------------------------------------+  +-------------------+
| [Formulario da ordem]                  |  | [Painel PIX]      |
| preenchido                             |  | oculto            |
+----------------------------------------+  +-------------------+

+----------------------------------------+
| [Resumo da quote]                      |
| Voce paga: R$ Y                        |
| Voce recebe: X USDC                    |
| Wallet destino: G...                   |
| Quote valida ate: HH:MM:SS             |
|                                        |
| [Travar quote e gerar PIX] [Editar]    |
+----------------------------------------+

+----------------------------------------+
| [Status da operacao]                   |
| Quote consultada                       |
+----------------------------------------+
```

### Depois de travar quote e gerar cobranca

```text
+----------------------------------------+  +-------------------+
| [Formulario da ordem]                  |  | [Painel PIX]      |
| somente leitura ou travado             |  | QR Code           |
+----------------------------------------+  | PIX copia e cola  |
                                            | Valor BRL         |
+----------------------------------------+  | Expiracao         |
| [Resumo da quote travada]              |  | [Copiar codigo]   |
| Voce paga: R$ Y                        |  | [Baixar resumo]   |
| Voce recebe: X USDC                    |  +-------------------+
| Quote travada ate: HH:MM:SS            |
+----------------------------------------+

+----------------------------------------+
| [Status da operacao]                   |
| 1. Quote travada                       |
| 2. Aguardando pagamento PIX            |
| 3. Pagamento recebido                  |
| 4. Processando ordem                   |
| 5. USDC enviado                        |
| 6. Operacao concluida                  |
+----------------------------------------+
```

### Depois de sucesso

```text
+----------------------------------------+  +-------------------+
| [Resumo final da ordem]                |  | [Painel PIX]      |
| Pago: R$ Y                             |  | oculto ou         |
| Entregue: X USDC                       |  | recolhido         |
| Wallet destino: G...                   |  |                   |
| Tx / referencia: ...                   |  |                   |
|                                        |  |                   |
| [Baixar comprovante]                   |  |                   |
+----------------------------------------+  +-------------------+

+----------------------------------------+
| [Status da operacao]                   |
| USDC enviado / operacao concluida      |
+----------------------------------------+
```

## Campos da tela

### Inputs do usuario

- `taxId`
- `amountBrl`
- `destinationAddress`

### Campos informativos do backend

- `quoteId`
- `orderId`
- `quotedUsdcAmount`
- `quoteExpiresAt`
- `pixTxid`
- `pixCopyPaste`
- `qrDataUrl`
- `orderStatus`
- `failureReason`
- `deliveryTxHash` (quando existir)

## Acoes da tela

### 1. Consultar quote

Entrada:

- tax id
- valor BRL
- wallet destino

Saida esperada:

- quote calculada
- amount USDC estimado/travado
- TTL
- quote id / order draft

### 2. Travar quote e gerar PIX

Entrada:

- quoteId ou dados da quote confirmada

Saida esperada:

- ordem criada
- cobranca PIX criada
- QR code
- copia e cola
- expiracao da cobranca
- status inicial da ordem

### 3. Acompanhar ordem

Entrada:

- orderId

Saida esperada:

- status da ordem
- timestamps principais
- referencias finais quando houver

## Maquina de estados da UI

### Estados principais

- `idle`
- `quoting`
- `quote_ready`
- `locking_quote`
- `awaiting_pix`
- `pix_received`
- `processing`
- `usdc_delivered`
- `complete`
- `expired`
- `failed`
- `refunded`
- `needs_review`

### Transicoes esperadas

- `idle -> quoting`
- `quoting -> quote_ready`
- `quote_ready -> locking_quote`
- `locking_quote -> awaiting_pix`
- `awaiting_pix -> pix_received`
- `pix_received -> processing`
- `processing -> usdc_delivered`
- `usdc_delivered -> complete`

### Estados especiais

- `awaiting_pix -> expired`
- `processing -> needs_review`
- `processing -> refunded`
- `processing -> failed`

## Mapeamento tecnico sugerido para UI

### Estados tecnicos do backend

- `quoted`
- `awaiting_pix`
- `pix_received`
- `brh_sold`
- `usdc_delivered`
- `brh_redeemed`
- `fx_settled`
- `complete`
- `expired`
- `refunded`
- `needs_review`

### Estados visuais agrupados

- `quoted` -> "Quote pronta"
- `awaiting_pix` -> "Aguardando pagamento PIX"
- `pix_received` -> "Pagamento recebido"
- `brh_sold` -> "Processando ordem"
- `usdc_delivered` -> "USDC enviado"
- `complete` -> "Operacao concluida"
- `expired` -> "Quote expirada"
- `refunded` -> "Operacao reembolsada"
- `needs_review` -> "Operacao em revisao"

## Contrato minimo backend / frontend

### A. Consultar quote

Sugestao:

- `POST /api/onramp/quote`

Request:

```json
{
  "taxId": "12345678900",
  "amountBrl": "100.00",
  "destinationAddress": "G..."
}
```

Response:

```json
{
  "quoteId": "quote_123",
  "amountBrl": "100.00",
  "amountUsdc": "17.82",
  "expiresAt": "2026-05-26T15:00:00.000Z",
  "status": "quoted"
}
```

### B. Travar quote e gerar cobranca PIX

Sugestao:

- `POST /api/onramp/order`

Request:

```json
{
  "quoteId": "quote_123"
}
```

Response:

```json
{
  "orderId": "onramp_123",
  "quoteId": "quote_123",
  "amountBrl": "100.00",
  "amountUsdc": "17.82",
  "status": "awaiting_pix",
  "pix": {
    "txid": "corpx_txid",
    "copyPaste": "000201...",
    "qrDataUrl": "data:image/png;base64,...",
    "expiresAt": "2026-05-26T15:05:00.000Z"
  }
}
```

### C. Consultar status da ordem

Sugestao:

- `GET /api/onramp/order/:id`

Response:

```json
{
  "orderId": "onramp_123",
  "status": "usdc_delivered",
  "amountBrl": "100.00",
  "amountUsdc": "17.82",
  "destinationAddress": "G...",
  "pix": {
    "txid": "corpx_txid",
    "expiresAt": "2026-05-26T15:05:00.000Z"
  },
  "timeline": {
    "quotedAt": "2026-05-26T14:58:00.000Z",
    "pixReceivedAt": "2026-05-26T15:00:30.000Z",
    "usdcDeliveredAt": "2026-05-26T15:01:10.000Z"
  },
  "references": {
    "deliveryTxHash": "stellar_tx_hash_or_operation_ref"
  }
}
```

## Componentes sugeridos

- `OnrampOrderForm`
- `OnrampQuoteCard`
- `OnrampPixPanel`
- `OnrampStatusTimeline`
- `OnrampSuccessCard`

## Regras de implementacao recomendadas

- nao reutilizar a `DepositPage` como base principal
- manter `DepositPage` legada temporariamente
- criar rota nova dedicada, ex.: `/app/onramp`
- esconder o painel PIX ate a quote estar travada
- bloquear edicao do formulario apos criacao da cobranca, ou oferecer "cancelar e refazer"
- usar `orderId` como entidade central da tela
- nao depender apenas de polling de `charge-status`; a UI deve acompanhar a ordem inteira

## Decisoes em aberto

1. se a consulta de quote cria ou nao um rascunho de ordem
2. TTL da quote e TTL da cobranca PIX
3. se o frontend podera reabrir ordens em andamento
4. se o comprovante da operacao sera PDF, HTML imprimivel ou ambos
5. se a wallet destino exigira validacao de formato/trustline no frontend ou so no backend

## Proximo passo recomendado

Com este desenho aprovado, a proxima etapa deve ser:

1. definir o contrato real do backend da nova tela
2. criar a nova rota/pagina `OnrampPage`
3. implementar primeiro a UX de:
   - formulario
   - quote
   - geracao de PIX
   - painel PIX
4. depois conectar o bloco de status da ordem
