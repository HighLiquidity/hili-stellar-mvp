# Hi-Li :: Stellar MVP

**Languages:** [Português](#português) · [English](#english)

---

<a id="português"></a>

## Português

Painel web para operações **BRL ⇄ USDC** no ecossistema Stellar, com fluxos de **on-ramp** (PIX → USDC) e **off-ramp** (USDC → PIX), autenticação Supabase e integrações com CorpX, Ramp API e Binance.

Ambiente de **demonstração** — não é produto final nem API pública multi-tenant (em roadmap).

### Funcionalidades

| Área | Descrição |
|------|-----------|
| **On-ramp** | Cotação → lock → cobrança PIX (CorpX) → entrega USDC via Ramp |
| **Off-ramp** | Cotação → lock → depósito USDC → liquidação PIX |
| **Ordens** | Listagem e acompanhamento de ordens on/off-ramp |
| **Depósito / saque fiat** | Fluxos PIX legados do MVP (CorpX + ledger BRH) |
| **Dashboard** | KPIs, saldo BRH e visão operacional |
| **Admin** | Gestão de usuários do painel, whitelist de wallets USDC e chaves PIX, logs de eventos, limites de teste |
| **i18n** | Português e inglês |
| **Tema** | Claro / escuro persistente |

#### Perfis de acesso

O painel exige conta no **Supabase Auth** e registro ativo em `public.panel_access_list`:

| Perfil | Acesso |
|--------|--------|
| `admin` | Tudo, incluindo gestão de usuários e whitelists |
| `operator` | On-ramp, off-ramp, ordens e whitelists do próprio usuário |
| `viewer` | Áreas de consulta (sem criar ordens ramp) |

### Stack

- **Next.js 15** (App Router) + **React 18** + **TypeScript**
- **Supabase** — Auth, Postgres, RLS
- **CSS** com custom properties (design system próprio)
- **Vitest** — testes unitários
- Integrações server-side: **CorpX** (PIX), **Ramp API** (BRH/USDC on-chain), **Binance** (FX e refill)

### Como rodar

```bash
npm install
cp .env.example .env.local   # preencher variáveis (ver abaixo)
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

#### Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor após build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |

#### Supabase

1. Crie um projeto no [Supabase](https://supabase.com) ou use o existente.
2. Aplique as migrations em `supabase/migrations/` (ordem cronológica pelo prefixo do arquivo).
3. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no `.env.local`.
4. Cadastre o primeiro admin em `panel_access_list` (e-mail correspondente a um usuário em Auth).

Em **Auth → URL Configuration**, inclua `NEXT_PUBLIC_SITE_URL` e a rota `/reset-password` nas URLs de redirect.

2FA TOTP é **opcional**. Em **Authentication → Multi-Factor**, habilite TOTP. Cada usuário ativa o autenticador em **Segurança** (menu da conta). Admin e `client_admin` podem desativar o 2FA de um usuário na gestão de usuários (telefone perdido).

#### Variáveis de ambiente

Copie `.env.example` para `.env.local`. Grupos principais:

| Grupo | Variáveis | Uso |
|-------|-----------|-----|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` | Auth e persistência |
| **Site** | `NEXT_PUBLIC_SITE_URL` | Redirects e callbacks |
| **CorpX** | `CORPX_AUTH_URL`, `CORPX_CLIENT_ID`, `CORPX_CLIENT_SECRET`, `CORPX_TENANT_ID`, `CORPX_API_URL`, `CORPX_ACCOUNT_ID`, `CORPX_PIX_KEY` | PIX dinâmico e webhooks |
| **Ramp** | `RAMP_API_BASE_URL`, `RAMP_API_KEY`, `RAMP_CALLBACK_SECRET`, `RAMP_CALLBACK_URL` | Operações BRH/USDC on-chain |
| **Binance** | `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_API_KEY_SECONDARY`, `BINANCE_API_SECRET_SECONDARY`, `BINANCE_LOCAL_ADDRESS`, `BINANCE_LOCAL_ADDRESS_SECONDARY` | Cotação e operações de mercado (par de keys/IPs de egress) |
| **On-ramp** | `ONRAMP_QUOTE_*`, `ONRAMP_WITHDRAW_NETWORK`, `ONRAMP_USDC_DISTRIBUTOR_*` | Cotação, rede Stellar e refill |

Variáveis **sem** prefixo `NEXT_PUBLIC_` são apenas server-side — nunca expor no browser.

Checklist de rollout CorpX: [CORPX_V2_ROLLOUT_CHECKLIST.md](./CORPX_V2_ROLLOUT_CHECKLIST.md).

### Estrutura do repositório

```text
src/
  app/                    # Next.js App Router (páginas e API routes)
    api/
      onramp/             # API interna on-ramp (quote, lock, get, list)
      offramp/            # API interna off-ramp
      webhooks/           # CorpX e Ramp (callbacks inbound)
      binance/            # Endpoints internos Binance
    actions/              # Server actions (admin, whitelist, depósito)
  views/                  # Páginas React do painel autenticado
  layouts/                # AppShell (sidebar, topbar)
  components/             # UI reutilizável
  lib/
    onramp/               # Orquestração on-ramp
    offramp/              # Orquestração off-ramp
    corpx/                # Cliente CorpX (auth, PIX, webhooks)
    ramp/                 # Cliente Ramp API
    server/binance/       # Cliente Binance assinado
    withdraw-whitelist/   # Whitelist wallets USDC
    pix-whitelist/        # Whitelist chaves PIX
    users/                # Roles e autorização do painel
  integrations/supabase/  # Cliente browser Supabase
supabase/migrations/      # Schema Postgres versionado
```

### API interna (painel)

Rotas consumidas pelo frontend com **Bearer JWT** (sessão Supabase). Restritas a `admin` e `operator`:

```text
POST /api/onramp/orders/quote
POST /api/onramp/orders/:id/lock
GET  /api/onramp/orders/:id
GET  /api/onramp/orders

POST /api/offramp/orders/quote
POST /api/offramp/orders/:id/lock
GET  /api/offramp/orders/:id
GET  /api/offramp/orders
```

- **Quote** — cria ordem em estado `quoted` (whitelist validada no **lock**, não na quote).
- **Lock** — gera cobrança PIX (on-ramp) ou fixa destino PIX (off-ramp).
- **Reconcile** — rotas internas de reconciliação; não destinadas a integradores externos.

Contrato detalhado do on-ramp: [ONRAMP_BACKEND_CONTRACT.md](./ONRAMP_BACKEND_CONTRACT.md).

#### Webhooks inbound

| Rota | Origem |
|------|--------|
| `POST /api/webhooks/corpx` | Pagamento PIX (`qrcode.paid`) |
| `POST /api/webhooks/ramp` | Status Ramp (HMAC `X-Signature`) |

### Roadmap (não implementado)

- **API pública** `/api/v1` com autenticação por API key
- Camada **multi-tenant** (`clientes`) com spread, limites e gestão comercial
- Webhooks **outbound** para integradores
- UI de integração API no admin

### Documentação adicional

| Arquivo | Conteúdo |
|---------|----------|
| [ONRAMP_BACKEND_CONTRACT.md](./ONRAMP_BACKEND_CONTRACT.md) | Estados, rotas e persistência on-ramp |
| [CLIENTS_ARCHITECTURE.md](./CLIENTS_ARCHITECTURE.md) | Camada multi-tenant (clientes), fases e migração |
| [TREASURY_ARCHITECTURE.md](./TREASURY_ARCHITECTURE.md) | Tesouraria (capital próprio), overview e rebalanceamento |
| [CORPX_V2_ROLLOUT_CHECKLIST.md](./CORPX_V2_ROLLOUT_CHECKLIST.md) | Deploy e smoke tests CorpX |
| [BINANCE_MVP_PLAN.md](./BINANCE_MVP_PLAN.md) | Integração Binance |
| [ONRAMP_PAGE_PLAN.md](./ONRAMP_PAGE_PLAN.md) | UI on-ramp |
| [VERSIONS.md](./VERSIONS.md) | Histórico de versões (UI) |
| [.env.example](./.env.example) | Referência completa de variáveis |

### i18n

Textos do painel: `src/lib/i18n.tsx` (dicionários `pt` e `en`).

### Deploy

Build típico em **Vercel** (ou Node com `npm run build && npm run start`).

Após deploy:

1. Configurar todas as variáveis de ambiente no host.
2. Garantir migrations aplicadas no Supabase de produção.
3. Registrar webhooks CorpX e Ramp apontando para o domínio público (HTTPS).
4. Alinhar `ONRAMP_WITHDRAW_NETWORK` com a rede das wallets cadastradas na whitelist.

### Licença

Projeto privado (`"private": true` no `package.json`). Uso restrito à equipe Hi-Li / High Liquidity.

---

<a id="english"></a>

## English

Web panel for **BRL ⇄ USDC** operations on the Stellar ecosystem, with **on-ramp** (PIX → USDC) and **off-ramp** (USDC → PIX) flows, Supabase authentication, and integrations with CorpX, Ramp API, and Binance.

**Demo environment** — not a production-ready product or public multi-tenant API (on the roadmap).

### Features

| Area | Description |
|------|-------------|
| **On-ramp** | Quote → lock → PIX charge (CorpX) → USDC delivery via Ramp |
| **Off-ramp** | Quote → lock → USDC deposit → PIX settlement |
| **Orders** | List and track on/off-ramp orders |
| **Fiat deposit / withdraw** | Legacy MVP PIX flows (CorpX + BRH ledger) |
| **Dashboard** | KPIs, BRH balance, and operational overview |
| **Admin** | Panel user management, USDC wallet whitelist, PIX key whitelist, event logs, test limits |
| **i18n** | Portuguese and English |
| **Theme** | Persistent light / dark mode |

#### Access roles

The panel requires a **Supabase Auth** account and an active row in `public.panel_access_list`:

| Role | Access |
|------|--------|
| `admin` | Full access, including user and whitelist management |
| `operator` | On-ramp, off-ramp, orders, and own user whitelists |
| `viewer` | Read-only areas (cannot create ramp orders) |

### Stack

- **Next.js 15** (App Router) + **React 18** + **TypeScript**
- **Supabase** — Auth, Postgres, RLS
- **CSS** with custom properties (in-house design system)
- **Vitest** — unit tests
- Server-side integrations: **CorpX** (PIX), **Ramp API** (on-chain BRH/USDC), **Binance** (FX and refill)

### Getting started

```bash
npm install
cp .env.example .env.local   # fill in variables (see below)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

#### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Server after build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |

#### Supabase

1. Create a project on [Supabase](https://supabase.com) or use an existing one.
2. Apply migrations in `supabase/migrations/` (chronological order by filename prefix).
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
4. Register the first admin in `panel_access_list` (email must match an Auth user).

Under **Auth → URL Configuration**, add `NEXT_PUBLIC_SITE_URL` and the `/reset-password` route to redirect URLs.

TOTP 2FA is **optional**. Under **Authentication → Multi-Factor**, enable TOTP. Users enroll from **Security** in the account menu. Admins and `client_admin` can disable a user's 2FA in user management if they lose their authenticator.

#### Environment variables

Copy `.env.example` to `.env.local`. Main groups:

| Group | Variables | Purpose |
|-------|-----------|---------|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` | Auth and persistence |
| **Site** | `NEXT_PUBLIC_SITE_URL` | Redirects and callbacks |
| **CorpX** | `CORPX_AUTH_URL`, `CORPX_CLIENT_ID`, `CORPX_CLIENT_SECRET`, `CORPX_TENANT_ID`, `CORPX_API_URL`, `CORPX_ACCOUNT_ID`, `CORPX_PIX_KEY` | Dynamic PIX and webhooks |
| **Ramp** | `RAMP_API_BASE_URL`, `RAMP_API_KEY`, `RAMP_CALLBACK_SECRET`, `RAMP_CALLBACK_URL` | On-chain BRH/USDC operations |
| **Binance** | `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_API_KEY_SECONDARY`, `BINANCE_API_SECRET_SECONDARY`, `BINANCE_LOCAL_ADDRESS`, `BINANCE_LOCAL_ADDRESS_SECONDARY` | Quotes and market operations (egress key/IP pair) |
| **On-ramp** | `ONRAMP_QUOTE_*`, `ONRAMP_WITHDRAW_NETWORK`, `ONRAMP_USDC_DISTRIBUTOR_*` | Quotes, Stellar network, and refill |

Variables **without** the `NEXT_PUBLIC_` prefix are server-only — never expose them in the browser.

CorpX rollout checklist: [CORPX_V2_ROLLOUT_CHECKLIST.md](./CORPX_V2_ROLLOUT_CHECKLIST.md).

### Repository structure

```text
src/
  app/                    # Next.js App Router (pages and API routes)
    api/
      onramp/             # Internal on-ramp API (quote, lock, get, list)
      offramp/            # Internal off-ramp API
      webhooks/           # CorpX and Ramp (inbound callbacks)
      binance/            # Internal Binance endpoints
    actions/              # Server actions (admin, whitelist, deposit)
  views/                  # Authenticated panel React pages
  layouts/                # AppShell (sidebar, topbar)
  components/             # Reusable UI
  lib/
    onramp/               # On-ramp orchestration
    offramp/              # Off-ramp orchestration
    corpx/                # CorpX client (auth, PIX, webhooks)
    ramp/                 # Ramp API client
    server/binance/       # Signed Binance client
    withdraw-whitelist/   # USDC wallet whitelist
    pix-whitelist/        # PIX key whitelist
    users/                # Panel roles and authorization
  integrations/supabase/  # Browser Supabase client
supabase/migrations/      # Versioned Postgres schema
```

### Internal API (panel)

Routes consumed by the frontend with a **Bearer JWT** (Supabase session). Restricted to `admin` and `operator`:

```text
POST /api/onramp/orders/quote
POST /api/onramp/orders/:id/lock
GET  /api/onramp/orders/:id
GET  /api/onramp/orders

POST /api/offramp/orders/quote
POST /api/offramp/orders/:id/lock
GET  /api/offramp/orders/:id
GET  /api/offramp/orders
```

- **Quote** — creates an order in `quoted` state (whitelist validated at **lock**, not at quote).
- **Lock** — generates a PIX charge (on-ramp) or fixes the PIX payout destination (off-ramp).
- **Reconcile** — internal reconciliation routes; not for external integrators.

Detailed on-ramp contract: [ONRAMP_BACKEND_CONTRACT.md](./ONRAMP_BACKEND_CONTRACT.md).

#### Inbound webhooks

| Route | Source |
|-------|--------|
| `POST /api/webhooks/corpx` | PIX payment (`qrcode.paid`) |
| `POST /api/webhooks/ramp` | Ramp status (HMAC `X-Signature`) |

### Roadmap (not implemented)

- **Public API** `/api/v1` with API key authentication
- **Multi-tenant** layer (`clients`) with spread, limits, and commercial management
- **Outbound** webhooks for integrators
- API integration UI in admin

### Additional documentation

| File | Content |
|------|---------|
| [ONRAMP_BACKEND_CONTRACT.md](./ONRAMP_BACKEND_CONTRACT.md) | On-ramp states, routes, and persistence |
| [CORPX_V2_ROLLOUT_CHECKLIST.md](./CORPX_V2_ROLLOUT_CHECKLIST.md) | CorpX deploy and smoke tests |
| [TREASURY_ARCHITECTURE.md](./TREASURY_ARCHITECTURE.md) | Treasury (proprietary capital), overview and rebalancing |
| [BINANCE_MVP_PLAN.md](./BINANCE_MVP_PLAN.md) | Binance integration |
| [ONRAMP_PAGE_PLAN.md](./ONRAMP_PAGE_PLAN.md) | On-ramp UI |
| [VERSIONS.md](./VERSIONS.md) | Version history (UI) |
| [.env.example](./.env.example) | Full environment variable reference |

### i18n

Panel copy lives in `src/lib/i18n.tsx` (`pt` and `en` dictionaries).

### Deploy

Typical build on **Vercel** (or Node with `npm run build && npm run start`).

After deploy:

1. Configure all environment variables on the host.
2. Ensure migrations are applied on production Supabase.
3. Register CorpX and Ramp webhooks pointing to the public domain (HTTPS).
4. Align `ONRAMP_WITHDRAW_NETWORK` with the network of wallets in the whitelist.

### License

Private project (`"private": true` in `package.json`). Restricted to the Hi-Li / High Liquidity team.
