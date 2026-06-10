# Implementation

## Status

Implemented.

## Changes

- Added client-side validation for the persisted browser device id before sending `/api/devices/heartbeat`.
- Invalid local ids are replaced with a generated id that satisfies the server boundary.
- Browser heartbeat requests now use `fetchWithAuthRetry` instead of raw `fetch`.
- Heartbeat non-OK responses now throw into the existing warning path.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/client/pages/DesktopWorkspace.test.tsx`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `git diff --check -- apps/web/src/client/pages/DesktopWorkspace.tsx apps/web/src/client/pages/DesktopWorkspace.test.tsx spec/changes/active/web-device-heartbeat-resilience spec/issues/active/quality.md`
