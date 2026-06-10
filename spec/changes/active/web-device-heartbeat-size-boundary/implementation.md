# Implementation

## Shipped

- Added a route regression proving an oversized heartbeat `userAgent` returns
  `422 VALIDATION_ERROR`, leaves the device list empty, and does not create the
  device config directory.
- Added heartbeat route schema limits:
  - `id`: 128 characters
  - `name`, `platform`, `appVersion`, `clientVersion`: 120 characters
  - `userAgent`: 512 characters

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/devices.test.ts -t "oversized heartbeat"`
  - Failed because the oversized heartbeat returned `200` and wrote the device.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/devices.test.ts -t "oversized heartbeat"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/devices.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/devices.ts apps/web/src/routes/devices.test.ts spec/changes/active/web-device-heartbeat-size-boundary`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web device heartbeat size boundary. No stable docs were synced
  because the device storage model remains unchanged.

## Follow-ups

- None currently.
