# Design

## Overview

The fix is to converge on one logical snapshot contract instead of keeping separate per-route payload schemas.

## Key Decisions

- Treat `apps/web/src/services/sync-snapshot.ts` as the web-side normalization boundary for importable/exportable sync snapshots.
- Reuse the shared `DEFAULT_SETTINGS` contract when imported snapshots omit `settings`, instead of letting `/api/import` and `/api/sync/*` drift on separate route-local fallbacks.
- Keep accepting historical PromptHub envelopes (`prompthub-backup`, `prompthub-export`) and legacy `versions` payloads for compatibility.
- Make desktop `import-with-prompthub.json` contain a full re-importable snapshot, even when the ZIP also includes human-readable file trees.
- Treat `skillFiles` as part of the recoverable snapshot contract, with the web skill workspace acting as the durable backing store instead of introducing a separate database table.
- Treat My MCP and My Plugins as first-class current-format sync payloads: MCP uses its `McpLibraryFile`; Plugins use `PluginLibraryFile` plus snapshots of PromptHub-managed plugin package files.
- Treat `data/mcp` and `data/plugins` as complete managed Agent asset directories. Backup/sync must include file snapshots for those directories in addition to structured library fields, while excluding dependency/VCS/cache directories such as `.git`, `node_modules`, `.venv`, `__pycache__`, and `.cache`.
- Restore managed Agent asset directory snapshots before rewriting structured MCP/Plugin libraries, so files are complete while Plugin `library.json` still gets remapped to current-machine paths.
- Treat Skill/MCP/Plugin custom store sources as recoverable desktop store-source state, captured from their current Zustand persisted store keys and restored back into those same stores.
- Do not design backward compatibility for legacy MCP/Plugin sync formats in this change; absent current-format fields are ignored.
- Validate imported `skillFiles` and skill-version file snapshot paths in the sync snapshot parser, before database import or workspace writes, so traversal, control-character, and reserved paths cannot leave partial imported records behind.
- Keep the web skill workspace writer defensive as a second boundary, rejecting unsafe restored file paths even if a future caller bypasses sync snapshot parsing.
- Prevalidate restored skill workspace file paths before deleting/rebuilding the workspace, so invalid restored `skillFiles` fail without erasing the last good workspace state.
- Validate imported folder parent hierarchies in the sync snapshot parser, rejecting cycles before media, database, rule, or workspace writes can begin.
- Precompute imported folder depths with a memoized ID map before merge ordering, avoiding repeated parent-chain scans on larger restored folder trees.
- Preflight imported prompt workspace physical paths before media/database/workspace writes, rejecting folder trees that would exceed current filesystem path limits instead of leaving partial imports.
- Keep prompt workspace rebuild defensive by preflighting DB-derived physical paths before clearing `data/prompts`, preserving the last good workspace when existing DB state cannot be represented safely.
- Preflight imported skill workspace physical paths before media/database/workspace writes, rejecting skill names, versions, or restored files that would exceed current filesystem path limits instead of leaving partial imports.
- Keep skill workspace rebuild defensive by preflighting DB-derived physical paths before clearing `data/skills`, preserving the last good workspace when existing DB state cannot be represented safely.
- Treat imported rule workspace path parts as path segments, not trusted strings: user IDs, platform IDs, project IDs, rule names, managed copies, metadata files, and version files must reject traversal, separators, drive-letter-like values, control characters, and over-long physical paths before media/database/workspace writes.
- Treat media filenames and base64 payloads as shared web boundaries before reading exported media or writing pulled sync media, so upload routes and sync/import-export paths reject traversal, path separators, control characters, and malformed media payloads consistently.
- Treat WebDAV manifest `dataHash` plus per-media `hash` and `size` as integrity checks during pull before imported data or media is exposed to the local workspace.
- Publish WebDAV incremental backup files in a failure-tolerant order: media first, then `data.json`, and `manifest.json` last. A failed media upload must not replace remote data while leaving the old manifest in place.
- Treat WebDAV remote path and backup object path construction as a validated relative-path boundary, preserving nested paths while rejecting traversal, backslash separators, and control characters.
- Apply the same WebDAV remote path validation at settings/sync configuration entry points so unsafe paths fail before push/pull starts.
- Apply the same HTTPS-only WebDAV endpoint requirement at settings/sync configuration entry points, matching the transport layer's `allowedProtocols: ['https:']` enforcement before insecure endpoints are persisted.
- Keep unavailable desktop sync affordances visible but explicitly disabled when the backing capability is not implemented, so the settings UI matches the real execution path; once a capability is wired end-to-end, enable the control and keep the scope explicit.
- Allow desktop users to enable multiple backup destinations simultaneously, but route startup sync, periodic sync, and save-triggered sync through one explicit `syncProvider` so automatic flows never compete across providers.
- Promote provider identity in the desktop data submenu (`Self-Hosted PromptHub`, `WebDAV`, `S3 Compatible Storage`) and surface enabled state directly in the menu so the settings IA matches actual runtime behavior.
- Keep bulky binary/media duplication out of future enhancements when possible, but correctness and re-importability take priority over ZIP size in the embedded JSON payload.

## Affected Areas

- `apps/web/src/routes/import-export.ts`
- `apps/web/src/services/sync-snapshot.ts`
- `apps/web/src/services/backup.service.ts`
- `apps/web/src/services/media-filename.ts`
- `apps/web/src/services/sync-media.ts`
- `apps/web/src/services/skill-workspace.ts`
- `apps/web/src/routes/sync.ts`
- `apps/web/src/routes/import-export.test.ts`
- `apps/web/src/routes/sync.test.ts`
- `apps/web/src/services/skill-workspace.test.ts`
- `apps/web/src/services/sync-media.test.ts`
- `apps/desktop/src/renderer/components/settings/DataSettings.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/services/app-background.ts`
- `apps/desktop/src/renderer/services/webdav-save-sync.ts`
- `apps/desktop/src/renderer/stores/settings.store.ts`
- `apps/desktop/src/renderer/stores/prompt.store.ts`
- `apps/desktop/src/renderer/stores/folder.store.ts`
- `apps/desktop/src/renderer/stores/rules.store.ts`
- `apps/desktop/src/renderer/stores/skill.store.ts`
- `apps/desktop/src/renderer/components/skill/SkillFileEditor.tsx`
- `apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx`
- `apps/desktop/src/renderer/components/skill/SkillVersionHistoryModal.tsx`
- `apps/desktop/src/renderer/components/skill/detail-utils.ts`
- `apps/desktop/src/renderer/components/prompt/VersionHistoryModal.tsx`
- `apps/desktop/src/renderer/i18n/locales/*.json`
- `apps/desktop/tests/unit/components/data-settings.test.tsx`
- `apps/desktop/tests/unit/components/settings-page.test.tsx`
- `apps/desktop/tests/unit/services/app-background.test.ts`
- `apps/desktop/tests/unit/services/webdav-save-sync.test.ts`
- `apps/desktop/tests/unit/stores/prompt-save-sync.test.ts`
- `apps/desktop/tests/unit/stores/folder-save-sync.test.ts`
- `apps/desktop/src/renderer/services/database-backup.ts`
- `apps/desktop/src/renderer/services/self-hosted-sync.ts`
- `apps/desktop/src/main/ipc/mcp.ipc.ts`
- `apps/desktop/src/main/ipc/plugin.ipc.ts`
- `apps/desktop/src/preload/api/mcp.ts`
- `apps/desktop/src/preload/api/plugin.ts`
- `packages/core/src/plugin-library.ts`
- `packages/shared/types/sync.ts`
- `packages/shared/types/plugin.ts`
- `apps/desktop/tests/unit/services/database-backup.test.ts`
- `apps/desktop/tests/unit/services/self-hosted-sync.test.ts`

## Tradeoffs

- Embedding a full snapshot inside selective ZIP exports increases ZIP size when media is included, but it restores the important invariant that the embedded JSON is directly importable.
- Reusing one parser reduces drift, but some route-specific error messages become slightly less bespoke.
