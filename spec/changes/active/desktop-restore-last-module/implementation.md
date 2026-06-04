# Implementation

## Status

Implemented.

## Notes

- `apps/desktop/src/renderer/stores/ui.store.ts` now persists `appModule` and `viewMode` alongside the existing sidebar layout preferences.
- Startup restoration is intentionally limited to the home module (`prompt`, `skill`, `rules`). It does not persist Settings as a startup destination.
- Persisted values are normalized during merge. Unknown modules fall back to `prompt`, and `viewMode` is derived from the restored module (`skill` -> `skill`, otherwise `prompt`).

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/ui-columns.test.ts` passed: 12 tests passed.
- Added regression coverage for restoring `skill`, restoring `rules`, persisting module changes, and falling back from invalid persisted modules.
