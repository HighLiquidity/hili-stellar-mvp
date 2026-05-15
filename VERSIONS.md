# Version History

## v2.3.10 – 2026-05-15
- Added a dedicated button below the PIX copy-and-paste area on the fiat deposit page to copy the PIX code more easily

## v2.3.9 – 2026-05-15
- Updated the recent transactions panel to show BRL as the primary amount, BRH as a muted secondary equivalent, and renamed mock transaction labels from TRX to BRH

## v2.3.8 – 2026-05-15
- Updated the dashboard inflow and outflow KPI cards to keep BRL as the dominant value and show the approximate BRH amount as a muted secondary line

## v2.3.7 – 2026-05-15
- Removed mixed inline/CSS layout logic from the authenticated shell and rebuilt the user menu with a single class-based structure
- Reconnected the change-password page to its dedicated responsive CSS classes and tightened the topbar action layout to prevent wrapping regressions

## v2.3.6 – 2026-05-15
- Moved the user dropdown and change-password page to explicit component-level styling to bypass persistent global CSS conflicts
- Stabilized the menu trigger, dropdown panel, and password form layout with direct styles in the affected components

## v2.3.5 – 2026-05-15
- Rebuilt the change-password page with a dedicated card layout to eliminate remaining formatting conflicts
- Hardened the user dropdown styles with fixed panel sizing, explicit appearance resets, and stronger spacing rules

## v2.3.4 – 2026-05-15
- Added the missing success-message styling and restored full layout rules for the change-password page
- Improved dropdown action item formatting, hover states, and width handling in the user menu
- Centered the single-column authenticated page layout and stabilized the password form card width

## v2.3.3 – 2026-05-15
- Restored missing styling for the change-password page after a CSS regression
- Refined the user dropdown panel spacing and layering to fix formatting issues

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
