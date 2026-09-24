# Tasks

## TDD Sequence

- [x] `T-RULE193-001`: Add the red real-filesystem/RuleDB regression for
      delete, rescan, and fresh-service cached reload. Covers
      `FR-RULE193-001`, `TEST-RULE193-001`.
- [x] `T-RULE193-002`: Implement changed-only project reconciliation and
      preserve managed content/version history. Covers `DES-RULE193-001`,
      `FR-RULE193-002`, `TEST-RULE193-002`.
- [x] `T-RULE193-003`: Add missing-state renderer/store regressions and the
      seven-locale copy, then implement the visible invalid/recovery state. Covers
      `DES-RULE193-002`, `TEST-RULE193-003`.
- [ ] `T-RULE193-004`: Add red adversarial cleanup tests for invalid/global/
      present/duplicate IDs and injected failure. Covers `FR-RULE193-003`,
      `TEST-RULE193-004`.
- [x] `T-RULE193-005`: Implement confirmation-gated, per-record idempotent
      cleanup with removed/skipped/failed results. Covers `DES-RULE193-003`.
- [ ] `T-RULE193-006`: Add the large registered-project regression and prove
      unchanged records cause no metadata/DB writes. Covers
      `NFR-RULE193-001`, `TEST-RULE193-005`.

## Verification And Convergence

- [ ] `T-RULE193-007`: Verify normal Core/DB/Desktop delete/rescan/cleanup
      workflows and durable results, then affected black-box inputs and recovery
      under the [testing standard](../../../rules/testing-standards.md). Run the
      changed-surface harness and record any functional layers it does not select.
- [ ] `T-RULE193-008`: Run Core/Desktop typechecks, targeted lint, file-size
      gate, `pnpm spec:test`, `pnpm spec:index:check`, and
      `git diff --check`.
- [ ] `T-RULE193-009`: Operate the original delete/rescan/cleanup workflow in
      the running Desktop app and record visible state, confirmation, retry, and
      layout observations.
- [x] `T-RULE193-010`: Sync stable Rules behavior, implementation, local issue
      status, and release assignment; archive after converge.
