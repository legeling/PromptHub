# Implementation

## Shipped

- Added a route regression proving `PUT /api/settings` previously accepted and
  persisted `security.masterPasswordConfigured` / `security.unlocked`.
- Removed `security` from the live Web settings update schema.
- Marked the live settings update schema strict so over-broad top-level payloads
  get a `422 VALIDATION_ERROR` instead of silently persisting unexpected state.
- Explicitly allowed existing supported shared preference fields in the strict
  schema, including tag filtering, background image preferences, platform
  settings, update channel, and startup preferences.
- Preserved `defaultFolderId: null` as a clear signal and updated
  `SettingsService.set` to delete cleared keys from SQLite and the workspace
  settings JSON file.
- Updated the import/export round-trip regression so historical
  `settings.security` compatibility is exercised through imported payloads,
  while live `PUT /api/settings` remains forbidden from writing security state.
- Added shared field-level validation for persisted settings metadata:
  `backgroundImageFileName`, `lastManualBackupAt`, and
  `lastManualBackupVersion`.
- Applied the same persisted metadata validation to live settings updates, JSON
  import, and sync data import so backup/sync payloads cannot bypass the live
  API boundary.
- Added a route regression proving `backgroundImageBlur` values above the
  renderer-supported range are rejected and do not persist.
- Bounded Web `backgroundImageBlur` validation to `0..50`, matching the desktop
  renderer clamp used for background image CSS blur.

## Verification

- Failure-first check before implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "security state"`
  - Failed because the security settings update returned `200`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "supported live preference"`
  - Failed because the strict schema rejected supported shared preference
    fields with `422`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "clears defaultFolderId"`
  - Failed because the route returned `200` but the old `defaultFolderId`
    remained persisted.
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "round-trips data"`
  - Failed after the live settings schema was tightened because the regression
    still attempted to create `settings.security` through `PUT /api/settings`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "malformed settings updates"`
  - Failed because malformed persisted preference metadata returned `200`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "malformed persisted preference fields"`
  - Failed because import accepted the malformed settings metadata with `201`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "malformed persisted settings preference fields"`
  - Failed because sync import accepted the malformed settings metadata with
    `200`.
- Passing checks after implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "security state"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "supported live preference"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "clears defaultFolderId"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "malformed settings updates"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/services/settings.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "round-trips data"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "malformed persisted preference fields"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "malformed persisted settings preference fields"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/settings.ts apps/web/src/routes/settings.test.ts apps/web/src/routes/import-export.test.ts apps/web/src/routes/sync.test.ts apps/web/src/services/sync-snapshot.ts apps/web/src/services/settings-validation.ts spec/changes/active/web-settings-security-boundary`
- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "malformed settings updates"`
  - Failed because `backgroundImageBlur: 51` did not produce a
    `backgroundImageBlur` validation error.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "malformed settings updates"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "malformed persisted preference fields"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "malformed persisted settings preference fields"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/services/settings.service.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/settings.test.ts apps/web/src/services/settings-validation.ts spec/changes/active/web-settings-security-boundary`

## Synced Docs

- Active delta spec, design, and tasks cover the behavior change. No stable docs
  were synced because this is a narrow Web settings mutation boundary and does
  not introduce a new security workflow or storage schema.

## Follow-ups

- Consider a separate audit for sync/import settings snapshots if Web security
  state becomes a first-class feature.
