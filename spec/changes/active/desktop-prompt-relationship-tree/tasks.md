# Tasks

- [x] Fetch and merge `jazzson51569/PromptHub feature/hierarchical-latest` into a clean branch while preserving contributor commit history.
- [x] Review contributor implementation and identify merge blockers.
- [x] Write DB regression tests for prompt hierarchy move safety and delete semantics.
- [x] Add existing-database migration coverage for `parent_id` and `sort_order`.
- [x] Change prompt hierarchy delete semantics from cascade delete to `SET NULL`.
- [x] Add old-database migration for hierarchy columns.
- [x] Harden `PromptDB.movePrompt` against invalid order, missing parent, self-parent, and descendant cycles.
- [x] Remove duplicate list view rendering in `MainContent`.
- [x] Harden `PromptListView` drag/drop and keyboard hierarchy handling.
- [x] Harden renderer IndexedDB fallback move behavior.
- [x] Add IPC input validation for prompt moves.
- [x] Run targeted DB and migration tests.
- [x] Run desktop typecheck.
- [x] Run desktop lint.
- [x] Run desktop build.
- [x] Run diff whitespace check.
- [ ] Commit and push PR branch.
