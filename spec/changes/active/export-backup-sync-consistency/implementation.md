# Implementation

## Shipped Changes

- Web import/export now reuses `parseSyncSnapshot()` as the normalization boundary for JSON and ZIP imports, preserving PromptHub envelope compatibility, legacy `versions`, numeric timestamps, media payloads, and desktop `settings.state` snapshots.
- Web `/api/import` now keeps validation failures on the `VALIDATION_ERROR`/422 contract while still accepting the broader normalized sync snapshot shape.
- Web backup export/import now includes `skillFiles`, and skill workspace rebuilds preserve or restore additional skill repo files instead of silently dropping everything except `SKILL.md` and `versions/`.
- Web sync snapshot parsing now rejects unsafe imported skill file paths, including traversal, absolute/root paths, ASCII control characters, `skill.json`, `versions`, and `versions/*`, for both `skillFiles` and skill-version `filesSnapshot` entries before any database import or workspace write can occur.
- Web sync snapshot parsing now rejects imported folder parent cycles before route handlers write media or call database/workspace import paths, preventing cyclic folder payloads from hanging import depth sorting or leaving partial records.
- Web skill workspace restore writes now also reject traversal, parent-directory, drive-letter, ASCII control-character, `skill.json`, `versions`, and `versions/*` paths before touching the filesystem, keeping workspace storage defensive independently of import schema validation.
- Web skill workspace restore now prevalidates all provided restored file paths before deleting/rebuilding the workspace, so an invalid restored `skillFiles` payload cannot erase the last good workspace files before failing.
- Web backup import now precomputes folder depth with a memoized ID map before merge ordering, replacing repeated parent-chain scans during sort and preserving reversed hierarchy imports with intact parent links.
- Web import, direct sync import, WebDAV pull, and `BackupService.import()` now preflight the physical prompt workspace paths implied by imported folders/prompts/versions before media, database, or workspace writes. Over-deep folder trees now fail with 422 validation instead of partially importing records and then failing during workspace rebuild.
- Web prompt workspace rebuild now also preflights physical paths derived from the current DB before clearing `data/prompts`, so a bad existing folder tree cannot erase the last good workspace during failed rebuild.
- Web import, direct sync import, WebDAV pull, and `BackupService.import()` now also preflight physical skill workspace paths implied by imported skills, skill versions, and restored skill files before media, database, or workspace writes. Over-long skill directory paths now fail with 422 validation instead of partially importing records and then failing during workspace rebuild.
- Web skill workspace rebuild now also preflights physical paths derived from the current DB before clearing `data/skills`, so a bad existing skill name or version path cannot erase the last good workspace during failed rebuild.
- Web import, direct sync import, WebDAV pull, and `BackupService.import()` now preflight imported rule workspace path segments before media, database, or workspace writes. Rule records with traversal, path separators, drive-letter-like segments, control characters, or over-long physical paths now fail with 422 validation instead of writing managed rule files outside the expected user rules layout.
- Web `/api/sync/data` and WebDAV `/api/sync/pull` now reuse the same `parseSyncSnapshot()` normalization boundary as `/api/import`, so PromptHub envelopes, legacy `versions`, numeric timestamps, media payloads, and desktop `settings.state` snapshots no longer depend on a duplicated route-local schema.
- Web `/api/import` and `/api/sync/*` now fill missing snapshot `settings` from shared `DEFAULT_SETTINGS`, removing the prior `zh` vs `en` route-level fallback split.
- Web settings validation now has a shared service schema used by both
  `PUT /api/settings` and sync snapshot parsing. Supported shared preferences
  such as tag filtering, background image tuning, platform paths, custom
  agents, skill projects, backup metadata, update channel, and startup behavior
  now round-trip through web export/import instead of being stripped by the
  import parser and leaving stale local values in place.
- Web media filename and base64 validation now have shared service helpers used by upload routes and sync media read/write paths. Sync/import-export media payloads now reject empty/current-directory names, traversal, path separators, null bytes, ASCII control characters, malformed base64, and oversized decoded payloads before touching the filesystem, and pulled sync media validates and decodes both image and video maps before writing any file.
- Web direct sync import and WebDAV pull now validate pulled media before import but write media files only after `BackupService.import()` succeeds. A route regression now simulates a later rule-import failure and asserts the failed sync leaves no prompts, folders, rules, or `remote-image.png` media file behind.
- WebDAV incremental pull now verifies the downloaded `data.json` against manifest `dataHash` and each downloaded media file against manifest `hash` and `size` before handing data to import/write paths, preventing tampered but still parseable backup payloads from being accepted silently.
- WebDAV incremental push now uploads media before replacing `data.json`, and still writes `manifest.json` last. If a media upload fails, the previous remote `data.json` and manifest remain paired instead of leaving a new data file checked by an old manifest.
- WebDAV remote URL construction now validates configured `remotePath` and backup object paths segment-by-segment, rejecting traversal, backslash separators, and control characters before issuing remote requests.
- Web sync/settings configuration routes now reuse the WebDAV remote path validator, so unsafe `remotePath` values are rejected with validation errors before being persisted.
- Web sync/settings configuration routes now also reject non-HTTPS WebDAV endpoints before persistence, matching the WebDAV transport layer's HTTPS-only protocol enforcement while preserving existing non-WebDAV provider endpoint validation.
- WebDAV sync-orchestrator tests now partial-mock `sync-media` so manifest media filenames still use the real shared validation helper. The suite now explicitly rejects unsafe manifest media names such as `../escape.png` before any media file download is attempted.
- Remote HTTP tests now also cover HTTPS-only redirects, asserting that an HTTPS request with `allowedProtocols: ['https:']` rejects an `http:` redirect before opening an insecure request.
- Remote HTTP redirect handling now strips `Authorization`, `Proxy-Authorization`,
  and `Cookie` when a redirect crosses origins, preventing WebDAV credentials or
  other caller-supplied secrets from being forwarded to a different host while
  preserving non-sensitive headers and same-origin redirect behavior.
- Remote HTTP redirect handling now also refuses cross-origin redirects for
  requests that carry a body, preventing AI proxy or WebDAV upload payloads from
  being replayed to a different origin. Same-origin redirects remain supported.
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
- Follow-up settings hydration audit found the same class of bug for desktop background image preferences: a current-version persisted `backgroundImageFileName` could keep an unsafe remote URL in store state because the same-version `merge` path bypassed migration normalization. Desktop settings now sanitize the background image file name and clamp opacity/blur during `persist.merge`, before rehydration applies CSS variables or later persistence/sync can retain the bad state.
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
- Desktop backup and sync snapshots now include the complete current-format Agent asset set: structured MCP/Plugin libraries, managed plugin package snapshots, Skill/MCP/Plugin custom store sources, and `agentAssetFiles` snapshots for the managed `data/mcp` and `data/plugins` directories. This intentionally targets the current data layout only; no legacy Agent asset storage migration is part of this change.
- Desktop restore now restores managed `data/mcp` and `data/plugins` file snapshots first, then rewrites the structured MCP and Plugin libraries. This keeps the directory content complete while ensuring Plugin `library.json` paths are remapped to the current machine's managed `data/plugins/<plugin>/package` directory instead of preserving another machine's absolute paths.
- Web/self-hosted sync now preserves the same Agent asset fields through snapshot parsing, backup import/export payloads, sync summaries, and a per-user sidecar file under `data/agent-assets/`. Plugin package and Agent asset file path validation are separate from Skill file path validation so plugin package files such as `skill.json` and `versions/*` are legal while Skill workspace snapshots still reject those reserved paths.

## Verification

- `pnpm --filter @prompthub/web exec tsc --noEmit`
- `pnpm --filter @prompthub/web test -- src/routes/import-export.test.ts --run`
- `pnpm --filter @prompthub/web test -- src/routes/sync.test.ts --run`
- `pnpm --filter @prompthub/web test -- --run src/services/sync-media.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/services/media-base64.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/services/sync-orchestrator.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/services/webdav.server.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts src/services/skill.service.test.ts src/services/webdav.server.test.ts src/services/sync-orchestrator.test.ts src/utils/remote-http.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts src/services/webdav.server.test.ts src/services/sync-orchestrator.test.ts src/routes/ai.test.ts src/routes/media.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "does not leave media files"`
- `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`
- Failure-first check: `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "round-trips data"` failed because imported settings kept stale local values for route-supported preference fields that sync snapshot parsing stripped.
- `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "round-trips data"`
- `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "round-trips data|malformed persisted preference fields"`
- `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "clears defaultFolderId|supported live preference"`
- `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "malformed persisted settings preference fields|fills missing settings"`
- `git diff --check -- apps/web/src/routes/settings.ts apps/web/src/routes/settings.test.ts apps/web/src/routes/import-export.test.ts apps/web/src/routes/sync.test.ts apps/web/src/services/sync-snapshot.ts apps/web/src/services/settings-validation.ts spec/changes/active/web-settings-security-boundary spec/changes/active/export-backup-sync-consistency`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `git diff --check -- apps/web/src/services/media-filename.ts apps/web/src/services/sync-media.ts apps/web/src/services/sync-media.test.ts apps/web/src/routes/media.ts apps/web/src/routes/media.test.ts spec/changes/active/export-backup-sync-consistency/tasks.md spec/changes/active/export-backup-sync-consistency/design.md spec/changes/active/export-backup-sync-consistency/implementation.md spec/changes/active/web-media-upload-fixes/tasks.md spec/changes/active/web-media-upload-fixes/implementation.md`
- `pnpm --filter @prompthub/web exec tsc --noEmit`
- `pnpm --filter @prompthub/web test -- src/services/skill-workspace.test.ts --run`
- `pnpm --filter @prompthub/web test -- --run src/services/skill-workspace.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "skill workspace paths"`
- `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "skill workspace path limits"`
- `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts src/routes/sync.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/services/skill-workspace.test.ts src/services/prompt-workspace.test.ts`
- `git diff --check -- apps/web/src/services/skill-workspace.ts apps/web/src/services/backup.service.ts apps/web/src/routes/import-export.ts apps/web/src/routes/sync.ts apps/web/src/routes/import-export.test.ts apps/web/src/routes/sync.test.ts apps/web/src/services/skill-workspace.test.ts apps/web/src/services/prompt-workspace.test.ts spec/changes/active/export-backup-sync-consistency/design.md spec/changes/active/export-backup-sync-consistency/tasks.md spec/changes/active/export-backup-sync-consistency/implementation.md spec/issues/active/quality.md`
- `pnpm --filter @prompthub/web test -- --run src/services/rule-workspace.test.ts src/routes/import-export.test.ts src/routes/sync.test.ts`
- `git diff --check -- apps/web/src/services/rule-workspace.ts apps/web/src/services/rule-workspace.test.ts apps/web/src/services/backup.service.ts apps/web/src/routes/import-export.ts apps/web/src/routes/import-export.test.ts apps/web/src/routes/sync.ts apps/web/src/routes/sync.test.ts`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/self-hosted-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/self-hosted-sync.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/sync-backup-core.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/webdav-save-sync.test.ts --run`
- Failure-first check:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-background-image.test.ts -t "same-version persisted background"`
  - Failed because a current-version persisted remote background image URL
    remained in `useSettingsStore.getState().backgroundImageFileName`.
- Passing checks:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-background-image.test.ts -t "same-version persisted background"`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-background-image.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test:run tests/unit/services/database-backup.test.ts`
- `pnpm --filter @prompthub/desktop test:run tests/unit/main/agent-asset-file-snapshot.test.ts`
- `pnpm --filter @prompthub/desktop test:run tests/unit/main/plugin-library.test.ts`
- `pnpm --filter @prompthub/desktop test:run tests/unit/services/self-hosted-sync.test.ts`
- `pnpm --filter @prompthub/desktop test:run tests/unit/services/sync-backup-core.test.ts`
- `pnpm --filter @prompthub/web test src/services/sync-snapshot.test.ts src/services/agent-assets-sync.test.ts`
- `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/desktop lint`
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

## 2026-06-10 same-version sync timing hydration

- 发现：desktop settings 的旧版本迁移和 UI setter 会约束启动同步延迟与自动同步间隔，
  但 current-version localStorage hydrate 只走 zustand `merge`，不会触发 `migrate`。
  如果快照中存在负数、字符串坏值或超出 UI 范围的启动延迟，启动同步可能立即执行；
  如果周期同步间隔是 malformed/negative 值，也可能进入周期同步选择和计时器注册路径。
- 处理：
  - 新增 `normalizeSyncTimingSettings()`，覆盖 WebDAV / Self-hosted / S3 的
    startup delay 与 auto-sync interval。
  - startup delay 与 UI setter 保持一致，夹在 `0..60` 秒；坏值回默认 `10`。
  - auto-sync interval 必须是有限非负数；坏值回 `0`，数字字符串按设置输入路径兼容为数字。
  - `persist.merge` 与 `migrate` 都复用同一 timing normalizer，且迁移路径在 legacy
    `syncProvider` 推断前先清洗 timing 值。
- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-sync-provider.test.ts -t "sync timing"`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-sync-provider.test.ts`
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/services/periodic-auto-sync.test.ts`
  - `pnpm --filter @prompthub/desktop typecheck`
  - `pnpm --filter @prompthub/desktop lint`
  - `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-sync-provider.test.ts spec/changes/active/export-backup-sync-consistency spec/issues/active/quality.md`

## 2026-06-10 desktop backup download URL cleanup

- 发现：desktop JSON / compressed backup fallback download helper 会创建临时
  object URL 和 anchor，并在 1 秒后的 timer 中移除 anchor、revoke URL。
  如果 `anchor.click()` 抛错，清理 timer 不会注册，临时 DOM 节点和 blob URL
  会泄漏；如果 anchor 在 timer 执行前已被移除，`removeChild` 抛错也会阻断
  `URL.revokeObjectURL()`。
- 处理：
  - 把 backup download cleanup 提取为单一闭包。
  - 成功路径仍延迟 1 秒清理，避免过早 revoke 截断下载。
  - 失败路径立即清理并重新抛出原始 click 错误。
  - 清理时先检查 `a.isConnected`，确保 DOM 状态变化不会阻断 blob URL 回收。
- 验证：
  - Failure-first:
    `pnpm --filter @prompthub/desktop test -- --run tests/unit/services/database-backup.test.ts`
    initially failed because the click-failure path did not remove the anchor
    or revoke `blob:failed-download`.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/services/database-backup.test.ts`
  - `pnpm --filter @prompthub/desktop typecheck`
