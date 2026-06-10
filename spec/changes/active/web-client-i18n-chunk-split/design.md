# Design

## Overview

The web client keeps using the desktop locale files as the base translation
source because it embeds desktop UI, but it now loads locale pairs through
dynamic imports. Each language loader fetches the desktop locale JSON and the
web-specific locale JSON, merges them, and registers the result with i18next.

The client exports `i18nReady`, and `main.tsx` waits on it before rendering the
root. `App.tsx` uses React `lazy()` for `DesktopWorkspacePage`, so setup/login
and auth-loading routes no longer import the desktop renderer workspace during
the initial web bundle evaluation.

## Affected Areas

- Data model: none.
- IPC / API: none.
- Filesystem / sync: none.
- UI / UX: authenticated users can briefly see the existing loading screen
  while the desktop workspace chunk loads; setup/login behavior is unchanged.
- Build/performance: web initial client entry drops the desktop workspace from
  the first chunk, and locale JSON modules are consistently dynamically loaded.

## Tradeoffs

- Dynamic locale loading adds an async bootstrap step, but the app already needs
  i18n before rendering translated setup/login/loading UI.
- The authenticated workspace is still a large chunk; splitting it from the
  unauthenticated shell reduces initial cost without changing embedded desktop
  behavior.
