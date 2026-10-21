# Legacy Upgrade Recovery Audit Implementation

## Product

Shared

## Status

in progress. Historical path, browser-storage, portable JSON and upgrade-snapshot fixtures remain open.

## Completed Evidence Work

- Correlated #89 with the v0.4.7 to v0.4.8 Windows runtime-path change and the
  reporter's install-directory to roaming-directory observation.
- Separated #97 into portable JSON backup import and automatic upgrade-snapshot
  restore boundaries.
- Confirmed that both v0.5.1 and v0.5.2 portable formats include Prompt
  `versions`, while current `PromptDb.getVersions` requests the complete ordered
  chain.
- Mapped current ownership to `packages/core`, `packages/db`, shared contracts,
  and desktop main/renderer boundaries without introducing a competing recovery
  framework.
- Converted the next phase into fixture-first tasks with explicit safety,
  rollback, restart, and performance gates.

## 2026-08-11 Database Fixture Progress

- Added deterministic builders anchored to the exact commits tagged `v0.4.7`,
  `v0.4.8`, `v0.5.1`, and `v0.5.2`; no user data or binary database is committed.
- Each generated database contains a four-version Prompt, one Folder, one Skill
  version, and the legacy migration markers emitted by that release profile.
- Current initialization preserves all rows, corrects Prompt `current_version`,
  commits numeric/checksummed adoption, creates one managed safety point, passes
  `quick_check`, and reopens without creating a duplicate point.

## Verification

- Repository source/tag audit: completed; facts recorded in `evidence.md`.
- Historical database fixture tests: 4 passed for `v0.4.7`, `v0.4.8`, `v0.5.1`,
  and `v0.5.2`, including row preservation, ordered Prompt history, numeric and
  checksummed adoption, one managed safety point, `quick_check`, and reopen.
- Combined Desktop storage/recovery matrix: 81 tests passed. CLI concurrency
  remained green with 21 tests and self-hosted Web bootstrap passed 1 test.
- `packages/db` and `packages/core` TypeScript checks passed. The Desktop-wide
  check is currently blocked by unrelated concurrent Agent activation test API
  changes.
- `pnpm spec:index:check`: passed.
- `pnpm spec:test`: passed, including governance, inventory, single-source, and
  traceability checks for 22 enforced changes.
- `git diff --check`: passed.

## 2026-08-12 Empty Prompt Version-Chain Repair

- Reproduced desktop startup rejection when historical Prompt rows had no
  `prompt_versions` records after `fix_prompt_current_version_v1` had already
  been marked complete.
- Added the idempotent `repair_empty_prompt_version_chain_v1` database migration.
  It synthesizes version 1 from current Prompt content and aligns
  `current_version` to the highest positive stored version without weakening the
  canonical resource schema.
- Added a tagged historical-database regression covering both a version-0 Prompt
  and a version-1 Prompt with empty version chains, canonical graph validation,
  content preservation, and reopen idempotency.
- Focused historical fixture verification passed: 5 tests.
- Related canonical rebuild and startup verification passed: 10 tests.
- A copied production database with 127 Prompts passed the migration and full
  canonical graph validation. Seven missing initial versions were recovered;
  no Prompt remained at a non-positive counter or referenced a missing current
  version.
- The repository package-manager wrapper could not start because its remote
  package-manager signature check was unavailable. Verification used the
  repository-installed Vitest binary; no package-manager metadata was changed.

### Startup publication follow-up

- Moved source-database preparation ahead of canonical projection while keeping
  the renderer migration, existing-authority, and source-file safety gates in
  front of it. A migration failure now blocks publication.
- Reproduced the next strict-validation failure against the live data: nine
  built-in Rule platform discovery rows were `target-missing` placeholders with
  version zero and no content or history.
- Kept the Rule resource schema strict and changed only projector eligibility:
  pure empty placeholders are not canonical resources, while target-missing
  Rules with durable content or history remain validated and publishable.
- Focused canonical projector, startup, historical fixture, and canonical
  rebuild verification passed: 4 files, 21 tests.

### Shared-root coexistence follow-up

- Reproduced a second-cold-start Prompt graph rejection caused by the legacy
  `.versions/<prompt-id>/<version>.md` workspace living beside canonical
  resources. The graph reader now excludes only an exact, real `.versions`
  directory and still rejects a file or symlink at that path.
- Reproduced MCP library startup errors caused by the independently managed
  `data/mcp/market-sources.json` registry. Canonical MCP enumeration now
  excludes only that exact regular file and still rejects a directory or
  symlink substitution.
- Added focused positive and fail-closed regressions for both coexistence
  boundaries.
- Reproduced a later second-cold-start inventory mismatch after Agent appearance
  seeded its bundled Codex theme. Prompt inventory now excludes only the exact,
  real `agent-appearance` directory and rejects a file or symlink substitution.
- Concurrent Agent appearance requests now coalesce bundled-theme seeding by
  resolved theme directory across service instances. A failed seed is removed
  from the in-flight map so a later request can retry.
- Final focused Desktop and Core regression suites pass 58 tests. Desktop and
  Core TypeScript checks pass, and the Desktop production Vite build completes.
- Two consecutive real cold starts against the current user database completed
  without a canonical startup error. The exact development sessions were then
  stopped and port 5173 was released.
- Remaining non-blocking diagnostics are broken external Skill symlink warnings
  under the local Codex Skill directory. The Vite `fflate` static/dynamic import
  warning was removed by using the already-bundled static import for Skill ZIP
  export.

### Superseded MCP and Plugin metadata coexistence follow-up

- Reproduced the live failure after canonical authority publication with
  `data/mcp/library.json` and `data/plugins/library.json` plus
  `market-cache.json` remaining as regular compatibility files. MCP and Plugin
  bundle enumeration treated those files as resource directories and rejected
  both libraries before the store UI could load.
- MCP enumeration now excludes only exact regular `library.json` and
  `market-sources.json` entries. Plugin enumeration now excludes only exact
  regular `library.json`, `market-cache.json`, and `versions.json` entries.
  Same-name symlinks or directories and all other undeclared root files still
  fail closed.
- Production service reads do not merely hide populated compatibility files.
  When no canonical records exist, MCP and Plugin libraries are normalized and
  published through their existing journaled bundle writers, then the old
  library/version metadata is removed after verification. Existing canonical
  records win over stale files. MCP secrets continue through the device-bound
  secret store and are absent from bundle JSON.
- Focused regressions cover the observed multi-file layouts, each exact type
  substitution, symlink substitution, unknown root files, one-time populated
  migration, empty cleanup, canonical precedence, Plugin history presence and
  absence, and MCP secret extraction.
- Canonical MCP, Plugin, and complete storage-shadow verification passed: 3
  files, 30 tests. `@prompthub/core` TypeScript checking and the Desktop
  production Vite build passed. The build retained only the existing non-blocking
  `fflate` static/dynamic import chunk warning.
- The compatibility migration orchestration now lives in a small shared module
  instead of expanding the legacy 1,900-line MCP service. Superseded files are
  all type-checked before any cleanup begins, so an unsafe companion file cannot
  leave a partially removed compatibility set.

### Downgrade and canonical Prompt graph diagnostic

- Startup logs show a successful canonical authority publication on 2026-08-12,
  followed by a 0.5.9 process on 2026-08-14 writing the legacy 127-Prompt
  Markdown workspace into the canonical `data/prompts` location. Four later
  0.6.0-beta.1 starts failed Prompt bootstrap because the catalog-declared
  `manifest.json` no longer exists.
- The authority marker is currently trusted without validating its declared
  Prompt graph, and the upgrade marker treats an older application version as a
  normal non-upgrade while rewriting the recorded version downward. These two
  behaviors permit an older writer to damage a newer canonical layout.
- E2E launch helpers correctly force a temporary user-data directory. The live
  layout was not caused by the current E2E launcher.
- No inspected upgrade safety point contains the missing canonical Prompt
  bundle. The current catalog declares one Prompt with 46 versions, while the
  SQLite catalog contains 127 different Prompts and does not contain that ID.
  Automatically rebuilding either side would therefore choose a source of truth
  and may discard user data; no live files were modified during this audit.
- A follow-up must block older writers before initialization and present explicit
  recovery candidates when an authority marker exists but the canonical graph
  is invalid. Recovery must not silently rebuild from SQLite or legacy Markdown.

### Invalid authority and null device identity follow-up

- Existing canonical authority is now validated against the complete Prompt
  catalog before startup reports `already-canonical`. A missing declared file
  produces `recovery-required`, and desktop startup skips Prompt workspace
  synchronization instead of repeatedly attempting DB-to-graph publication.
- The gate does not rebuild or modify the divergent canonical, SQLite, or legacy
  workspace candidates. Explicit candidate selection remains pending.
- Canonical MCP compatibility migration now mirrors Plugin migration when the
  renderer device document contains a null pre-sync identity: it derives a
  deterministic storage-root identity and still rejects malformed non-null
  identities.
- Added regressions for the observed missing Prompt manifest and null renderer
  device identity paths. The focused canonical MCP suite passed 13 tests, the
  combined local Agent/MCP/renderer identity suites passed 33 tests, and the
  canonical startup suite passed 8 tests. Core and Desktop TypeScript checks,
  targeted Desktop ESLint, Prettier, and file-size checks passed. The Desktop
  production build passed without the earlier `fflate` chunk warning.

### 2026-08-15 verification

- `pnpm verify:release:quick` passed 27 of 29 checks. All package typechecks,
  lints, Core/CLI/Desktop/Web/Mobile tests, and eight Desktop unit shards passed.
  The only failures were an MCP legacy-file growth guard and a stale generated
  change index.
- After extracting migration orchestration and regenerating the index,
  `pnpm lint:file-size`, `pnpm spec:test`, `@prompthub/core` typecheck, and the
  30 focused canonical MCP/Plugin/storage-shadow tests passed. Unaffected release
  checks were not repeated.

### 2026-08-17 explicit SQLite canonical recovery

- Read-only inspection confirmed that the current SQLite catalog remained
  intact with 127 Prompts, 137 Prompt versions, 12 Folders, 97 Skills, 10 Rules,
  and 18 Settings rows. No live user file was changed during diagnosis or
  verification.
- Invalid canonical Prompt authority now ignores an old recovery-dismiss marker
  and surfaces the current SQLite catalog only after link-safe regular-file,
  size, `quick_check`, table, and durable-content validation. The candidate
  preview includes Prompt, Folder, Skill, and Rule counts.
- The startup recovery dialog disables the destructive start-fresh path while
  the validated current catalog is available. Recovery still requires an
  explicit user selection and is never triggered by startup or record counts.
- Selecting the catalog closes SQLite, creates a unique closed-database
  checkpoint, projects and validates the complete canonical shadow, preserves
  the damaged root as a journaled recovery artifact, atomically publishes the
  replacement, and schedules a restart. A failed publication restores the
  pre-recovery root and reopens SQLite for another attempt.
- Recovery replaces an existing regular device MCP binding inside the isolated
  stage, while a directory, symlink, or unsafe device-config target remains
  fail-closed. The ordinary first-publication API still refuses to replace an
  existing authority marker.
- Focused verification passed: canonical authority publication/recovery and
  rollback, 8 tests; recovery orchestration, 3 tests; recovery candidate scan
  and preview, 11 tests; recovery dialog behavior, 7 tests. Desktop TypeScript,
  targeted ESLint, file-size, and spec traceability checks passed.
- Recovery was not executed against the live user root. The current divergent
  files remain preserved until the user explicitly selects the SQLite candidate
  in the updated application.

### Recovery retry follow-up

- Canonical MCP projection now accepts persisted binding ids such as
  `codex:global:/Users/.../.codex/config.toml`. These are opaque keys derived
  from an absolute target path, not filesystem resource names.
- Failed recovery now awaits database reopening and re-registers all
  database-bound IPC handlers against the replacement connection before the
  renderer receives the failure result.
- Regressions cover path-bearing binding ids, control-character rejection,
  awaited IPC rebinding, and combined recovery/reopen failure reporting.
- Verification passed: 18 focused Core canonical schema/shadow tests, 27
  focused Desktop checkpoint/recovery tests, the 8-test end-to-end authority
  suite with a path-derived binding id, Core and Desktop typechecks, targeted
  Desktop ESLint, Prettier, file-size checks, spec traceability, and the Desktop
  production build.

### 2026-08-18 recovery retry regression

- The live SQLite catalog passed `quick_check` and matched the inspected 0.6.0
  upgrade safety point for Prompt and Prompt-version rows. Startup entered
  recovery because the canonical catalog declared a missing Prompt manifest,
  not because SQLite was corrupt.
- The selected SQLite recovery failed before publication because its default
  MCP collector invoked the ordinary compatibility migration for a populated
  superseded library. That path requires a device-bound secret adapter, while
  recovery only provided the later extracted-secret persistence sink.
- Recovery now selects canonical or superseded MCP metadata without publishing
  into the damaged root. The superseded input is a regular-file-only, 16 MiB
  bounded read; checkpoint projection remains responsible for extracting and
  securely persisting credentials.
- The first manual reset expansion fixed `prompt:getAllMeta`, but a live retry
  then collided on nested `skill:scanPlatformSkills`. This disproved the manual
  channel-inventory approach because nested registration modules were outside
  its static audit. The replacement derives the reset set from handlers actually
  registered by `registerAllIPC` and rolls back partial attempts.
- Focused verification passed: 15 Core canonical MCP tests and 7 Desktop
  recovery/IPC tests. Core and Desktop typechecks, Desktop lint, Prettier,
  file-size, spec governance, and traceability checks passed. The changed
  release profile passed all 21 checks across governance, Core, CLI, Desktop's
  eight unit shards, and self-hosted Web in 564.5 seconds with concurrency 2.
  The Desktop production renderer, main, and preload build also passed.
- That verification record predates the later
  `skill:scanPlatformSkills` and missing-media failures and is retained only as
  history; it is not the acceptance record for the file-authoritative fix.
- Stable desktop recovery behavior was synchronized to
  `spec/knowledge/behavior/desktop.md`; the active change remains open for the
  separately scoped older-client refusal and legacy-workspace candidate.

### File-authoritative Prompt recovery

- The current `data/prompts` Markdown set is now the preferred candidate. A
  private consistent SQLite image is used only as a staging vehicle: Markdown
  replaces current Prompt rows, database-only Prompts are removed, and only
  same-id history at or below the file-declared current version is restored.
  Strict inspection does not move conflict files or write the source workspace.
- The live inventory contains 127 Markdown Prompts with the same id set as the
  127 current SQLite rows. SQLite contains 137 Prompt-version rows, so history
  is treated as supplemental rather than as current content authority.
- Three live Markdown Prompts reference one missing image. The identical image
  exists in one validated recovery artifact and four upgrade safety points;
  every inspected copy has SHA-256
  `26c6f3b59704594638070aa5530b94fe67df2a5de45e7bd1c472ee9ac9bdf3df`.
  Recovery resolves such media only from bounded validated roots and aborts on
  missing, symlinked, traversal, special-file, or digest-divergent sources.
- IPC rebinding now records every handler successfully registered through
  `ipcMain.handle`, including nested modules. A partial registration attempt
  removes its captured handlers before rethrowing; the next retry does not
  depend on a complete manual constant list.
- Final focused checks passed: 15 Core MCP recovery tests; 40 Desktop recovery,
  candidate, IPC, workspace, and media tests after rerunning the two initially
  exposed history-preservation failures; Desktop and Core typechecks; Desktop
  lint; Prettier; file-size; spec governance; and traceability.
- The changed release profile ran 29 checks with concurrency 2. Twenty-seven
  checks passed, including Desktop typecheck, lint, seven unit shards, Core,
  database, shared, CLI, mobile, and Web gates. Its initial file-size failure
  was fixed and the standalone file-size gate then passed. Desktop shard 7
  remained blocked by concurrent unrelated duplicate exports in
  `src/renderer/services/ai.ts`; that file is outside this change. No production
  build or live recovery publication was run from the resulting mixed working
  tree.

### 2026-08-18 final file-authority verification

An intermediate Prompt workspace run exposed these file-authoritative recovery
regressions:

- database-only Folder removal returned `null` instead of the expected absent
  record;
- strict replacement accepted a Prompt referencing a Folder absent from the
  file-owned set;
- strict parent/child Prompt import attempted the child before its parent and
  hit the foreign-key constraint.

Desktop TypeScript also exposed an unsafe result-union narrowing. The final
implementation added parent-first Folder and Prompt ordering, file-owned Folder
validation, database-only Folder cleanup, and discriminated result handling.

The dependency-order algorithms moved to `prompt-workspace-import-order.ts`,
reducing `prompt-workspace.ts` from 1,498 to 1,428 lines while preserving linear
`O(F + P)` graph traversal. Current verification passed all 22 Prompt workspace
tests. The broader focused Desktop run passed 77 tests, and the focused Core
storage run passed 64 tests after adding strict empty Rule-container handling,
orphan Skill-owner projection, and deterministic duplicate Agent-profile
projection.

A copy of the exact pre-repair live data tree was repaired in a temporary root.
The run completed in 11.144 seconds, produced 127 Prompts, 10 Folders, and 137
Prompt versions in both files and SQLite, preserved 18 settings rows, created a
recovery artifact, and returned `already-canonical` on the next startup check.
Temporary data was removed after verification.

The running development app reloaded the completed implementation and performed
the same journaled self-heal on the active development root. Startup recorded
`self-healed`, retained the prior tree under the recovery registry, initialized
127 Prompts and 10 Folders, and detected zero recovery candidates. No recovery
action was selected in the renderer.

### AI model file-authority recovery

- Renderer migration now preserves a populated file-owned AI provider/model
  inventory even when the renderer snapshot contains default-empty arrays.
- Completed beta migrations with zero canonical models and dangling model
  routes inspect only managed upgrade safety points and restore only a bounded
  regular config containing every routed model id. Publication reuses the
  encrypted renderer vault and atomic canonical replacement; intentional empty
  inventories remain untouched.
- The active development root was repaired to one provider, seven models, and
  four model routes. Both public config projections contain zero plaintext API
  keys; the encrypted vault contains nine secret references. A read-only SQLite
  audit found no `ai*` or `model*` setting keys, confirming that the database is
  not the configuration owner.
- `TEST-LEGACYREC-010` passed 19 Core migration tests and 47 Desktop recovery,
  persistence IPC, and model-service UI tests. The recovery service reached
  100% statement, branch, function, and line coverage. Core and Desktop
  typechecks, targeted Desktop lint, Prettier, file-size, traceability, and
  whitespace checks passed.
- The final 0.6.0 quick release profile passed all 29 gates in 475.9 seconds,
  including every Desktop test shard and the Core, CLI, shared, database,
  mobile, and Web surfaces.

### Managed Skill symlink migration repair

- Fourteen Codex Skill links were confirmed as PromptHub activation records
  whose stored targets use the removed legacy
  `data/skills/<name--hash>/repo` layout. Every corresponding Skill id has a
  complete current canonical workspace; the content was not deleted, but the
  downstream links were not rebound after migration.
- Startup now joins the bounded platform activation file to the current Skill
  id/name inventory, accepts only the exact legacy PromptHub target shape, and
  atomically renames a same-directory staged link over the superseded link.
  External dangling links, mismatched activation records, unsafe workspaces,
  non-link content, concurrent replacement, malformed or oversized state, and
  publication failure remain unchanged.
- The running development build exercised the production startup path and
  rebound all 14 affected Codex links. All 14 now target their id-based
  canonical workspaces, contain readable `SKILL.md` files, and report zero
  broken links.
- `TEST-LEGACYREC-011` passed eight filesystem reconciliation tests and two
  default startup-wiring tests. Both new critical modules reached 100%
  statement, branch, function, and line coverage. The broader Skill suite
  passed 376 tests across 14 files; Desktop typecheck, targeted lint, Prettier,
  file-size, traceability, and whitespace checks passed.
- The final 0.6.0 quick release profile passed all 29 gates in 484.4 seconds
  after the symlink migration repair.

### Mandatory recovery lockout repair

- Startup now carries the diagnosed recovery scope into a manually selected
  current SQLite recovery. `invalid-canonical-storage` can rebuild the complete
  authority even when its Prompt graph is valid, while the default recovery
  scope still rejects replacing a valid file authority.
- A startup recovery dialog that intentionally hides the destructive
  start-fresh action now exposes a separate continue action. It closes only the
  current prompt and does not rewrite or delete any recovery source; unresolved
  canonical invalidity is checked again on the next launch.
- Focused verification passed 24 tests across canonical authority publication,
  recovery orchestration, and renderer dialog behavior. Desktop TypeScript,
  targeted ESLint, Prettier, locale JSON parsing, file-size limits, and change
  traceability also passed. The Desktop renderer, main, and preload production
  build completed successfully.
- Targeted V8 coverage exercised every new decision outcome: default valid-file
  refusal, explicitly scoped canonical replacement, both startup-reason mapping
  arms, recovery failure, and both dismiss-persistence arms. The touched legacy
  files remain below whole-file 100% coverage: authority 87.77% statements /
  69.23% branches, recovery orchestration 93.70% / 95.23%, and dialog 87.84% /
  73.17%; the uncovered lines belong to pre-existing publication, source-type,
  preview, and start-fresh paths rather than this changed behavior.

### Mixed Prompt layout startup repair

- A normal development launch against the installed profile reproduced
  `invalid-canonical-prompt-graph`: the older writer had placed 127 Markdown
  Prompts beside 127 canonical Prompt bundles. The self-heal scanner rejected
  the first bundle's `manifest.json`, so startup showed mandatory recovery even
  though SQLite `quick_check` was `ok` and both sources reported 127 Prompts.
- The repair scanner now treats only top-level directories with regular
  non-symlink `manifest.json` and `prompt.json` files as superseded canonical
  bundles. Incomplete lookalikes remain rejected. Missing legacy media filenames
  may fall back only to the same Prompt id's fully validated bundle and immutable
  object, including manifest declaration, byte-size, and SHA-256 verification.
- Seven focused filesystem/SQLite tests passed, including mixed-layout repair,
  damaged-object refusal, duplicate-id refusal, rollback, catalog idempotency,
  and live-client lockout. Desktop TypeScript, targeted ESLint, production build,
  change traceability, and spec-index checks passed.
- A copy-on-write clone of the installed profile completed the full journaled
  repair without touching live data. The rebuilt canonical graph and SQLite both
  contained 127 Prompts, 10 folders, and 137 Prompt versions; the temporary
  profile and its generated recovery artifact were removed after verification.
- The repository-wide file-size gate remains blocked by the unrelated dirty
  `apps/desktop/src/main/index.ts` at 1,502 lines versus its 1,500-line preferred
  limit. Neither this repair nor its tests modify that file.

### Normal startup recovery UI removal

- Normal renderer startup no longer calls recovery candidate discovery or
  mounts `DataRecoveryDialog`. Versioned layout migration, validation, catalog
  reconciliation, and deterministic self-heal remain main-process startup work.
- The recovery browser and its source-selection safeguards remain available
  only from Data Settings for explicit user-directed recovery.
- A renderer orchestration regression asserts that `App.tsx` contains neither
  the startup recovery scan nor the recovery dialog boundary.
- Verification passed 29 focused renderer, Settings recovery, canonical
  startup, and mixed-layout self-heal tests; Desktop TypeScript, targeted
  ESLint, production renderer/main/preload build, traceability, spec index, and
  whitespace checks also passed. The repository-wide file-size gate remains
  blocked only by the unrelated dirty `apps/desktop/src/main/index.ts` at 1,502
  lines versus its 1,500-line preferred limit.

## Remaining Risk

Current recovery code and tests now prove the shared SQLite migration slice for
all four tagged schemas, including a four-version Prompt. They do not yet prove
the v0.4.7/v0.4.8 Windows path transition, a v0.5.1 portable backup, or a v0.5.2
upgrade-snapshot restore through the complete application path. Issues #89,
#97, and #98 remain open and must not be marked locally done from this evidence.
The file-authoritative path is covered with real SQLite and filesystem fixtures
and by the journaled startup publication above. Because 0.5.9 is
already distributed and contains no compatible gate, 0.6.0 cannot guarantee
that manually launching that binary against the newer root is write-free.
