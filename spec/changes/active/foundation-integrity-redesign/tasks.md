# Implementation and acceptance

No production task below is marked complete. Requirements are maintained only
in `specs/foundation/spec.md`; design details are maintained in `design.md`.

- [ ] `T-FOUNDATION-001`: Validate the cross-platform root owner/IPC adapter; route Desktop and CLI through one host. `TEST-FOUNDATION-001`: two-process acquisition, live/unknown owner, crash, peer permissions, root aliases, protocol mismatch, stop/drain.
- [ ] `T-FOUNDATION-002`: Replace independent publication/compensation with one command commit boundary. `TEST-FOUNDATION-002`: audit A01/A02/A11, interruption at every stage, uncertain commit/response, receipt retry and expiry, cleanup after commit, outer-operation atomicity.
- [ ] `T-FOUNDATION-003`: Close DB creation/version gaps and migrate structured data into authoritative SQLite. `TEST-FOUNDATION-003`: audit A10, real SQLite constraints, version deletion/rollback, business data preservation and reopen without canonical reconstruction.
- [ ] `T-FOUNDATION-004`: Introduce readiness capability and revision invalidation. `TEST-FOUNDATION-004`: audit A06, late responses, external CLI edits, restore refresh, blocked rebuild, no empty-default writes.
- [ ] `T-FOUNDATION-005`: Implement immutable backup then baseline/revision sync with deletion records. `TEST-FOUNDATION-005`: audit A04/A05/A07, failed HEAD write, simultaneous writers, unchanged/encrypted payloads, actual S3/WebDAV conditional behavior, offline devices, pin/GC and restore drill.
- [ ] `T-FOUNDATION-006`: Move Worker online mutations to tenant-scoped record operations; harden import. `TEST-FOUNDATION-006`: audit A08/A09, real D1 stale writes and batches, malformed/future/empty import, tenant FKs, duplicate request identity, snapshot conversion rollback.
- [ ] `T-FOUNDATION-007`: Persist job attempts and separate asset save from deployment. `TEST-FOUNDATION-007`: late Provider result, cancellation/retry/restart, receipt reconciliation, external target drift, bounded workers and resource cleanup.
- [ ] `T-FOUNDATION-008`: Deliver gated migration and remove obsolete writers. `TEST-FOUNDATION-008`: audit A03, 1k/10k interaction budgets, historical fixtures, two starts, old-client isolation, low disk, Windows rename/flush failures, complete release harness and changed-condition coverage.

Sequence: follow the current four batches in design.md: documentation, renderer
and readiness, domain data conversion with runtime removal, then integration.
The historical file-first batches below are evidence, not the target model. Implementation and verification occur in
complete batches per project FLOW rules. A new cross-boundary decision stops
the affected batch for review rather than being delegated implicitly.

## Batch 1 checkpoint

The integrity, cache and backup publication batch is implemented and focused tests pass. See implementation.md and verification-summary.json for exact scopes and limits. The eight main tasks above remain unchecked because none of their complete redesign/release acceptance sets is finished; user authorization to continue implementation is already recorded and does not need to be requested again.

## Catalog startup integration batch

- [x] Write Core startup/reconciliation regression tests before implementation.
- [x] Extract the shared reconciler, preserve Desktop policy, and integrate Core/CLI startup before writable DB initialization.
- [x] Verify real storage round trips, rollback/cleanup, safety guards and affected Desktop/CLI contracts in one converged batch.
- [x] Record coverage, limitations and stable startup behavior.

- [x] Broader Core/CLI/Desktop quick profile recorded: 17/18 checks pass; pre-existing missing spec-init script blocks governance.
- [x] Measured current/rebuilt startup after quick: 1,365.9 / 1,437.7 ms on 1,000 one-KiB Prompts; 6,416 KiB cumulative maxRSS increase. Full performance acceptance remains open.

## 0.6.0 client baseline preparation

Authority: [client baseline requirements](specs/foundation/spec.md#client-migration-baseline-060).
Evidence and fixture gaps: [migration inventory](design.md#client-060-migration-inventory).

- [x] Confirm 0.6.0 as the target baseline and distinguish it from published beta profiles.
- [x] Inventory local tagged schema sources, remote release status, existing migration entrypoints and fixture gaps (2026-09-15; source inspection only).
- [x] Regenerate exact v0.5.9/beta.1/beta.2 Core profiles in isolated roots and verify direct current-Core upgrade, edits, two database reopens, pre-commit failure preservation and retry (2026-10-14; six cases across two runs). Desktop source modes, sequential upgrades and the target authority conversion remain open.
- [ ] Freeze the release commit and complete target format/schema manifest; resolve source profiles against historical initializer behavior and real generated fixtures.
- [ ] Implement one-time baseline adoption and ordered executable migrations while preserving issued history and reusing recovery facilities.
- [ ] Verify normal old-profile upgrade/read/edit/reopen first, then skipped releases, repeated starts, malformed states and crash/restore boundaries; retire obsolete runtime writers after convergence.

Documentation verification (2026-09-15): the four touched documents passed local
link/anchor and whitespace checks; this change passed the existing traceability
validator. No application code, live profiles or migration tests were changed
or executed in this preparation batch.

## Client storage ownership inventory

- [x] Verify SQLite/file publication crash recovery with schema v5 receipts: SQL and
  receipt commit together, startup resolves prepared journals from that receipt,
  and missing/unreadable databases retain recovery material. Covers existing Prompt,
  Rule history and Agent upgrade callers before further Rule authority conversion.
  Full Core: 95 files / 955 cases; Desktop: 84 cases plus the one timed-out ZIP case
  passing alone with its unchanged deadline; Web: 22; CLI: 10. A later SQL-only
  follow-up recovery case is verified in the focused suite. Overall release remains open.

See [the field/table inventory](storage-inventory.md) for current sources,
owners, target structures and migration actions. It implements the existing
FR-FOUNDATION-003 boundary rather than introducing another data authority.

- [x] Enumerate all current client logical tables and columns, including migration records and FTS, plus associated canonical/config/secret storage (2026-09-15 source inspection).
- [x] Trace settings, annotations, restore, generation and read-time migration paths; distinguish canonical aliases and legitimate projection writers from boundary gaps.
- [ ] Preserve mixed-purpose durable fields in SQLite under the selected model; remove the former task to create canonical annotation files. Verify reopen/restore before retiring old storage.
- [ ] Execute the minimal repair/upgrade batch from the inventory using existing facilities; compare fresh and upgraded constraints and functional behavior. Broad repository/host redesign is not a prerequisite for baseline adoption.

No production schema, user database or application source was changed in this
inventory batch. Historical fixture generation and runtime acceptance remain
part of the existing baseline implementation tasks.

Inventory verification: all 26 logical table names and 282 column names match
the current schema/history declarations, and every entry has an owner, target
and migration action. Four affected documents passed local link/anchor and
whitespace checks; the existing change traceability validator passed. These are
documentation checks, not evidence that data migration or application behavior
passes.

## Overall data model simplification

The latest FR-FOUNDATION-003 clarification reopens the overall data design,
including the previously assumed file-first authority. See
[the model assessment](design.md#整体数据模型简化评估).

- [x] Correct the scope and identify redundant persistent representations in Skill, Generation, settings and catalog recovery.
- [x] Select SQLite for structured records/settings and the filesystem for actual files; exclude renderer business persistence and a parallel canonical JSON database (2026-09-15).
- [ ] Replace the earlier target mapping with the selected simpler model, then implement and verify its data-preserving transition. Migration-runner simplification alone does not complete this task.

## Migration versus runtime compatibility

The client baseline requirement now explicitly separates historical-data
conversion from current business implementation. Migration and removal of old
runtime branches form one delivery, not a migration followed by an indefinite
compatibility period.

- [ ] Map every historical field/path/storage-mode branch to a verified data conversion or remove it when no supported historical input needs it.
- [ ] Route startup and historical restore/import through migration, then remove old runtime readers/writers and read-time fallback; retain ordered historical migration steps only.
- [ ] Verify old data upgrades into the same normal CRUD/search/reopen path as a fresh install; failed migration never opens an old-mode or empty writable workspace.


## Runtime compatibility audit

Findings and required conversions are maintained in
[the business-path audit](storage-inventory.md#正常业务路径兼容审查2026-09-15).

- [x] Trace BC01–BC08 through actual normal entrypoints and distinguish historical conversion from supported external formats.
- [x] Reproduce BC01 with the real helper and isolated filesystem: two normal controls pass; distinct existing data fails preservation (exit 1). Temporary files removed; full service/GUI acceptance remains pending.
- [x] Repair BC01 Plugin read-time deletion through shared Core/Desktop startup migration; preserve unique entries, package bytes and history, journal source retirement, and verify rollback, retry and repeated startup (27 focused cases). Signed ARM64 DMG native UI and two cold reopens pass for coexisting sources; full historical stable-upgrade coverage remains separate.
- [x] Move BC07 historical Rule conversion to explicit bootstrap; preserve existing/current/history data, atomically retire raw sources with recovery copies and SQLite completion, and verify 32 migration cases plus real CLI/Desktop entrypoints. Signed ARM64 native editing, history and full backup/restore with production automatic relaunch pass; broader authority conversion remains open.
- [x] Reject a missing settings bridge and malformed settings response before renderer state/default writes; nine new loader cases and 73 existing settings/readiness cases pass. Full readiness and native error-screen acceptance remain separate.
- [x] Reject malformed settings/source/recovery replacement IPC inputs without converting them to empty replacements; explicit clears remain supported. Real persistence and reopen pass in 36 new cases, alongside 15 existing settings cases. No storage-authority conversion or native UI acceptance is implied.
- [x] Move Agent Provider profiles and mappings to SQLite-only normal CRUD, migrate and retire historical bundles with conflict/rollback/retry coverage, preserve SQL during catalog maintenance, and export public portable bundles from SQL. Ten migration cases, Desktop runtime and repair checks, and seven real ZIP restore cases pass; the broader Core suite is covered by the full run plus corrected fixture rerun. Other domains, causal sync and full release acceptance remain open.
- [x] Remove the canonical Prompt mutation coordinator; adopt Prompt/Folder/version/relation/output-format graphs into SQLite with media and recovery copies, preserve SQL during catalog maintenance, and test conflict, rollback, deletion and repeated startup. Core full run (895 cases), targeted migration/startup/IPC checks and seven real ZIP restore cases pass. Plugin path migration now works after Prompt catalog retirement. Legacy Markdown startup conversion and complete release acceptance remain open.
- [x] Replace Core/Desktop Prompt Markdown startup merging with one-time SQL conversion, byte-preserving recovery and conflict/rollback/reopen checks; remove automatic Markdown writes and keep explicit exports in cache. Fourteen migration cases, real Core/Desktop startups, full Core 911-case run, Desktop typechecks and real ZIP/public workflow checks pass. Web Markdown and full release acceptance remain open.
- [x] Convert Web Prompt Markdown through the shared journal with explicit tenant-preserving historical parsing; keep normal CRUD in SQLite and explicit exports in cache. Twenty-two Core migration cases, three Desktop startup cases and all 466 Web cases pass; typechecks, strict scoped lint and Web server build pass. This does not complete other domain conversions or release acceptance.
- [x] Preserve Rule history during metadata upsert by replacing destructive SQL REPLACE with in-place conflict updates. Four new disk/reopen and failure cases, 41 existing Core cases and 29 Desktop workspace cases pass; restoring the old SQL in an isolated copy fails three regression assertions. This does not complete Rule storage conversion.
- [x] Preserve Prompt graphs, Folder descendants and Skill versions on direct stable-ID import; reject secondary Skill identity collisions without deleting either record. Five new Core cases, one authenticated Web reopen flow and affected Core/Web/Desktop regressions pass, including real ZIP restore. Isolated old SQL fails four preservation assertions. Full domain conversion and causal sync remain open.
- [x] Reject conflicting Prompt/Skill version imports instead of silently ignoring them; exact retries return stored snapshots and Web conflicts return 409. Fourteen new Core cases, full Core 942 cases, full Web 468 cases, 97 Desktop DB/ZIP cases and 10 affected CLI cases pass. An isolated old implementation fails 11 new cases; remaining Foundation integration and release acceptance are still open.
- [x] Move Core/Desktop/CLI Rules metadata, bindings and history order to SQLite, preserving actual files through receipt publication. Startup conversion, missing-file errors, detached batch import, deleted history, long scoped filenames and real ZIP/two-start recovery pass; exact evidence is recorded in implementation and `output/rule-sqlite-20261015/summary.json`. Web Rule conversion and complete Foundation acceptance remain open.
- [x] Convert self-hosted Web Rules to tenant-scoped SQLite metadata and actual body/history files. Schema v6 preserves existing local Rules; old Web files migrate once with recovery copies, all history and owner validation. Authenticated same-ID tenant isolation, late import failure, independent process reopen, Core/Desktop/CLI regression and schema scale checks pass; see implementation for exact full-suite versus corrected-fixture evidence. Other domains and full release acceptance remain open.
- [ ] Deliver the BC01–BC03 preservation/upgrade-readiness fixes with regression coverage, without retaining an old business backend.
- [ ] Move BC04–BC08 historical field/path conversion into the upgrade boundary and remove runtime branches in the same verified delivery.
- [ ] Replace tests that codify legacy CRUD or destructive read-time cleanup with normal current functionality and data-preservation acceptance.

## Migration-only implementation (2026-09-24)

- [x] Replace conflicting file-first design and align current requirements with the single business implementation.
- [x] Remove renderer IndexedDB CRUD and graph backup/restore fallbacks; isolate historical conversion and propagate startup errors. Focused evidence is recorded in implementation.md; complete native startup acceptance remains open.
- [ ] Convert Core domain/configuration/path sources through ordered migrations; remove corresponding authority modes and read-time conversion together.
- [ ] Verify full historical upgrade, restore, current functionality and repeated startup before baseline release.
- [ ] Commit and push verified logical batches without unrelated worktree changes.
- [x] Retire Web Settings JSON mirrors and read-side writes; convert historical per-user files once with private exact-byte recovery, SQL precedence, journal rollback and ledger. Tenant HTTP/readback/reopen and migration failures pass. Correct default-only export baseline without breaking WebDAV pulls; final 22 affected sync/import tests, types/lint/build pass. Full-run and corrected-check evidence is recorded in implementation; Desktop Settings and release acceptance remain open.

- [x] Move renderer marketplace sources, recovery paths and self-hosted device identity to SQLite, with explicit DB binding, byte-preserving legacy migration, conflict detection, rollback and no normal JSON writers. Final Core 28 cases, affected Desktop 61 cases and 16 corrected ZIP/privacy/Skill cases pass; source/test types, scoped lint and Desktop build pass. Exact initial failures and unaffected prior checks are recorded in implementation. Application/AI/sync settings and full release acceptance remain open.
- [x] Move shared application, AI and sync settings to SQLite with a device-encrypted credential vault; retire historical JSON writers and keep AI backup repair migration-only. Settings migration, real IPC/CLI persistence, nine portable ZIP recovery cases, types, scoped lint and builds pass at recorded revisions. The final built CLI fresh-profile smoke passed. Native keyring and complete release acceptance remain open; see implementation.md and output/settings-sqlite-20261015.
- [x] Keep session sources, annotations and conversation metadata in their existing authoritative SQL tables; remove the obsolete canonical-file target. Two new disk/maintenance workflows, 59 related Core cases and 40 Desktop DB/scan cases pass, along with types and scoped lint. An isolated omission of session preservation fails the new regression. Full portable/GUI and remote-sync acceptance remain separate.
- [x] Move Core/Desktop/CLI Skill metadata and source bindings to SQLite with one actual managed package. Historical upgrade, complete binary packages, recovery/rollback, explicit restore, missing-file reads and deletion are verified. Nine portable ZIP cases, six historical upgrade cases and focused CLI/Core checks passed; full CLI had 163/165 pass before the two affected checks were corrected and passed. Exact command evidence and the restored test-isolation incident are recorded in implementation and `output/skill-sqlite-20261015/`. Skill history payload conversion, Web mirrors, historical identity conflict resolution and complete release acceptance remain open.

- [x] Retire Web Skill metadata/version JSON mirrors, migrate the historical tree with recovery, publish affected packages with SQL, and enforce stable-ID/owner selection during restore. Full Web 484/486 passed before two obsolete name-path assertions were corrected; their 11 focused cases, four migration cases, 15 Core package cases, types, scoped lint and Web production build pass. Current Skill/history SQL payload retirement and full Foundation/release acceptance remain open.

## Generation SQLite ownership batch

- [x] Move complete Generation metadata to schema v7 SQLite records and keep actual image files under the existing asset root.
- [x] Verify old-row migration, failed publication rollback/retry, active-list behavior, full metadata reopen, portable ZIP restore and repeated startup.
- [x] Measure 5,000 batches / 10,000 slots without image loading and run affected type, lint and production build checks; record aggregate failures and focused corrections in implementation.md.

## Persistent causal sync state batch

- [x] Persist destination-local common baselines and pending publication identities in SQLite with ordered migration and maintenance preservation.
- [x] Connect the pending identity to conditional HEAD publication and verify lost responses, conflicts, reopen, late SQL failure and local-edit fences.
- [x] Run the full Core suite (111 files / 1,042 cases), 26 Desktop migration/checkpoint cases, strict/Core and Desktop types, scoped lint and Desktop build.
- [x] Join file application and baseline advancement through the existing SQLite receipt publisher, with pre-replacement inventory checks; eight new binary/SQLite cases, full Core 1,050 cases and 15 Desktop regressions pass.
- [ ] Verify actual deployed WebDAV/S3 conditional publication; complete inventories, file write sets and automatic entrypoints are implemented and covered by the controlled acceptance below.
- [x] Add the Core orchestration and Prompt/Skill/Rule/Generation/MCP domain adapters, including whole-package conflicts, unavailable credential references, offline completion and multi-domain rollback. Final affected 23 cases and scoped static checks pass; six historical upgrade/retry cases also pass. Plugin/configuration, actual automatic entrypoint, resolution UI and real-provider/release acceptance remain open; see implementation.md.
- [x] Connect all nine portable desktop domain owners, typed main/preload IPC and automatic WebDAV/S3 startup/interval/save entrypoints; add explicit token-bound baseline/conflict review, retained recovery, encryption and no-op preservation. Controlled HTTP/SDK integration and isolated built Electron baseline/reopen acceptance pass; exact evidence is recorded in implementation.md.
- [ ] Complete real-provider conditional publication and signed/notarized macOS/Windows upgrade acceptance; controlled protocol fixtures do not satisfy these gates.

- [x] Run the frozen repaired candidate through all 40 release checks (2026-10-16,
  1,442.1 s), including full Core/CLI/Desktop/Web/Worker/Mobile suites and isolated
  built Electron smoke. All passed; 2,657 source/test/config hashes were unchanged.
  This does not close real-provider, native-package or remaining Foundation gates.


## Skill current and historical file payload batch

- [x] Move current/history payloads out of live SQL through the versioned shared file owner while preserving relational identities and complete binary packages.
- [x] Verify populated old-data upgrade, pre-commit file/SQL rollback, committed-receipt recovery, retry, linked-source preservation and two reopens.
- [x] Connect version CRUD/rollback, causal sync, Web backup, portable restore and catalog reconciliation; keep historical packages out of discovery.
- [x] Run affected Core/Web/Desktop/CLI regression and static/build checks; record diagnostic failures and corrected reruns in implementation.md. The earlier release gate does not cover this subsequent candidate change.
- [x] Complete the frozen 40-check release follow-up after repairing Desktop initialization and updating historical startup/package fixtures: run 4 passes 40/40 in 1,543.2 s with 2,612 selected source/test/config hashes unchanged. Earlier failed runs remain diagnostic evidence; deployed-provider and native platform acceptance remain separate.

## Existing-profile native startup repair

- [x] Preserve colliding historical Skill identities and packages with explicit detached source bindings; preserve metadata-only Plugins with obsolete duplicate locators; archive orphan Prompt history without resurrecting parents.
- [x] Verify populated-copy migration, rollback/reopen regressions, actual-profile native page loading and byte-preserving recovery. The normal development client reaches `startup:window_ready`; exact evidence and the isolated-copy credential limitation are recorded in implementation.md.
- [x] Repeat the full release gate for the startup-repaired 0.6.0 candidate: 40/40 checks pass in 1,655.7 seconds with all 2,675 selected source hashes unchanged. Cross-platform packaging and public promotion remain separate.

## 0.6.0 Draft preparation

- [x] Align shipped version identities, multilingual development labels and unreleased notes; preserve published stable links and website metadata.
- [x] Prevent version-tag creation from automatically publishing GHCR images before the GitHub Release is public.
- [x] Complete fresh frozen release verification for the startup-repaired 0.6.0 candidate: the repaired rerun passes all 40 checks; diagnostic failures and focused checks remain recorded.
- [x] Create the v0.6.0 tag and GitHub Draft at commit 46c4d1ff; isDraft=true and isPrerelease=false are confirmed.
- [x] Repair Linux CI preparation failures: workflow 38878434851 passes the complete 40-check gate, including all nine built Electron cases.
- [ ] Complete five packaging jobs and verify uploaded artifacts while retaining GitHub Draft status and the existing tag. macOS notarization is blocked by Apple HTTP 403 until the Account Holder handles the missing/expired agreement.
