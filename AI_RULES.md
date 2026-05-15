# AI Development Rules – Next.js App

## Stack
- Framework: Next.js
- Language: TypeScript
- Routing: App Router (`app/`)
- Styling: existing project styles unless the user requests a change
- Backend: implemented in the same repository when needed
- Database/Auth/Server-side: prefer Supabase unless the user specifies otherwise

## Conventions
- Prefer Server Components by default; use Client Components only when interactivity is needed
- Put API/server logic in Next.js route handlers, server actions, or Supabase edge/server integrations as appropriate
- Keep components small, focused, and easy to reuse
- Reuse the existing visual language and design tokens whenever possible
- Do not introduce unnecessary libraries or abstractions

## Structure Guidance
- `app/` for routes and layouts
- `components/` for reusable UI
- `lib/` for shared utilities/services
- `public/` for static assets
- `supabase/` only for edge functions or Supabase-specific server code when needed

## Persistent Notes
- This project is now treated as a Next.js codebase
- Future changes should assume frontend and backend can live in the same repository
- Keep updating `VERSIONS.md` whenever project files are changed
