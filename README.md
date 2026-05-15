# Fiat Ops MVP

Frontend para um MVP de operações fiat com **autenticação Supabase**, **layout autenticado com sidebar retrátil**, **i18n PT/EN** e **tema claro/escuro persistente**.

## Stack escolhida

- **Vite + React + TypeScript**
- **React Router** para navegação
- **Supabase Auth** para autenticação e controle de acesso
- **CSS custom properties** para tema e design system

Escolhi essa stack porque o projeto é um **frontend puro nesta fase**, sem necessidade de SSR. Ela entrega iteração rápida, base leve e estrutura simples para plugar backend real depois.

## Como rodar

```bash
npm install
npm run dev
```

## Estrutura principal

```text
src/
  components/     # UI reutilizável e toggles
  hooks/          # sessão e autorização com Supabase
  layouts/        # shell autenticado com sidebar
  lib/            # i18n, tema e serviços de auth
  pages/          # login e áreas autenticadas
  integrations/   # cliente Supabase
```

## Autenticação e controle de acesso

O acesso ao painel agora depende de:

- usuário autenticado no **Supabase Auth**
- registro ativo na tabela **`public.panel_access_list`**

Tabelas criadas:

- `public.panel_access_list` → allowlist por e-mail com `full_name`, `role` e `is_active`
- `public.profiles` → perfil associado ao `auth.users`, sincronizado por trigger

## Onde alterar textos / idiomas

- Arquivo: `src/lib/i18n.tsx`
- Dicionários disponíveis: `pt` e `en`

## Onde plugar regras e integrações futuras

- Serviço de autenticação/acesso: `src/lib/authService.ts`
- Estado/auth hook: `src/hooks/useAuth.tsx`
- Cliente Supabase: `src/integrations/supabase/client.ts`
- Fluxos operacionais:
  - `src/pages/DepositPage.tsx`
  - `src/pages/WithdrawPage.tsx`
  - `src/pages/StatementPage.tsx`

Para liberar acesso a um usuário, basta existir uma conta no Supabase Auth e um e-mail correspondente ativo em `public.panel_access_list`.
