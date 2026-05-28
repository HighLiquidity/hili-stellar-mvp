# Binance Integration MVP Plan

## Objetivo

Registrar o recorte de implementacao do MVP para a integracao com a Binance,
considerando o novo fluxo de on-ramp descrito no orchestrator design.

Este documento separa:

- o que entra no MVP
- as premissas operacionais aceitas nesta fase
- o que fica explicitamente para depois

## Resumo executivo

Para o MVP, o sistema vai operar com fluxo simplificado e controlado:

1. o usuario recebe uma cotacao travada
2. paga via PIX
3. o sistema registra o evento regulatorio via BRH
4. o usuario recebe USDC a partir de float pre-fundado
5. a recomposicao economica acontece de forma assincrona usando Binance

O modulo Binance atual ja cobre a maior parte do necessario para este recorte:

- ticker
- account info / balances
- market order por `quantity`
- market order por `quoteOrderQty`
- withdraw cripto
- withdraw history
- consulta de configuracao de coin / network

## Novo fluxo de on-ramp no MVP

### Fluxo alvo

1. usuario solicita cotacao `Y BRL -> X USDC`
2. sistema trava quote por um TTL
3. frontend mostra instrucoes PIX
4. PIX e confirmado
5. backend registra `BRL in` como evento BRH
6. backend entrega USDC ao usuario usando float pre-fundado
7. usuario e considerado atendido
8. backend executa reconciliacao assincrona:
   - compra USDC na Binance com BRL
   - registra o evento BRH complementar
   - recompõe o float on-chain

### Regra central do desenho

Para o MVP, Binance nao fica no caminho critico da experiencia do usuario.
Ela entra no plano assincrono de recomposicao de float e travamento economico
da operacao.

## Escopo MVP

### Incluido

- uso de market order por valor da moeda de cotacao:
  - `placeMarketOrderByQuoteAmount({ symbol, side, quoteOrderQty })`
- uso de saque cripto para recompor o `usdc-distributor`
- consulta de redes suportadas por ativo antes do withdraw
- uso das rotas internas Binance apenas como apoio tecnico / validacao
- operacao com conjunto pequeno e controlado de ativos e redes
- reconciliacao operacional inicial baseada em ids persistidos

### Pressupostos aceitos nesta fase

- rede de saque sera previamente definida pelo negocio / operacao
- o fluxo sera operado em ambiente controlado
- os pares negociados serao poucos e conhecidos
- o float sera pre-fundado manualmente ou por rotina simples
- a tolerancia operacional sera maior do que em uma versao hardened de producao

## O que o modulo Binance ja suporta para o MVP

### Infra

- configuracao server-side por env
- assinatura HMAC SHA256
- client HTTP assinado
- tratamento consistente de erro
- testes unitarios focados nas partes puras

### Leitura

- `ping()`
- `getTickerPrice(symbol)`
- `getAccountInfo()`
- `getNonZeroBalances()`

### Trade

- `placeMarketOrder({ symbol, side, quantity })`
- `placeMarketOrderByQuoteAmount({ symbol, side, quoteOrderQty })`

### Withdraw

- `requestCryptoWithdraw({ coin, address, amount, network, ... })`
- `getWithdrawHistory(...)`
- `getWithdrawById(...)`
- `getWithdrawByOrderId(...)`
- `getCoinConfig(...)`
- `getCoinNetworkConfig(...)`
- `getWithdrawEnabledCoinNetworks(...)`

## Fora do escopo do MVP

Os itens abaixo sao importantes, mas nao bloqueiam a entrega da primeira
versao funcional:

1. `clientOrderId` forte nas ordens Binance
2. consulta de ordem por `orderId` / `clientOrderId`
3. validacao de `exchangeInfo`:
   - precision
   - lot size
   - min notional
   - symbol status
4. retry / backoff para falhas transitorias
5. observabilidade mais completa
6. cache para leituras
7. travel rule / local entity flows
8. camada completa de conciliacao automatica entre:
   - PIX
   - orchestrator
   - Ramp API
   - Binance
   - BRH ledger
9. politicas de risco mais avancadas:
   - slippage
   - low/high water
   - bandas de float
   - regras de exposure

## Melhorias pos-MVP

### Prioridade alta

1. adicionar `newClientOrderId` nas market orders
2. implementar query de ordem Binance para reconciliacao
3. adicionar validacao por `exchangeInfo`
4. fortalecer reconciliacao e idempotencia ponta a ponta

### Prioridade media

1. melhorar observabilidade
2. adicionar retry controlado
3. adicionar alertas operacionais
4. criar servicos de negocio intermediarios entre app e modulo Binance

### Prioridade futura

1. suportar mais redes / ativos de forma dinamica
2. automatizar tesouraria / rebalancing loop
3. endurecer governanca operacional para producao

## Plano recomendado de implementacao

### Fase 1 - MVP funcional

- alinhar fluxo final do on-ramp
- ajustar frontend para quote + PIX + status
- ligar backend ao fluxo BRH + USDC delivery
- usar Binance para recompra assincrona por `quoteOrderQty`
- usar withdraw para recomposicao do float

### Fase 2 - Hardened

- reforcar idempotencia de trade
- adicionar query de ordem
- adicionar validacoes de simbolo
- melhorar reconciliacao e observabilidade

## Criterios de sucesso do MVP

O MVP sera considerado bem-sucedido se:

1. a cotacao puder ser criada e exibida ao usuario
2. o PIX puder ser conciliado com a ordem
3. o BRH puder registrar corretamente a entrada de BRL
4. o usuario puder receber USDC com rapidez a partir do float
5. a Binance puder recompor a posicao assincronamente
6. o time tiver rastreabilidade minima para operar e depurar o fluxo

## Observacoes importantes

- Nao assumir suporte de um ativo em qualquer rede sem consultar a Binance.
- Para `USDC`, a rede de withdraw deve ser validada explicitamente.
- O modulo Binance esta pronto para o recorte do MVP, mas nao deve ser tratado
  como "operacao final de producao" sem as melhorias listadas neste plano.
