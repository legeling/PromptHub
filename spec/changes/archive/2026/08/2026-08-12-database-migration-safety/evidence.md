# Data Storage And Database Migration Safety Evidence

## Runtime Roots And Layout

- `packages/core/src/runtime-paths.ts:93-213` resolves the database, Skills,
  Prompts, generations, generated images, and videos through separate helpers;
  several helpers independently choose a canonical or legacy path.
- `apps/desktop/src/main/runtime-paths.ts:97-217` duplicates much of the Core
  runtime-path surface and adds Desktop installation/custom-root behavior.
- `apps/web/src/runtime-paths.ts:51-75` defines a distinct server/multi-user
  physical layout. It is not the Desktop layout and should remain explicit.
- `apps/desktop/src/main/data-path.ts:8+` treats a broad list of directories as
  evidence of PromptHub data and writes the boot pointer without a documented
  write-flush-rename publication contract.
- `apps/desktop/src/main/index.ts:1260+` defines broad top-level migration items;
  `apps/desktop/src/main/index.ts:1396+` copies them directly during data-root
  switch/migrate/overwrite rather than publishing one verified staged root.
- `apps/desktop/src/main/index.ts:1161-1234` recursively collects export content
  and creates ZIP bytes with `zipSync`, making peak memory proportional to the
  collected archive.

## Safety Points, Recovery, And Restore

- `apps/desktop/src/main/services/upgrade-backup.ts:250-346` copies most of the
  user-data tree into a pre-upgrade directory and publishes a manifest, but the
  database image is still a file copy rather than a proven SQLite snapshot.
- `apps/desktop/src/main/services/upgrade-backup-restore.ts:97-107` restores
  top-level entries sequentially; current entries are removed/replaced before
  the complete restored root is published as one verified set.
- `apps/desktop/src/main/database/index.ts:447-528` copies a recovery database
  into place first, then merges other files. A later file failure cannot share a
  transaction with the earlier database replacement.
- `apps/desktop/src/renderer/services/database-backup.ts:858+` builds the logical
  backup through multiple domain calls without one cross-domain consistency
  barrier.
- `apps/desktop/src/renderer/services/database-backup.ts:966-1249` restores many
  domains in sequence, records failures while continuing, and deletes current
  Skills before recreating them.
- `apps/desktop/src/renderer/services/database-backup.ts:1262-1310` has export
  paths that begin with a broader `exportDatabase` result before narrowing a
  selected payload.

## Version History Versus Rollback Artifacts

- MCP target projection no longer creates adjacent
  `.prompthub-mcp-backup-*` files. The implementation now performs no-op
  detection, atomic publication, post-write verification, and exact in-process
  rollback from memory. Existing legacy sidecars remain recovery candidates and
  are not deleted automatically.
- `apps/desktop/src/main/services/agent-provider-runtime.ts:68` places Agent
  config rollback data in a root-level `agent-config-backups` tree, while
  `apps/web/src/services/agent-services.dependencies.ts:248` uses
  `backups/agent-config`; neither is the domain's version-history model.
- `packages/core/src/agent-management/agent-encrypted-config-backup.ts` encrypts
  native configuration rollback copies into one timestamp directory per write,
  but creation and retention remain separate from the global safety/recovery
  artifact lifecycle. Database snapshot rows retain `backup_ref` values without
  a coordinated file-retention or reference-cleanup contract.
- `apps/desktop/src/main/services/agent-model-config.ts` and
  `apps/desktop/src/main/services/agent-pi-model-writes.ts` create additional
  timestamped config copies for model mutations even though the same operation
  already keeps original bytes in memory for immediate rollback. These copies
  are not pruned and may contain native configuration material.
- `mcp-version-history-and-projection-safety` already defines MCP-managed
  history and ephemeral external-file rollback. This change does not create a
  competing MCP version store.

## Config And Secret Boundary

- `packages/core/src/ai-config.ts:90` names the active provider file
  `ai-models.json`; current writes can persist provider `apiKey` values in that
  config file.
- `apps/desktop/src/renderer/stores/settings.store.ts:121-151` persists the
  `prompthub-settings` Zustand store into LocalStorage.
- `apps/desktop/src/renderer/stores/settings/settings-persistence.ts:56-72`
  removes only `githubToken`; the remaining persisted settings type still owns
  WebDAV/S3 credentials, AI provider keys, and other sensitive connection state.
- `apps/desktop/src/main/ipc/settings.ipc.ts` stores general settings in SQLite
  while reading/writing AI configuration through `config/ai-models.json`.
  Renderer rehydration overlays and pushes portions of the same logical state,
  so settings currently have multiple authorities.
- `packages/core/src/agent-management/agent-secret-store.ts:7+` defines a
  separate `agent-secrets.json` store with atomic temporary-file publication.
- Desktop and self-hosted Web currently resolve Agent secret/config paths
  differently, so a blanket `config/` backup rule is not sufficient.
- Stable `spec/knowledge/structure/storage-architecture.md` still presents
  planned `settings.json`/`ai-providers.json`, a single `data/assets` media tree,
  and Electron browser storage as never migrated; current code and active
  generation storage do not fully match those statements.

## Renderer And Browser Persistence

- Zustand persists `prompthub-settings`, `ui-storage`, `prompt-store`,
  `agent-workbench`, `skill-store`, `mcp-store`, `plugin-store`, and table-view
  configuration into renderer LocalStorage. The latter view/filter keys are
  appropriate preferences, but settings and custom marketplace sources are not
  disposable caches today.
- `apps/desktop/src/renderer/components/prompt/VariableInputModal.tsx:80-91`
  stores per-Prompt variable history under `prompt_vars_<promptId>` without an
  explicit durable-data contract, capacity, or expiry policy.
- Agent quota results use `prompthub.agent-usage.<agentId>` with a cache layer;
  this is an appropriate renderer cache when it keeps finite TTL/capacity.
- Desktop manual recovery paths and Desktop/self-hosted Web device IDs are also
  stored in LocalStorage. They affect recovery and sync identity, so clearing
  browser data is not currently lossless.
- Clipboard self-signatures and renderer reload cooldown use SessionStorage and
  are correctly session-scoped.
- Legacy IndexedDB remains a one-time Prompt/Folder/Version migration and
  recovery source. Its completion marker lives in LocalStorage, so it cannot be
  treated as ordinary cache until import and retirement have converged.
- `apps/desktop/src/main/index.ts:1260-1269` includes `IndexedDB`,
  `Local Storage`, and `Session Storage` in data-root migration. This contradicts
  the stable statement that Electron browser storage is never migrated.
- `apps/desktop/src/renderer/services/database-backup.ts` exports selected
  renderer settings and custom store sources, confirming that current browser
  storage already participates in durable backup behavior.

## File And SQLite Authority

- `apps/desktop/src/main/services/prompt-workspace.ts:120-124` defines DB-only,
  workspace-only, and dual-populated bootstrap quadrants; the dual case imports
  newer workspace content and then exports the database. This is dual authority,
  not a one-way file-first catalog rebuild.
- `apps/desktop/src/main/services/prompt-workspace.ts:675-678` reconstructs
  imported Prompts with `usageCount: 0` and `lastAiResponse: null`.
- `packages/db/src/schema.ts:61-89` stores Prompt relations and output-format
  links in SQLite, while current Prompt workspace files do not encode them.
- `spec/changes/active/prompt-workspace-completion/design.md` plans
  `messages_json` columns in SQLite. A file-first cutover must first define how
  the same durable messages are represented in versioned Prompt bundles.
- Skills, Rules, MCP/Plugin libraries, generation manifests, and media already
  have stronger filesystem ownership than Prompts, but their SQLite metadata,
  version pointers, install state, and indexes still require an explicit
  rebuild/classification contract rather than a blanket database deletion.

## Current Shared SQLite Initializer

- `packages/db/src/init.ts:230-240` manually lists migrations used to decide
  currentness; it omits `agent_conversation_handoff_launch_v2`.
- `packages/db/src/init.ts:341-369` duplicates currentness across required
  tables, selected migration rows, and required columns.
- `packages/db/src/init.ts:396-404` creates a raw timestamped database copy.
- `packages/db/src/init.ts:417` returns a global singleton without confirming the
  requested path matches the initialized path.
- `packages/db/src/init.ts:425-435` performs integrity/backup work and creates
  current tables before the migration transaction.
- `packages/db/src/init.ts:501-548` can rename, rebuild, copy, and drop the
  handoff table in the omitted destructive migration.
- `packages/db/src/init.ts:739-804` makes filesystem backfill host-dependent and
  contains normal-return failure paths.
- `packages/db/src/init.ts:933-940` contains another normal-return failure path.
- `packages/db/src/init.ts:983-990` creates indexes after the transaction.
- `packages/db/src/adapter.ts:221-243` commits when a transaction callback
  returns normally and rolls back only when it throws.

## Product And Database Backup Layers

- `packages/db/src/init.ts` still creates adjacent timestamped
  `.backup-*` and `.integrity-backup-*` database copies. A failed migration can
  create a new pre-migration sibling on every retry because the schema remains
  old and the artifact has no stable operation identity or retention policy.
- `apps/desktop/src/main/database/index.ts:157-211` adds a one-off 0.5.3 raw copy,
  swallows backup failure, and injects the Desktop filesystem resolver.
- `apps/desktop/src/main/database/index.ts` also creates adjacent
  `.pre-recovery-*` database copies before recovery. These raw siblings are
  outside the bounded upgrade-snapshot manifest and cleanup lifecycle.
- `apps/web/src/database.ts:7-18` opens the same shared initializer without the
  Desktop resolver.
- `packages/core/src/database.ts:21-23` gives CLI the shared initializer without
  that resolver by default.
- `apps/desktop/src/main/services/upgrade-backup-startup.ts` creates a startup
  snapshot from a last-run application marker and rewrites the marker on
  downgrade/non-upgrade paths.
- `apps/desktop/src/main/updater.ts:851-877` creates another whole-data snapshot
  immediately before install.
- `apps/desktop/src/main/services/data-layout-migration.ts:749-824` can create a
  separate pre-layout snapshot and maintains its own retry marker.
- `apps/desktop/src/renderer/services/database.ts:1018+` maintains a separate
  legacy IndexedDB-to-main-process import marker and retry path.

## Existing Positive Boundaries To Preserve

- The adapter finalizes statements after operations, reducing unintended WASM
  VFS lock retention.
- Shared initialization uses a finite five-second `busy_timeout`.
- Existing integrity repair is allowlisted and rechecks the database.
- Whole-data snapshots reject symlink traversal, publish a manifest, clean
  partial snapshot directories, and retain at most five managed snapshots.
- Mobile already rejects a newer `PRAGMA user_version`; it remains a separate
  schema domain and provides a useful fixture pattern.
- Several JSON/file writers already use temp-write/rename; the target design
  standardizes that practice rather than introducing a new dependency.
