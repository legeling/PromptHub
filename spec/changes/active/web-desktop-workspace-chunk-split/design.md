# Design

## Boundary

Owner: `apps/desktop/src/renderer/App.tsx`, consumed directly by
`apps/web/src/client/pages/DesktopWorkspace.tsx` through the Vite
`@desktop-renderer-app` alias.

Source of truth: renderer state remains in the existing Zustand stores and
desktop services. This change only affects module loading.

## Approach

- Keep type-only imports where needed.
- Convert `UpdateDialog`, `CloseDialog`, `DataRecoveryDialog`, and
  `BackupImportConfirmDialog` to React lazy imports.
- Render lazy dialogs only when their open state is true and wrap each lazy
  dialog in a local `Suspense fallback={null}` boundary.
- Keep startup, migration, update-check, and auto-sync services static because
  the first dynamic-import attempt was cancelled after Vite reported mixed
  static/dynamic import warnings from other lazy chunks; leaving those services
  static is cleaner than adding ineffective dynamic imports.
- Keep shared UI imports and core workspace components static when they render
  on the authenticated web route.

## Data And Contract Impact

- SQLite schema: none.
- Filesystem layout: none.
- IPC/preload contracts: none.
- API routes: none.
- Shared types: none.

## Verification

- Web build must reduce or at least not grow the authenticated workspace chunk.
- Web build must not introduce mixed static/dynamic import warnings.
- Web unit/build gates must pass.
- Desktop typecheck and targeted dialog tests must pass to catch lazy import
  regressions.
