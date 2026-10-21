# Design

> Completed change history. Current requirements: [owning topic](../../../knowledge/behavior/rules-workspace.md). Earlier proposals and designs below are retained as evidence, not current instructions.

<!-- traceability: enforced -->

## Current Boundary And Root Cause

Rules business data is owned by `userData/data/rules/`; SQLite is an index and
status cache. During project scanning, `buildDescriptor(meta)` computes
`exists` and a fresh sync status but does not write either result to `_rule.json`
or RuleDB. `listCachedRuleDescriptors()` then returns project DB records
unconditionally, and the renderer keeps every `project:` descriptor visible.

The result is a split truth: the live scan can know the target is missing while
the durable cache and UI still look normal.

The managed body and versions are the recoverable source after target loss.
Target disappearance changes deployment status; it does not prove that the
managed Rule should be destroyed.

## `DES-RULE193-001`: Persisted project reconciliation

Introduce a project-specific reconciliation helper in `packages/core`:

1. read one stored project meta record;
2. compute the target sync status once;
3. build the descriptor from that computed result;
4. when the status differs, atomically update `_rule.json` and refresh RuleDB;
5. when unchanged, perform no metadata or DB write.

`scanRuleDescriptors()` uses this helper for project records. The cached list
continues to use RuleDB, whose `target-missing` status now produces
`exists: false`.

The helper does not alter managed content, target content, or version files.
For `p` registered projects, scan complexity is `O(p)` filesystem checks and
`O(c)` metadata/DB writes for `c` changed statuses. Project scans remain
bounded by the registered meta directories rather than recursively walking
project roots.

## `DES-RULE193-002`: Visible missing state

The renderer keeps missing project records in the project group but treats
`syncStatus: "target-missing"` as an explicit state:

- missing-status badge and icon treatment;
- visible target path;
- no normal "synced" presentation;
- recovery/save action described as deploying the managed copy;
- cleanup selection available only for missing project records.

The renderer derives all of these states from the descriptor returned by Core.
It does not call filesystem APIs or infer existence from a path.

All new user-facing text uses the existing seven-locale i18n surface.

## `DES-RULE193-003`: Confirmation-gated cleanup

Cleanup reuses the existing project removal ownership boundary instead of
deleting paths in the renderer. A batch orchestration accepts project rule IDs,
deduplicates them, and re-resolves each current meta record immediately before
deletion.

For every requested ID:

- reject non-project and malformed IDs;
- skip a project whose target is currently present;
- remove only the PromptHub-managed project directory, managed version
  directory, and matching RuleDB row;
- never remove `projectRootPath` or `targetPath`.

Filesystem deletion across multiple records is not globally transactional.
The operation is idempotent and returns `removed`, `skipped`, and `failed`
identifiers. Successfully removed records stay removed; failures remain
visible and can be retried. The confirmation lists the number of records and
states that managed copies/history will be deleted.

## Test-First Design

The first red test uses the real temp filesystem and RuleDB:

1. create a project rule with a real `AGENTS.md`;
2. scan and confirm `synced`;
3. delete only the external target;
4. rescan;
5. create a fresh service and call cached list;
6. assert both report `target-missing`.

Required methods:

- black-box filesystem/DB reload behavior;
- white-box changed/unchanged status branches;
- boundary/security cleanup validation;
- failure/rollback for one injected managed-directory deletion failure;
- UI component/store behavior for missing state and partial cleanup;
- stress with many registered meta records and counted write operations;
- manual Windows verification or Windows CI fixture for drive-letter paths.

## Affected Areas

- Core Rules workspace reconciliation and optional batch cleanup API
- Shared Rules cleanup result contract and IPC/preload only if batch removal is
  exposed as one call
- Desktop Rules store and workspace presentation
- Seven locale resources
- RuleDB schema and filesystem layout remain unchanged

## Failure And Rollback

- External boundary: metadata/version managed files and RuleDB index.
- Partial scan failure: do not report a changed descriptor as persisted until
  metadata and DB refresh complete; surface the scan error.
- Partial cleanup failure: report per ID, preserve failed/unselected records,
  never touch external project files.
- Recovery/rollback: before explicit cleanup, managed body/version history can
  redeploy the target. Cleanup itself requires confirmation because it removes
  that managed recovery data.

## Analyze Result

- Requirement links: stable Rules docs already define `target-missing` and
  managed-copy recovery.
- Verification links: persistence, UI, security, failure, and performance
  risks map to `TEST-RULE193-*`.
- Blocking conflicts: none. Automatic deletion is rejected because current
  records have no trustworthy scanned-versus-manual provenance.
- Unresolved `[待确认]`: none.

## Traceability

| Requirement       | Design                               | Verification                           | Task                             |
| ----------------- | ------------------------------------ | -------------------------------------- | -------------------------------- |
| `FR-RULE193-001`  | `DES-RULE193-001`                    | `TEST-RULE193-001`                     | `T-RULE193-001`, `T-RULE193-002` |
| `FR-RULE193-002`  | `DES-RULE193-001`, `DES-RULE193-002` | `TEST-RULE193-002`, `TEST-RULE193-003` | `T-RULE193-002`, `T-RULE193-003` |
| `FR-RULE193-003`  | `DES-RULE193-003`                    | `TEST-RULE193-003`, `TEST-RULE193-004` | `T-RULE193-004`, `T-RULE193-005` |
| `NFR-RULE193-001` | `DES-RULE193-001`                    | `TEST-RULE193-005`                     | `T-RULE193-006`                  |
