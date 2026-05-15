# Version History

## v2.3.2 – 2026-05-15
- Restored the top-right user dropdown after a layout regression removed it from the header
- Kept the closed state as initials-only and the open state with full name, role, change password, and logout

## v2.3.1 – 2026-05-15
- Updated the top-right user menu to stay collapsed as initials-only in the header
- Added a dropdown profile header with full name and access role
- Added a logout action to the same dropdown alongside change password

## v2.3.0 – 2026-05-15
- Added a top-right user initials menu beside the theme toggle
- Added a dropdown action to open a dedicated change-password page
- Created an authenticated password-change form with current-password validation and double confirmation of the new password
- Added Supabase password update logic and page/user-menu translations

## v2.2.2 – 2026-05-15
- Simplified the login screen by removing the visible subtitle, private-access footnote, and demo badge
- Updated the primary login button label to a minimal `Login`

## v2.2.1 – 2026-05-15
- Replaced the Supabase Auth widget with a private email/password login form
- Removed any visible sign-up path from the login screen for the private panel flow
- Preserved access-denied feedback after forced sign-out for non-authorized users
- Updated login copy to state that only pre-registered users can access the system

## v2.2.0 – 2026-05-15
- Added Supabase client integration and replaced the mock login flow with Supabase Auth
- Added route protection based on authorized access instead of local mock session state
- Created `public.panel_access_list` and `public.profiles` tables for invited/pre-approved access control
- Added RLS policies and an auth trigger to sync new auth users into profiles
- Updated the login screen to use the Supabase Auth UI and show access-denied feedback

## v2.1.0 – 2026-05-15
- Added a new authenticated Dashboard page as the home screen after login
- Added account summary cards and a recent transactions list to the dashboard
- Updated routing so authenticated users land on /app/dashboard by default
- Added the Dashboard item to the sidebar navigation
- Added dashboard translation keys in PT/EN and a matching navigation icon

## v2.0.0 – 2026-05-15
- Replaced the Chrome extension scaffold with a Vite + React + TypeScript frontend for Fiat Ops MVP
- Added mock authentication flow with persistent session storage and protected routes
- Added responsive authenticated shell with collapsible sidebar, mobile overlay, and logout
- Added bilingual PT/EN dictionary-based i18n with persistent locale toggle
- Added light/dark theme system with persistence and first-visit system preference detection
- Added deposit, withdrawal, and statement placeholder pages for future API integration
- Added README with project structure, run instructions, and integration guidance
- Removed obsolete Chrome extension entry files (manifest, popup, background, content, legacy stylesheet)

## v1.0.0 – 2025-08-24
- @ToneDice created manifest.json with basic permissions and action popup
- Added background.js with minimal event listener
- Added content.js placeholder
- Added popup.html and popup.js with simple ping functionality
- Added styles.css for minimal popup styling
