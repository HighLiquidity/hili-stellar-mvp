# Fiat Ops MVP

Scaffold frontend para um MVP de operações fiat com **login mock**, **layout autenticado com sidebar retrátil**, **i18n PT/EN** e **tema claro/escuro persistente**.

## Stack escolhida

- **Vite + React + TypeScript**
- **React Router** para navegação
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
  hooks/          # estado de autenticação mock
  layouts/        # shell autenticado com sidebar
  lib/            # i18n, tema e auth service
  pages/          # login e áreas autenticadas
```

## Onde alterar textos / idiomas

- Arquivo: `src/lib/i18n.tsx`
- Dicionários disponíveis: `pt` e `en`

## Onde plugar autenticação e API depois

- Serviço de autenticação mock: `src/lib/authService.ts`
- Estado/auth hook: `src/hooks/useAuth.tsx`
- Páginas para integração futura:
  - `src/pages/DepositPage.tsx`
  - `src/pages/WithdrawPage.tsx`
  - `src/pages/StatementPage.tsx`

A troca do mock por backend real pode ser feita substituindo a implementação de `mockAuthService` e adicionando chamadas HTTP nas páginas autenticadas.
