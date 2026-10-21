# Spec Delta: Missing Project Rule Reconciliation

> Completed change history. Current requirements: [owning topic](../../../../../knowledge/behavior/rules-workspace.md). Earlier proposals and designs below are retained as evidence, not current instructions.

## Added Requirements

### `FR-RULE193-001`: Rescan persists target disappearance

PromptHub MUST reconcile each registered project rule against its canonical
target path during a forced scan and persist `target-missing` when the file no
longer exists.

#### Scenario: Project AGENTS.md is deleted externally

- **GIVEN** a registered project rule whose target was previously present
- **WHEN** the user deletes the target file and rescans
- **THEN** the returned descriptor has `exists: false` and
  `syncStatus: "target-missing"`
- **AND** cached list/reload returns the same state.

### `FR-RULE193-002`: Missing targets remain recoverable and explicit

PromptHub MUST retain the managed Rule body and version history for a missing
target and MUST render the record as missing instead of normal/synced.

#### Scenario: Missing record is selected

- **GIVEN** a project target is missing but PromptHub has managed content
- **WHEN** the record is viewed
- **THEN** the UI identifies the missing source path
- **AND** the managed content and versions remain readable
- **AND** save/deploy remains an explicit user action.

### `FR-RULE193-003`: Cleanup is explicit and scoped

PromptHub MUST provide confirmation-gated cleanup for selected missing project
records. Cleanup MUST NOT remove global rules, present project records,
unselected missing records, or external project files.

#### Scenario: Mixed project selection

- **GIVEN** missing, present, and unrelated project Rules
- **WHEN** the user confirms cleanup for selected missing records
- **THEN** only those selected managed records and their managed versions are
  removed
- **AND** skipped/failed identifiers remain visible with a result.

### `NFR-RULE193-001`: Incremental reconciliation

Rescan MUST perform bounded filesystem checks and MUST avoid rewriting metadata
or DB rows whose computed status has not changed.

#### Scenario: Large stable project list

- **GIVEN** many registered project rules with unchanged targets
- **WHEN** the user rescans
- **THEN** each target is checked at most a bounded number of times
- **AND** unchanged project metadata is not rewritten.

## Modified Requirements

- Project Rules remain visible when their external target is missing, but they
  must be visibly invalid and eligible for explicit cleanup.

## Removed Requirements

- None.

## Verification

- `TEST-RULE193-001`: real filesystem plus RuleDB regression deletes a target,
  rescans, and verifies returned, metadata, DB, and fresh-service cached state.
- `TEST-RULE193-002`: managed body/version tests prove missing-target recovery
  and explicit redeploy behavior.
- `TEST-RULE193-003`: UI/store tests verify missing badge, path, selection,
  confirmation, partial cleanup result, and seven-locale text.
- `TEST-RULE193-004`: adversarial cleanup tests cover global IDs, present
  project IDs, duplicate IDs, invalid IDs, Windows-style paths, and injected
  deletion failure.
- `TEST-RULE193-005`: stress test verifies unchanged scans avoid metadata/DB
  writes and remain linear in registered project count.
