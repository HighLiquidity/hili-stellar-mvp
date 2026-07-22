








# Clients Architecture (Multi-Tenant B2B)

## Objetivo

Definir a arquitetura da camada **clientes** (`clients`) como entidade raiz do painel B2B,
subordinando:

- cadastro de **usuários** do painel;
- **políticas comerciais** (spread, limites);
- isolamento de **dados operacionais** (ordens, whitelist, API keys, observabilidade);
- futuro processo de **KYB/KYC** e gates de compliance.

Este documento é o contrato de implementação **antes** do código (Fase A).
Após validação do time, a execução segue as fases 3.0–3.5 descritas abaixo.

## Contexto atual (baseline)

Hoje o MVP trata cada **operador** como integrador implícito:

| Recurso | Escopo atual |
|---------|----------------|
| `panel_access_list` | Usuários globais; papéis `admin`, `operator`, `viewer` |
| Termos comerciais | `spread_bps_override`, `max_amount_brl` no **operador** (Package 2.5) |
| `api_keys` | `linked_user_id` → operador Supabase Auth |
| Ordens on/off-ramp | `created_by_user_id` + `integrator_external_id` único por operador |
| Whitelist wallets/PIX | `user_id` por operador |
| Admin Hi-Li | `role = admin` vê tudo (único tenant implícito) |

**Problema:** não há isolamento entre integradores B2B distintos nem lugar único para política
comercial e compliance do **cliente jurídico** (CNPJ).

## Princípios de desenho

1. **Cliente** = pessoa jurídica integradora B2B (CNPJ), não usuário individual.
2. Todo usuário de painel (exceto admin de plataforma) pertence a **exatamente um** cliente.
3. Política comercial vive no **cliente**; usuários e API keys **herdam** do cliente.
4. Isolamento de dados é por `client_id` em todas as entidades operacionais.
5. Admin de plataforma (Hi-Li) é **cross-tenant**; demais papéis são **single-tenant**.
6. KYB/KYC é modelo separado, acoplado ao cliente, introduzido sem bloquear Fases 3.0–3.2.
7. Migração **incremental**: cliente Legacy absorve dados existentes; zero downtime alvo.
8. Writes sensíveis continuam via **service-role** (server actions / API v1), como hoje.

## Hierarquia de domínio

```text
Platform (Hi-Li)
└── Client (B2B integrator, CNPJ)
    ├── Commercial profile (spread, max BRL)
    ├── Compliance profile (KYB/KYC — futuro)
    ├── Panel users (operator, viewer, client_admin)
    ├── API keys
    ├── Whitelist (wallets USDC, chaves PIX)
    └── Orders (on-ramp, off-ramp)
```

```mermaid
flowchart TB
  subgraph platform [Plataforma Hi-Li]
    PA[platform_admin]
  end

  subgraph client [Cliente B2B]
    C[clients]
    CP[commercial terms]
    KYB[compliance - futuro]
    U[panel users]
    AK[api_keys]
    WL[whitelist]
    OR[orders]
  end

  PA -->|CRUD todos| C
  C --> CP
  C --> KYB
  C --> U
  C --> AK
  U --> WL
  U --> OR
  AK --> OR
  KYB -.->|gate opcional| OR
```

## Modelo de dados

### Tabela `clients`

Entidade raiz do tenant B2B.

```sql
create table public.clients (
  id uuid primary key default gen_random_uuid(),

  -- Identificação
  legal_name text not null,
  trade_name text,
  tax_id text not null,                    -- CNPJ normalizado (somente dígitos)
  contact_email text,

  -- Ciclo de vida operacional
  status text not null default 'draft'
    check (status in ('draft', 'active', 'suspended', 'archived')),

  -- Política comercial (herdada por usuários e API keys do cliente)
  spread_bps_override int
    check (spread_bps_override is null or (spread_bps_override >= 0 and spread_bps_override <= 10000)),
  max_amount_brl text,

  metadata jsonb,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_tax_id_unique unique (tax_id)
);

create index clients_status_idx on public.clients (status, created_at desc);
```

| Campo | Regra |
|-------|--------|
| `status = draft` | Pode ter usuários; **não** opera ramp (configurável) |
| `status = active` | Operação normal (sujeito a KYB quando existir) |
| `status = suspended` | Bloqueio administrativo imediato |
| `status = archived` | Somente leitura histórica |
| `tax_id` | Único; normalizado para dígitos no servidor |
| `spread_bps_override` | `null` → usa `ONRAMP_QUOTE_SPREAD_BPS` / env |
| `max_amount_brl` | `null` → sem limite por operação além de env global |

### Alteração `panel_access_list`

```sql
alter table public.panel_access_list
  add column client_id uuid references public.clients (id) on delete restrict;

-- Após backfill: operadores/viewers exigem client_id; admin plataforma fica null.
-- spread_bps_override e max_amount_brl serão REMOVIDOS após migração para clients (Fase 3.1).
```

| Papel | `client_id` | Escopo |
|-------|-------------|--------|
| `admin` (plataforma) | `null` | Todos os clientes |
| `client_admin` (novo, Fase 3.3) | obrigatório | Próprio cliente |
| `operator` | obrigatório | Ramp + API + whitelist do cliente |
| `viewer` | obrigatório | Leitura no cliente |

**Decisão MVP:** manter valor `admin` existente como admin de plataforma; introduzir
`client_admin` na Fase 3.3. Não renomear `admin` → `platform_admin` no banco na v1
(evita migração de código ampla); documentar alias semântico.

### Tabela `client_compliance_profiles` (Fase 3.4 — schema reservado)

Não implementar na Fase 3.0; schema alvo para planejamento KYB/KYC:

```sql
create table public.client_compliance_profiles (
  client_id uuid primary key references public.clients (id) on delete cascade,

  kyb_status text not null default 'not_started'
    check (kyb_status in ('not_started', 'pending', 'approved', 'rejected')),
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'pending', 'approved', 'rejected', 'not_applicable')),

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_email text,
  rejection_reason text,
  notes text,
  metadata jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Gate de negócio (futuro):** `quote`/`lock` exigem `clients.status = active` e,
se `CLIENT_KYB_REQUIRED=true`, `kyb_status = approved`.

### Colunas `client_id` em entidades operacionais

Adicionar em fases; todas nullable durante migração, depois `NOT NULL` onde aplicável.

| Tabela | Fase | Notas |
|--------|------|-------|
| `panel_access_list` | 3.0 | FK para cliente |
| `api_keys` | 3.2 | Denormalizado; deve bater com cliente do `linked_user_id` |
| `onramp_orders` | 3.2 | Backfill via `created_by_user_id` |
| `offramp_orders` | 3.2 | Idem |
| `user_withdraw_whitelist` | 3.2 | Backfill via `user_id` |
| `user_pix_whitelist` | 3.2 | Idem |
| `api_key_request_logs` | 3.2 | Via `api_key_id` ou denormalizado |

**Índice `integrator_external_id` (evolução):**

Hoje: único por `(created_by_user_id, integrator_external_id)`.

Alvo: único por `(client_id, integrator_external_id)` — alinha referência do integrador
ao tenant, não ao usuário que clicou no painel.

```sql
-- Substituição planejada (Fase 3.2)
create unique index onramp_orders_client_external_id_key
  on public.onramp_orders (client_id, integrator_external_id)
  where client_id is not null and integrator_external_id is not null;
```

## Resolução de termos comerciais (evolução do Package 2.5)

Função alvo `resolveCommercialTerms()`:

```text
1. spread_bps_override do clients (se operator/client scoped)
2. legado: spread no operador (só durante migração)
3. legado: spread na api_keys (só durante migração)
4. ONRAMP_QUOTE_SPREAD_BPS / OFFRAMP_QUOTE_SPREAD_BPS (env)
```

```text
max_amount_brl:
1. clients.max_amount_brl
2. legado operador / api_key
3. sem limite (ou admin_test_settings global para sandbox)
```

Admin de plataforma sem `client_id` continua usando **apenas env** (comportamento atual).

Arquivos a evoluir:

- `src/lib/commercial/resolve.ts`
- `src/lib/commercial/operator-profile.ts` → `client-profile.ts`
- `src/lib/commercial/api-key.ts`, `panel.ts`

## Autenticação e contexto de request

### Painel (Bearer Supabase)

Estender `PanelAccessContext`:

```typescript
type PanelAccessContext = {
  admin: SupabaseAdminClient;
  userId: string;
  email: string;
  role: PanelUserRole;
  clientId: string | null;       // null = platform admin
  clientStatus?: ClientStatus;   // quando clientId presente
};
```

`requirePanelRoleFromAccessToken` passa a carregar `client_id` (join `panel_access_list`).

**Regras:**

- Operador/viewer sem `client_id` → erro de configuração (pós-migração).
- `client.status !== active` → bloquear quote/lock (exceto platform admin).
- Platform admin pode opcionalmente **impersonar filtro** por `?clientId=` em listagens.

### API v1 (Bearer API secret)

Estender `ApiKeyAuthContext`:

```typescript
type ApiKeyAuthContext = {
  apiKeyId: string;
  clientId: string;
  userId: string;
  email: string | null;
  scopes: ApiKeyScope[];
  // spreadBpsOverride / maxAmountBrl removidos após Fase 3.1
};
```

Toda rota `/api/v1/*` deve:

1. Autenticar key;
2. Resolver `client_id` da key;
3. Filtrar leituras/escritas por `client_id`;
4. Resolver termos comerciais do **cliente**.

## Isolamento e autorização

### Server-side (service-role) — padrão atual

Mantém-se: RLS restritiva + lógica no servidor. Novas queries **sempre** incluem
`client_id` quando o ator não é platform admin.

### RLS (evolução gradual)

Fase 3.0: RLS em `clients` — somente `is_panel_admin()` lê/escreve.

Fase 3.2+: políticas por tabela operacional (exemplo ordens):

```sql
-- Platform admin
using (public.is_panel_admin())

-- Usuário do mesmo cliente (leitura)
using (
  client_id = (
    select p.client_id from public.panel_access_list p
    where lower(p.email) = lower(auth.jwt() ->> 'email')
      and p.is_active = true
  )
)
```

Funções auxiliares sugeridas:

```sql
create function public.current_panel_client_id() returns uuid ...
create function public.is_platform_admin() returns boolean ...
-- is_panel_admin() permanece como alias do admin de plataforma
```

## UI do painel (mapa de telas)

| Rota | Papel | Fase |
|------|-------|------|
| `/app/clients` | platform admin | 3.0 |
| `/app/clients/:id` | platform admin | 3.0 — detalhe + comercial |
| `/app/users` | platform admin | 3.0 — adicionar filtro/seleção de cliente |
| `/app/users` | client_admin | 3.3 — só usuários do próprio cliente |
| Demais telas operador | operator | 3.2 — dados filtrados por cliente |

**Sidebar:** item **Clientes** na seção de gestão (platform admin), abaixo do divisor
junto com Usuários, Whitelist, etc.

## Contratos de server actions (painel)

### `clients.ts` (novo)

```typescript
listClientsAction(accessToken): ClientRow[]
getClientAction(accessToken, clientId): ClientRow
createClientAction(accessToken, input: ClientInput): ClientRow
updateClientAction(accessToken, clientId, input: ClientUpdateInput): ClientRow
// archiveClientAction — soft via status = archived
```

`ClientInput` mínimo:

```typescript
type ClientInput = {
  legalName: string;
  tradeName?: string;
  taxId: string;
  contactEmail?: string;
  status?: 'draft' | 'active';
  spreadBpsOverride?: string;
  maxAmountBrl?: string;
};
```

Autorização: `requireAdminFromAccessToken` (platform admin only) nas Fases 3.0–3.1.

### Evolução `user-management.ts`

```typescript
createPanelUserAction(accessToken, {
  ...
  clientId: string;  // obrigatório para operator/viewer/client_admin
})
```

Platform admin seleciona cliente no formulário. Client admin (Fase 3.3): `clientId` fixo
do contexto, não editável.

## Contratos API v1 (sem breaking change de paths)

Paths permanecem `/api/v1/...`. Mudança **interna**: escopo por `client_id`.

| Endpoint | Mudança |
|----------|---------|
| `POST .../quote` | Termos do cliente; valida `client.status` |
| `POST .../lock` | Whitelist e ordem no escopo do cliente |
| `GET .../orders` | Lista somente ordens do `client_id` da key |
| `GET .../orders/:id` | 404 se ordem de outro cliente |
| `externalId` | Unicidade por `(client_id, externalId)` |

Respostas públicas **não** expõem `clientId` na v1 inicial (opcional campo futuro).

## Migração de dados

### Cliente bootstrap `Legacy`

```sql
insert into public.clients (
  id, legal_name, trade_name, tax_id, status, contact_email, created_by_email
) values (
  '00000000-0000-4000-8000-000000000001',  -- UUID fixo documentado
  'Legacy Integrators',
  'Legacy',
  '00000000000000',
  'active',
  null,
  'migration@hili.internal'
);
```

### Backfill (ordem)

1. Criar `clients` + Legacy.
2. `UPDATE panel_access_list SET client_id = <legacy> WHERE role IN ('operator','viewer')`.
3. Fase 3.1: copiar `spread_bps_override`, `max_amount_brl` do operador para o cliente
   (um cliente por operador **ou** consolidar operadores no Legacy — ver decisão abaixo).
4. Fase 3.2: `UPDATE api_keys SET client_id = ... FROM panel_access_list ...`.
5. Fase 3.2: ordens e whitelist via join em `created_by_user_id` / `user_id`.
6. Validar contagens; `ALTER COLUMN client_id SET NOT NULL` onde aplicável.
7. Fase 3.1+: dropar colunas comerciais de `panel_access_list` e `api_keys`.

### Script de verificação (smoke pós-migração)

- Operador Legacy continua quote/lock.
- Segundo cliente de teste não vê ordens do primeiro.
- API key do cliente A não lê ordem do cliente B (404).

## Fases de implementação

### Fase 3.0 — Fundação

| Entrega | Detalhe |
|---------|---------|
| Migration `clients` + `panel_access_list.client_id` | |
| Cliente Legacy + backfill operadores | |
| CRUD admin `/app/clients` | |
| Listagem usuários com coluna cliente | |
| **Sem** mudança em ramp/API ainda | Comportamento idêntico |

**Critério de aceite:** platform admin gerencia clientes; operadores existentes intactos.

### Fase 3.1 — Política comercial no cliente ✅

| Entrega | Detalhe |
|---------|---------|
| Termos em `clients` | UI no detalhe do cliente |
| `resolveCommercialTerms` por `clientId` | Painel + API v1 |
| Remover UI comercial de usuário | Mover para cliente |
| Deprecar colunas no operador | Manter leitura legado temporária |
| Migration `20260614120000_migrate_commercial_to_clients.sql` | Copia termos do operador → cliente |
| Gate `client.status === active` | Bloqueia quote para operador/API |

**Critério de aceite:** dois clientes com spreads distintos → quotes distintas.

### Fase 3.2 — Isolamento de dados ✅

| Entrega | Detalhe |
|---------|---------|
| `client_id` em keys, ordens, whitelist, logs | Migration `20260615120000_client_data_isolation.sql` |
| Filtros em todas as listagens | Painel + API v1 |
| Índice `externalId` por cliente | Substitui índice por `created_by_user_id` |
| Testes de não-vazamento | `src/lib/clients/scope.test.ts` |
| Helper `src/lib/clients/scope.ts` | `resolvePanelDataScope`, asserts de ownership |

**Critério de aceite:** smoke multi-cliente passa.

### Fase 3.3 — Gestão delegada ✅

| Entrega | Detalhe |
|---------|---------|
| Papel `client_admin` | Migration `20260616120000_client_admin_role.sql` |
| CRUD usuários no próprio cliente | `client_admin` → operator/viewer; platform admin → todos os papéis |
| Limite transacional por operador | `panel_access_list.max_amount_brl` ≤ `clients.max_amount_brl` (spread só no cliente) |
| API keys | Somente platform admin + `client_admin`; operador sem self-service |
| Whitelist | Platform admin + `client_admin` aprovam pendências no próprio `client_id` |

**Critério de aceite:** `client_admin` gerencia operadores/viewer, keys e whitelist do tenant; pode operar ramp no painel com termos do cliente (teto completo, sem sub-limite de operador). Não acessa `/app/clients`.

### Fase 3.4 — KYB/KYC ✅

| Entrega | Detalhe |
|---------|---------|
| `client_compliance_profiles` | Migration `20260617120000_client_compliance_profiles.sql` + backfill Legacy `approved` |
| UI status compliance | Coluna KYB em `/app/clients`; seção admin no formulário; banner no dashboard do `client_admin` |
| Gate opcional em quote | Env `CLIENT_KYB_REQUIRED` (`src/lib/commercial/client-gate.ts`) |
| Upload documentos | Fase 3.5 |

### Fase 3.5 — KYB: formulário + documentos (próxima)

**Referência oficial:** `docs/compliance/reference/kyb-pessoa-juridica-greenlab.pdf`
(Formulário de Cadastro de Pessoa Jurídica — KYB Greenlab, 5 seções + checklist + declaração).

Objetivo: digitalizar o processo KYB do integrador B2B (`clients`) no painel — dados
cadastrais, estrutura societária (UBOs), perguntas de compliance e upload da documentação
— integrado a `client_compliance_profiles` (Fase 3.4).

Escopo por sub-fase interna (implementação incremental):

| Sub-fase | Entrega |
|----------|---------|
| **3.5a** | Questionário KYB (seções 1–5, 7) + cadastro de UBOs |
| **3.5b** | Upload de documentos KYB (seção 6) + completude + envio para revisão |
| **3.5c** | Revisão platform admin (dados + docs) em `/app/clients` |

#### Seções do formulário KYB (dados — não são arquivos)

**1. Dados da empresa** → mapear em `clients` + extensão `client_kyb_applications.company`:

| Campo formulário | Campo alvo MVP |
|------------------|----------------|
| Razão Social | `clients.legal_name` (já existe) |
| Nome Fantasia | `clients.trade_name` |
| CNPJ | `clients.tax_id` |
| Data de Constituição | `incorporation_date` |
| País de Constituição | `incorporation_country` |
| LEI (opcional) | `lei_code` |
| Website / redes | `website` |
| Setor / atividade principal | `primary_activity` |
| Endereço da sede | `registered_address` (json: rua, complemento, bairro, cidade, UF, CEP, país) |
| Residência fiscal adicional | `tax_residency_extra` (boolean + países) |
| FATCA / residente EUA | `is_us_tax_person` |

**2. Representante legal** → `client_compliance_persons` (`role = legal_representative`) + KYC na Fase 3.6:

Nome, CPF, nascimento, nacionalidade, cargo, e-mail, telefone, endereço residencial,
faixa de patrimônio estimado.

**3. Estrutura societária (UBOs ≥25%)** → tabela `client_compliance_ubos` (1..N linhas):

Nome, CPF, cargo, % participação, residência fiscal, US Person, PEP (herda seção 5),
participação em outras empresas. Formulário prevê Sócio 1, Sócio 2 + folha suplementar.

**4. Informações financeiras e operacionais** → `client_kyb_applications.operations`:

Volume médio mensal esperado, ticket máximo, faturamento médio 12m, origem dos fundos
(texto), finalidade de uso (multi-select: on/off-ramp, fornecedores, remessas, tesouraria,
outros), descrição do fluxo de dinheiro.

**5. Compliance e PEP (empresa)** → `client_kyb_applications.compliance`:

PEP em sócio/diretor/representante (sim/não + cargo), investigações financeiras,
países sancionados OFAC/ONU, política PLD implementada (sim + anexo opcional),
reporte IN 1.888/2019, endereços de wallets da empresa (lista texto).

**7. Declaração de licitude** → `declaration_accepted_at`, `declaration_signer_email`,
texto fixo versionado (`declaration_version`).

#### Checklist KYB — documentos (seção 6 do formulário)

| `document_type` | Documento (formulário Greenlab) | Escopo | Obrigatório MVP |
|-----------------|----------------------------------|--------|-----------------|
| `articles_of_association` | Contrato Social Consolidado ou Estatuto Social | Por cliente | Sim |
| `company_address_proof` | Comprovante de endereço da empresa | Por cliente | Sim |
| `partner_or_admin_id` | RG/CNH/Passaporte de sócios (>25%) e administradores | Por pessoa (`person_id`) | Sim |
| `partner_or_admin_address` | Comprovante de residência (< 3 meses) | Por pessoa (`person_id`) | Sim |
| `balance_sheet` | Balanço Patrimonial último exercício (contador + rep. legal) | Por cliente | Sim |
| `income_statement_dre` | DRE | Por cliente | Sim |
| `revenue_declaration_12m` | Declaração de faturamento 12 meses (contador) | Por cliente | Sim |
| `irpj_or_corporate_income` | Informe de Rendimentos ou IRPJ completo (com recibo) | Por cliente | Sim |
| `recent_service_invoice` | NF recente de prestação de serviço/venda | Por cliente | Sim |
| `partner_irpf` | Declaração IRPF completa dos sócios (>25%) (com recibo) | Por pessoa (`person_id`) | Sim |
| `aml_policy_manual` | Manual/Política de PLD e KYC da empresa | Por cliente | Condicional (se marcou “Sim” na §5) |

**Completude para envio à revisão:**

- Questionário seções 1, 4, 5 e 7 preenchidos; representante legal cadastrado.
- Pelo menos um UBO com ≥25% **ou** declaração de controle efetivo sem sócio ≥25% (edge case — validar com jurídico).
- Todos os documentos obrigatórios da tabela acima para o cliente e para **cada** pessoa listada como sócio >25% ou administrador.
- `aml_policy_manual` obrigatório somente se `has_aml_policy = true`.

#### Schema alvo (resumo)

```sql
-- Dados do formulário KYB (1:1 com client)
create table public.client_kyb_applications (
  client_id uuid primary key references public.clients (id) on delete cascade,
  company jsonb not null default '{}',
  operations jsonb not null default '{}',
  compliance jsonb not null default '{}',
  declaration_version text,
  declaration_accepted_at timestamptz,
  declaration_signer_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pessoas ligadas ao KYB do cliente (representante + UBOs/admins)
create table public.client_compliance_persons (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  role text not null check (role in ('legal_representative', 'ubo', 'administrator')),
  full_name text not null,
  cpf text,
  participation_pct numeric(5,2),
  profile jsonb not null default '{}',  -- demais campos PF do KYB §2/§3
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started', 'pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Documentos (KYB empresa + KYB por pessoa; KYC na 3.6)
create table public.client_compliance_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  person_id uuid references public.client_compliance_persons (id) on delete cascade,
  compliance_kind text not null check (compliance_kind in ('kyb', 'kyc')),
  document_type text not null,
  storage_bucket text not null default 'client-compliance-docs',
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  uploaded_by_email text not null,
  uploaded_at timestamptz not null default now(),
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by_email text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Storage:** bucket privado `client-compliance-docs`, paths:

- Empresa: `{client_id}/kyb/company/{document_type}/{uuid}_{file}`
- Pessoa: `{client_id}/kyb/persons/{person_id}/{document_type}/{uuid}_{file}`

#### Papéis e telas

| Ação | `client_admin` | Platform admin |
|------|----------------|----------------|
| Preencher questionário KYB | Sim | Sim (qualquer cliente) |
| Cadastrar UBOs / representante | Sim | Sim |
| Upload documentos KYB | Sim | Sim |
| Enviar para revisão KYB | Sim (completude OK) | N/A |
| Revisar dados + docs + aprovar KYB | Não | Sim (`/app/clients`) |

**UI MVP:**

- Rota `/app/compliance` (ou wizard no dashboard): passos **Dados → UBOs → Financeiro → Compliance → Documentos → Declaração → Enviar**.
- Platform admin: mesma visão em modo leitura/edição no cliente + download de arquivos.

#### Integração com fluxo 3.4

1. `client_admin` completa questionário + documentos.
2. `submitClientComplianceForReviewAction` (existente) → `kyb_status = pending`.
3. Platform admin revisa → `updateClientComplianceAction` → `approved` / `rejected`.
4. Gate `CLIENT_KYB_REQUIRED` (já implementado).

**Critério de aceite 3.5:** integrador novo preenche o equivalente digital do formulário KYB
Greenlab, anexa todos os documentos obrigatórios, envia para revisão; platform admin
visualiza dados estruturados + arquivos e aprova. Cliente Legacy permanece `approved` sem
retroativo.

---

### Fase 3.6 — KYC: formulário + documentos por pessoa física

**Referência oficial:** `docs/compliance/reference/kyc-pessoa-fisica-greenlab.pdf`
(Formulário de Cadastro de Pessoa Física — KYC Greenlab, 4 seções + checklist + declaração).

Aplica-se a cada **pessoa física** vinculada ao cliente:

- Representante legal (KYB §2) — **obrigatório**.
- Cada UBO ≥25% e administradores listados no KYB — **obrigatório**.
- (Futuro) operadores do painel não exigem KYC individual no MVP B2B.

Reutiliza `client_compliance_persons` + `client_kyc_applications` (1:1 com `person_id`).

#### Seções do formulário KYC (dados)

| Seção | Conteúdo | Armazenamento |
|-------|----------|---------------|
| 1. Identificação pessoal | Nome, CPF, nascimento, nome da mãe, nacionalidade, estado civil, profissão, tipo/nº documento | `client_kyc_applications.identity` |
| 2. Endereço e contato | Endereço completo, celular, e-mail, residência fiscal, FATCA | `client_kyc_applications.contact` |
| 3. Perfil financeiro | Faixas de renda e patrimônio, origem dos recursos | `client_kyc_applications.financial` |
| 4. Perfil de uso e cripto | Finalidade, volume diário estimado, wallets, declaração IN 1.888 | `client_kyc_applications.crypto` |
| 5. PEP | Auto-PEP e familiares/colaboradores PEP | `client_kyc_applications.pep` |
| 7. Declarações finais | Aceite versionado + assinatura | `declaration_*` |

#### Checklist KYC — documentos (seção 6)

| `document_type` | Documento | Obrigatório |
|-----------------|-----------|-------------|
| `id_front_back` | Documento de identificação (frente e verso) | Sim |
| `selfie_with_id` | Selfie segurando o documento | Sim |
| `proof_of_residence` | Comprovante de residência (< 3 meses) | Sim |
| `proof_of_income` | Holerite, extrato bancário 3 meses ou IRPF completa | Sim |

**Storage KYC:** `{client_id}/kyc/persons/{person_id}/{document_type}/{uuid}_{file}`

#### Regra de completude KYB + KYC

KYB do cliente só pode ir para `pending` quando:

- Questionário e documentos **empresa** completos (3.5).
- **Representante legal** com questionário KYC + 4 documentos completos.
- **Cada** UBO/administrador elegível com par KYB (`partner_or_admin_*`) **e** pacote KYC completo.

`client_compliance_persons.kyc_status` independente; agregado em `client_compliance_profiles.kyc_status`
(ex.: `approved` quando todas as pessoas obrigatórias aprovadas).

#### Entregas técnicas (Fase 3.6)

| Entrega | Detalhe |
|---------|---------|
| Migration | `client_kyc_applications` + extensão `client_compliance_documents` para `compliance_kind = kyc` |
| UI | Wizard KYC por pessoa (link a partir do cadastro de UBO/representante) |
| Revisão | Platform admin aprova KYC por pessoa + status agregado |
| Gate futuro | `CLIENT_KYC_REQUIRED` (opcional; fora do MVP inicial) |

**Critério de aceite 3.6:** para um cliente em onboarding, representante e UBOs concluem
o formulário KYC Greenlab e anexam os 4 documentos; platform admin aprova cada pessoa.

## Decisões abertas (validação do time)

Preencher antes de iniciar Fase 3.0:

| # | Pergunta | Recomendação MVP |
|---|----------|------------------|
| D1 | Um operador pode pertencer a vários clientes? | **Não** |
| D2 | No Legacy, um cliente ou um cliente por operador existente? | **Um Legacy** para todos; novos clientes separados |
| D3 | `client_admin` na 3.0 ou só na 3.3? | **Só 3.3** |
| D4 | Quem aprova whitelist pós multi-tenant? | Platform admin + client_admin |
| D5 | CNPJ `00000000000000` aceito para Legacy/sandbox? | **Sim**, documentado |
| D6 | Bloquear `draft` em quote? | **Sim** para operadores; admin pode testar |
| D7 | Expor `clientId` na API v1 pública? | **Não** na primeira versão |
| D8 | Cadastro de UBOs no MVP | Tabela `client_compliance_persons` com linhas repetíveis (não PDF suplementar) |
| D9 | Selfie KYC no painel | Upload de imagem no MVP; **sem** liveness/biometria automatizada |
| D10 | KYB sem sócio ≥25% | Validar com jurídico (controle efetivo sem UBO declarado) |
| D11 | Formulários de referência | PDFs Greenlab em `docs/compliance/reference/` |

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Queries sem filtro `client_id` | Checklist PR + teste integração 2 clientes |
| Backfill incompleto | Scripts SQL idempotentes + relatório de órfãos |
| Breaking API para integradores | Escopo interno; paths inalterados |
| Complexidade RLS | Fase 3.2 incremental; service-role como source of truth |
| KYB prematuro | Schema reservado; gate desligado por default |
| Documentos sensíveis (PII) | Bucket privado, URLs assinadas, RLS + escopo tenant, sem CDN público |
| Múltiplos sócios >25% | `partner_label` + índice por sócio; evitar cadastro societário completo no MVP |

## Relação com roadmap existente

| Item roadmap | Ordem sugerida |
|--------------|----------------|
| Smoke E2E piloto (single tenant) | Antes ou em paralelo com 3.0 |
| Fase 3.0 + 3.1 + 3.2 + 3.3 + 3.4 | **Concluídas** |
| Fase 3.5 — KYB (formulário + docs Greenlab) | **Próxima** — sub-fases 3.5a→3.5c |
| Fase 3.6 — KYC por pessoa (formulário + docs Greenlab) | Após 3.5 |
| Webhooks outbound | Paralelo a 3.2 |
| Fase 3.2 | Quando houver 2º cliente real |

## Referências no repositório

| Arquivo | Conteúdo relacionado |
|---------|---------------------|
| `src/lib/commercial/` | Resolver de termos por cliente (`client-profile`, `client-gate`) |
| `src/lib/clients/scope.ts` | Escopo de dados por tenant (painel + API) |
| `supabase/migrations/20260615120000_client_data_isolation.sql` | `client_id` + backfill + índices |
| `src/lib/users/require-panel-role.ts` | Contexto de auth do painel |
| `src/lib/api-keys/store.ts` | Auth API v1 |
| `supabase/migrations/20260612120000_operator_commercial_profile.sql` | Baseline comercial atual |
| `supabase/migrations/20260617120000_client_compliance_profiles.sql` | Perfis KYB/KYC (Fase 3.4) |
| `src/app/actions/client-compliance.ts` | Status e revisão de compliance |
| `supabase/migrations/20260610120000_integrator_external_id.sql` | External ID por operador |
| `README.md` | Roadmap multi-tenant |
| `docs/compliance/reference/kyb-pessoa-juridica-greenlab.pdf` | Formulário KYB de referência |
| `docs/compliance/reference/kyc-pessoa-fisica-greenlab.pdf` | Formulário KYC de referência |
| *(planejado 3.5)* `client_kyb_applications`, `client_compliance_persons`, `client_compliance_documents` | Onboarding compliance |

## Checklist de validação deste plano

- [ ] D1–D11 acordadas pelo time
- [ ] Fase 3.0 aceita como primeiro incremento de código
- [ ] Cliente Legacy e UUID fixo aprovados
- [ ] Política comercial no cliente (não no usuário) aprovada
- [ ] Formulários Greenlab (KYB/KYC PDF) aceitos como fonte da verdade
- [ ] Checklist KYB expandido (11 tipos de documento) aprovado
- [ ] Checklist KYC (4 documentos + questionário) aprovado
- [ ] Ordem: 3.5a → 3.5b → 3.5c → 3.6 confirmada

---

**Status:** Fases 3.0–3.4 concluídas. **Próximo:** Fase 3.5 (KYB digital — baseado nos formulários Greenlab em `docs/compliance/reference/`). Fase 3.6: KYC por representante/UBO.
