# Tasks

## TDD Sequence

- [x] `T-PLUG190-001`: Add the red real-package fixture with valid Codex and
      Claude manifests and assert both native targets. Covers
      `FR-PLUG190-001`, `TEST-PLUG190-001`.
- [x] `T-PLUG190-002`: Implement fixed-allowlist multi-marker inspection,
      canonical identity selection, and derived target evidence. Covers
      `DES-PLUG190-001`.
- [x] `T-PLUG190-003`: Add red Claude passthrough tests for copy/symlink and
      implement generalized exact-target native distribution. Covers
      `FR-PLUG190-002`, `DES-PLUG190-003`, `TEST-PLUG190-002`.
- [x] `T-PLUG190-004`: Add malformed, traversal, oversized, and symlink-escape
      secondary marker tests; isolate target-local failure, retain package-wide
      symlink safety, and prevent adapter overwrite.
      Covers `FR-PLUG190-003`, `TEST-PLUG190-003`.
- [ ] `T-PLUG190-005`: Implement selected/batch matrix overlay and cover
      update, rescan, rollback, and legacy cached records. Covers
      `DES-PLUG190-002`, `DES-PLUG190-004`, `TEST-PLUG190-004`.
- [ ] `T-PLUG190-006`: Add the large-package marker-probe regression and record
      filesystem operation counts. Covers `NFR-PLUG190-001`,
      `TEST-PLUG190-005`.

## Verification And Convergence

- [ ] `T-PLUG190-007`: Verify normal Core/Desktop Plugin lifecycle workflows
      and package/target results, then affected black-box inputs and recovery under
      the [testing standard](../../../rules/testing-standards.md). Run the
      changed-surface harness and record any functional layers it does not select.
- [ ] `T-PLUG190-008`: Run Core/Shared/Desktop typechecks, targeted lint,
      file-size gate, `pnpm spec:test`, `pnpm spec:index:check`, and
      `git diff --check`.
- [ ] `T-PLUG190-009`: Import the issue repository or an equivalent offline
      fixture in the running Desktop app and verify native labels, Claude
      distribution, errors, and target layout.
- [x] `T-PLUG190-010`: Sync stable Plugin behavior/matrix, implementation,
      local issue status, and release assignment; archive after converge.
