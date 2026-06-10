# Implementation

## Shipped

- Added `writeJsonFileAtomic()` for small Web runtime JSON files. It writes to a
  same-directory temporary file and then renames over the target.
- Switched `DeviceService` registry persistence to the atomic JSON writer.
- Added a device service regression proving an interrupted registry write
  preserves the previous readable JSON file instead of leaving a truncated
  target.
- Switched `SettingsService` settings mirror persistence to the same atomic JSON
  writer.
- Added a settings service regression proving an interrupted mirror write
  preserves the previous readable JSON file instead of leaving a truncated
  target.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/services/device.service.test.ts`
  - Failed because the existing direct write left `config/devices/<userId>.json`
    truncated to `[` after a simulated interrupted write.
  - `pnpm --filter @prompthub/web test -- --run src/services/settings.service.test.ts -t "settings mirror write is interrupted"`
  - Failed because the existing direct write left
    `config/settings/<userId>.json` truncated to `[` after a simulated
    interrupted write.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/services/device.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/devices.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/services/settings.service.test.ts -t "settings mirror write is interrupted"`
  - `pnpm --filter @prompthub/web test -- --run src/services/settings.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/services/device.service.test.ts src/routes/devices.test.ts src/services/settings.service.test.ts src/routes/settings.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/services/atomic-json-file.ts apps/web/src/services/device.service.ts apps/web/src/services/device.service.test.ts apps/web/src/services/settings.service.ts apps/web/src/services/settings.service.test.ts spec/knowledge/behavior/web.md spec/changes/active/web-json-atomic-write`

## Synced Docs

- Synced the runtime JSON state guarantee for device registry and settings
  mirror writes into
  `spec/knowledge/behavior/web.md`.

## Follow-ups

- Evaluate settings, prompt workspace, skill workspace, rule workspace, and
  synced media writers separately with risk-specific tests before expanding the
  helper.
