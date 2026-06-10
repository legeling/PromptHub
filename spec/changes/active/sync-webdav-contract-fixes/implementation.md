# Implementation

## Shipped Changes

- Added `sync-media.ts` as a small web-side repository adapter for collecting referenced media into WebDAV payloads and writing pulled media back to the workspace.
- Tightened WebDAV orchestrator behavior in `apps/web/src/services/sync-orchestrator.ts`:
  - only `404` triggers fallback to legacy files
  - `manifest.json` upload failure now fails the push
  - structured backup pull now requires a valid manifest
  - both `prompthub-backup.json` and `prompthub-web-backup.json` are readable during fallback
- Updated `apps/web/src/routes/sync.ts` so direct `/sync/data` imports and WebDAV pulls both persist media files before importing records.
- Updated `apps/web/src/client/api/endpoints.ts` to match the unified `summary`-first sync contract and keep legacy count fields typed.
- Expanded sync regression coverage for orchestrator and route behavior.
- Fixed an existing web build blocker by changing `apps/desktop/src/renderer/components/ui/PlatformIcon.tsx` to use a relative import for `hermes.svg`, matching the rest of the file's asset imports and allowing the web Vite build to resolve the icon.

## Follow-up: Merged WebDAV Config Validation

- Added a route regression for switching from a non-WebDAV provider with an
  `http://` endpoint to `provider: "webdav"` without supplying a new endpoint.
- Added merged-setting validation in `apps/web/src/routes/sync.ts` so the
  effective sync config must satisfy WebDAV's HTTPS endpoint requirement after
  patch merge, not only before merge.

## Follow-up: Imported WebDAV Settings Validation

- Added route regressions proving `/api/import` and `/api/sync/data` rejected
  payloads with `settings.sync.provider = "webdav"` and an `http://` endpoint,
  and did not persist that endpoint.
- Updated `apps/web/src/services/sync-snapshot.ts` so imported settings,
  including normalized desktop settings snapshots, enforce the same WebDAV
  HTTPS endpoint and remote-path safety policy used by live sync config routes.

## Follow-up: Sync Settings Field Bounds

- Added `apps/web/src/services/sync-settings-validation.ts` as the shared Web sync settings schema for live sync config, normal settings updates, backup imports, and direct sync imports.
- Bounded sync endpoint, username, password, and remotePath fields, and required `lastSyncAt` to be an ISO datetime when accepted.
- Added regressions proving oversized sync settings are rejected through `/api/sync/config`, `/api/settings`, `/api/import`, and `/api/sync/data`, and are not persisted.

## Follow-up: WebDAV Manifest Integrity

- Updated WebDAV structured push order so referenced media uploads finish before
  `data.json` and `manifest.json` are published.
- Verified pulled structured backups against `manifest.json` before returning
  them to import flow:
  - `data.json` must match `dataHash`
  - downloaded media must decode successfully, match manifest byte size, and
    match manifest hash
  - manifest media names must pass the existing safe media filename boundary
- Added orchestrator regressions for media upload failure before data
  publication, data hash mismatch, media hash mismatch, and unsafe manifest
  media names.

## Follow-up: WebDAV Endpoint Base URL Boundary

- Added centralized WebDAV endpoint parsing in `apps/web/src/services/webdav.server.ts`.
- WebDAV endpoints now must be absolute HTTPS URLs without query strings or
  fragments before config validation, connection testing, or target URL
  construction accepts them.
- Added regressions proving `?query` and `#fragment` endpoints are rejected
  before path construction or PROPFIND, preventing backup file names from being
  appended into query/fragment semantics.
- Scoped WebDAV-only endpoint policy to `provider: "webdav"` so self-hosted
  sync endpoints keep their provider-specific URL contract.

## Verification

- `pnpm --filter @prompthub/web lint`
- `pnpm --filter @prompthub/web exec tsc --noEmit`
- `pnpm --filter @prompthub/web test -- src/services/sync-orchestrator.test.ts --run`
- `pnpm --filter @prompthub/web test -- src/routes/sync.test.ts --run`
- `pnpm --filter @prompthub/web test -- src/client/api/endpoints.test.ts --run`
- `pnpm --filter @prompthub/web build`

Follow-up verification:

- Failure first:
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "accepts extended sync providers"` failed because the inherited HTTP endpoint was accepted with `200`.
- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "accepts extended sync providers"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts src/services/webdav.server.test.ts src/services/sync-orchestrator.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`

Imported settings follow-up verification:

- Failure first:
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "rejects imported WebDAV settings"` failed because `/api/import` accepted the insecure endpoint with `201`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "rejects sync imports with insecure WebDAV settings"` failed because `/api/sync/data` accepted the insecure endpoint with `200`.
- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "rejects imported WebDAV settings"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "rejects sync imports with insecure WebDAV settings"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts src/routes/sync.test.ts src/services/sync-orchestrator.test.ts src/services/webdav.server.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`

Sync settings field-bound verification:

- Failure first:
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "rejects oversized sync config fields"` failed because `/api/sync/config` accepted oversized sync settings with `200`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "validates malformed settings updates"` failed because `/api/settings` accepted oversized sync settings with `200`.
- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "rejects oversized sync config fields"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "validates malformed settings updates"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "rejects imported WebDAV settings with oversized fields"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "rejects sync imports with oversized WebDAV settings fields"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts src/routes/settings.test.ts src/routes/import-export.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/sync.ts apps/web/src/routes/sync.test.ts apps/web/src/routes/settings.ts apps/web/src/routes/settings.test.ts apps/web/src/routes/import-export.test.ts apps/web/src/services/sync-snapshot.ts apps/web/src/services/sync-settings-validation.ts spec/changes/active/sync-webdav-contract-fixes`

WebDAV manifest integrity verification:

- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/services/sync-orchestrator.test.ts`
  - `git diff --check -- apps/web/src/services/sync-orchestrator.ts apps/web/src/services/sync-orchestrator.test.ts spec/knowledge/behavior/sync.md`

WebDAV endpoint base URL verification:

- Failure first:
  - `pnpm --filter @prompthub/web test -- --run src/services/webdav.server.test.ts` failed because `https://...?...` and `https://...#...` endpoints were accepted.
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "accepts extended sync providers"` failed because WebDAV-only endpoint validation rejected a self-hosted `http://` endpoint.
- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/services/webdav.server.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "serves manifest"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "accepts extended sync providers"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "validates malformed settings updates"`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`

## Follow-up

- If we later promote a true cross-provider orchestrator interface, `sync-media.ts` should move behind that shared repository boundary rather than staying WebDAV-specific glue.
