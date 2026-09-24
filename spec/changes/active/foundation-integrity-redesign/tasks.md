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
- [ ] Freeze the release commit and complete target format/schema manifest; resolve source profiles against historical initializer behavior and real generated fixtures.
- [ ] Implement one-time baseline adoption and ordered executable migrations while preserving issued history and reusing recovery facilities.
- [ ] Verify normal old-profile upgrade/read/edit/reopen first, then skipped releases, repeated starts, malformed states and crash/restore boundaries; retire obsolete runtime writers after convergence.

Documentation verification (2026-09-15): the four touched documents passed local
link/anchor and whitespace checks; this change passed the existing traceability
validator. No application code, live profiles or migration tests were changed
or executed in this preparation batch.

## Client storage ownership inventory

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
- [ ] Deliver the BC01–BC03 preservation/upgrade-readiness fixes with regression coverage, without retaining an old business backend.
- [ ] Move BC04–BC08 historical field/path conversion into the upgrade boundary and remove runtime branches in the same verified delivery.
- [ ] Replace tests that codify legacy CRUD or destructive read-time cleanup with normal current functionality and data-preservation acceptance.

## Migration-only implementation (2026-09-24)

- [x] Replace conflicting file-first design and align current requirements with the single business implementation.
- [x] Remove renderer IndexedDB CRUD and graph backup/restore fallbacks; isolate historical conversion and propagate startup errors. Focused evidence is recorded in implementation.md; complete native startup acceptance remains open.
- [ ] Convert Core domain/configuration/path sources through ordered migrations; remove corresponding authority modes and read-time conversion together.
- [ ] Verify full historical upgrade, restore, current functionality and repeated startup before baseline release.
- [ ] Commit and push verified logical batches without unrelated worktree changes.
