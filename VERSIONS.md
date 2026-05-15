# Version History

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
