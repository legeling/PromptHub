# Implementation

## Shipped Changes

- Web import/export now reuses `parseSyncSnapshot()` as the normalization boundary for JSON and ZIP imports, preserving PromptHub envelope compatibility, legacy `versions`, numeric timestamps, media payloads, and desktop `settings.state` snapshots.
- Web `/api/import` now keeps validation failures on the `VALIDATION_ERROR`/422 contract while still accepting the broader normalized sync snapshot shape.
- Web backup export/import now includes `skillFiles`, and skill workspace rebuilds preserve or restore additional skill repo files instead of silently dropping everything except `SKILL.md` and `versions/`.
- Web `/api/sync/data` and WebDAV `/api/sync/pull` now reuse the same `parseSyncSnapshot()` normalization boundary as `/api/import`, so PromptHub envelopes, legacy `versions`, numeric timestamps, media payloads, and desktop `settings.state` snapshots no longer depend on a duplicated route-local schema.
- Web `/api/import` and `/api/sync/*` now fill missing snapshot `settings` from shared `DEFAULT_SETTINGS`, removing the prior `zh` vs `en` route-level fallback split.
- Desktop selective ZIP export embeds a full re-importable snapshot in `import-with-prompthub.json`, including media, `settingsUpdatedAt`, skills, skill versions, and `skillFiles`.
- Desktop self-hosted sync now carries `skillFiles` in push/pull payloads and uses the web captcha flow for login/bootstrap helpers so real self-hosted sync remains functional after auth hardening.
- Desktop WebDAV `Sync on Save` is now a real renderer-side capability: a debounced single-flight upload scheduler runs only after real user save actions for prompts, folders, rules, skills, skill file edits, skill version changes, and prompt version deletions. Import/restore flows and translation sidecar writes remain excluded to avoid sync loops and accidental remote overwrites.
- Desktop S3-compatible storage is now a real renderer/main-process capability: the desktop app exposes S3 IPC through Electron main/preload, supports connection checks plus manual upload/download from Settings, and participates in startup sync, periodic sync, and save-triggered sync using the same snapshot/export contract as WebDAV.
- Desktop WebDAV and S3 sync now share a single renderer-side backup/sync core for legacy full backup upload/download, incremental manifest/data/media sync, and auto-sync timestamp comparison. Provider files now only supply transport/path adapters, and WebDAV auto-sync now correctly prefers the incremental `manifest.json` timestamp before falling back to the legacy single-file backup timestamp.
- Desktop sync regression coverage now includes direct unit tests for the shared sync core, locking manifest-first timestamp lookup, legacy fallback behavior, encrypted incremental download failure handling, unchanged incremental upload no-op behavior, `settingsUpdatedAt`-driven auto-sync uploads, and auto-sync upload/download/no-op direction decisions instead of relying only on provider wrapper tests.
- Desktop cleanup now also includes the final `window.electron.exportZip` typing alignment for `videos` in the preload global declaration plus a fixed `SkillFileEditor` component test that scopes file-tree assertions to the visible tree instead of the duplicated editor/header/status text.
- Desktop cleanup now also removes the last renderer-side backup duplication and mixed-import build debt: the stale backup bridge/duplicate backup helpers were deleted from `services/database.ts`, the self-hosted captcha solving logic now lives in a shared helper reused by renderer sync and desktop E2E bootstrap/login helpers, and the remaining `EditPromptModal` static-vs-lazy mixed import warning was removed from `App.tsx`.
- Desktop renderer bundle cleanup now lazily loads the prompt table/gallery/kanban views, prompt detail/AI test/variable/version modals, and rules manager. This removed the remaining renderer mixed-import warnings and reduced the main renderer chunk from roughly `1268 kB` to `1123 kB` while preserving the existing sync/export behavior.
- Desktop settings now persist an explicit `syncProvider`, allow multiple backup targets to remain enabled, and clamp automatic sync to that one selected source across startup sync, periodic sync, and save-triggered sync scheduling. Legacy settings migration now infers a provider only when exactly one provider previously had automatic sync behavior configured; otherwise it safely falls back to manual mode.
- Follow-up regression tests uncovered a real same-version hydration bug: a persisted `syncProvider` could remain set to a disabled provider because Zustand's same-version rehydrate path uses `merge`, not `migrate`. Desktop settings now clamp `syncProvider` during `persist.merge` as well, so invalid same-version persisted state is corrected before hydration completes.
- Follow-up backup auto-sync audit found that periodic auto-sync timers were only created once after app initialization. If a user configured S3/WebDAV/self-hosted automatic sync after the app was already open, the new interval would not start until a reload/restart. Periodic auto-sync now uses a settings-subscribed controller that starts, clears, and switches provider timers whenever the active provider or interval changes.
- Desktop data settings now surface a `Current sync source` selector, keep non-selected providers available for manual backup/restore, and explain when a provider is enabled but inactive for automatic sync.
- Desktop data submenu labels now use provider-oriented names (`Self-Hosted PromptHub`, `WebDAV`, `S3 Compatible Storage`) and show `common.enabled` state directly in the submenu. The submenu buttons now also expose a space-separated accessible label so screen readers and tests report `WebDAV Enabled` instead of concatenated text.
- Desktop locale coverage for the sync-source chooser and renamed provider menu labels is now present in all 7 locales.
- Desktop regression coverage now also guards two provider-switch hazards that would have produced real user-facing sync conflicts: disabling the active provider must force `syncProvider` back to `manual`, and switching the active provider must cancel stale save-sync timers from the previous provider before they can upload.
- Desktop full backup UI no longer exports the legacy `.phub.gz` envelope from the primary Settings action. The `Full backup` button now reuses the same full ZIP export contract as selective export (all scopes enabled), while restore remains compatible with `.json`, `.zip`, and legacy `.phub.gz` files.
- Desktop update-dialog manual backup now also reuses that same full ZIP export contract: the pre-upgrade backup action still records a local rollback snapshot, but the user-facing download is no longer the legacy JSON-only `prompthub-backup-*.json` flow.
- Desktop self-hosted E2E coverage now matches the shipped runtime behavior: startup auto-sync assertions expect replace-mode pull semantics, startup-sync tests explicitly disable `minimizeOnLaunch` so hidden-launch gating does not suppress the startup pull, and the live self-hosted settings test enters the `Self-Hosted PromptHub` data submenu before clicking manual connection/upload/download actions.
- Desktop release verification is green again: the full `pnpm test:release` gate now passes end-to-end after rechecking the full unit suite, current self-hosted smoke semantics, and the desktop build + smoke Playwright path.
- Desktop main-process production builds now keep `@aws-sdk/client-s3` external instead of bundling the Smithy CommonJS chain through Vite. This removes the build-time `[commonjs] Cannot read properties of undefined (reading 'resolved')` failure that appeared while transforming `@smithy/core` during desktop production builds.
- Follow-up S3 sync audit added renderer adapter regression coverage for normalized S3 object keys, incremental `data.json` / `manifest.json` upload, and incremental download restoration of prompts, rules, skills, versions, and `skillFiles`.
- Desktop cloud target manual action labels now distinguish direction explicitly: `Back up to remote` uploads the current computer's data, while `Update from remote` pulls remote data onto this computer. This keeps the cross-PC setup flow clear and prevents users from mistaking remote pull for the timestamp-based automatic sync path.

## Verification

- `pnpm --filter @prompthub/web exec tsc --noEmit`
- `pnpm --filter @prompthub/web test -- src/routes/import-export.test.ts --run`
- `pnpm --filter @prompthub/web test -- src/routes/sync.test.ts --run`
- `pnpm --filter @prompthub/web exec tsc --noEmit`
- `pnpm --filter @prompthub/web test -- src/services/skill-workspace.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/self-hosted-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/self-hosted-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/sync-backup-core.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/webdav-save-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/sync-backup-core.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/webdav.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/backup-orchestrator.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/app-background.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/s3-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/settings-page.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/settings-sync-provider.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/prompt-save-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/folder-save-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/rules.store.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/skill.store.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "WebDAV sync-on-save"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "enables S3 actions once storage is enabled in settings"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "runs S3 connection checks from the settings panel"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "runs S3 uploads from the settings panel"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "runs S3 downloads from the settings panel"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/webdav-save-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/app-background.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/self-hosted-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/sync-backup-core.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/settings-sync-provider.test.ts tests/unit/services/webdav-save-sync.test.ts tests/unit/services/app-background.test.ts tests/unit/components/data-settings.test.tsx tests/unit/components/settings-page.test.tsx --run`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/settings-sync-provider.test.ts tests/unit/services/webdav-save-sync.test.ts tests/unit/services/app-background.test.ts --coverage --coverage.include=src/renderer/stores/settings.store.ts --coverage.include=src/renderer/services/webdav-save-sync.ts --coverage.include=src/renderer/services/app-background.ts`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/backup-orchestrator.test.ts tests/unit/services/database-backup.test.ts tests/unit/components/data-settings.test.tsx --run`
- `pnpm --filter @prompthub/web lint`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop exec tsc --noEmit`
- `pnpm --filter @prompthub/web build`
- `pnpm --filter @prompthub/desktop build`
- `pnpm build` (from `apps/desktop`)
- `pnpm exec playwright test tests/e2e/self-hosted-sync.spec.ts --reporter=line` (from `apps/desktop`)
- `pnpm --filter @prompthub/desktop test:release`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/s3-sync.test.ts tests/unit/services/sync-backup-core.test.ts tests/unit/services/backup-orchestrator.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/data-settings.test.tsx --testNamePattern "S3"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/periodic-auto-sync.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/periodic-auto-sync.test.ts tests/unit/services/app-background.test.ts tests/unit/services/webdav-save-sync.test.ts tests/unit/services/backup-orchestrator.test.ts tests/unit/services/sync-backup-core.test.ts tests/unit/services/s3-sync.test.ts tests/unit/services/webdav.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/prompt-save-sync.test.ts tests/unit/stores/folder-save-sync.test.ts tests/unit/stores/rules.store.test.ts tests/unit/stores/skill.store.test.ts tests/unit/stores/settings-sync-provider.test.ts`

## Follow-up

- Renderer build output still reports the generic large-chunk warning (`index-*.js` > 500 kB). This no longer reflects sync/export architectural duplication, but it remains a bundle-size optimization opportunity if startup performance becomes a priority.
- Rules workspace version reading now tolerates missing `.md` snapshot files (ENOENT) by skipping them and repairing the `index.json` on the fly. This fixes the "export/backup fails when a rule history file is missing" bug and prevents the UI from crashing when deleting versions.
- `ensureGlobalRuleMaterialized` and `createProjectRule` now guard against creating duplicate initial "create" versions when called more than once for the same rule.
