# Tasks

## Evidence And TDD Sequence

- [x] `T-SKILL194-001`: Add a red shared-registry test proving
      `agent-skills-global` is available to Skill distribution but absent from
      `SKILL_PLATFORMS`, Agent counts, detection, and capability matrices. Covers
      `FR-SKILL194-001`, `TEST-SKILL194-001`.
- [x] `T-SKILL194-002`: Implement the shared target projection in Shared/Core
      and expose it to Desktop plus CLI without adding a pseudo-Agent. Covers
      `DES-SKILL194-001`.
- [ ] `T-SKILL194-003`: Add table-driven path/override/security tests, then
      implement platform-safe resolution and settings validation. Covers
      `FR-SKILL194-002`, `DES-SKILL194-002`, `TEST-SKILL194-002`.
- [ ] `T-SKILL194-004`: Add red real-filesystem receipt and lifecycle tests,
      including unmanaged/modified/forged/symlink/partial-failure cases. Covers
      `FR-SKILL194-003`, `FR-SKILL194-004`, `TEST-SKILL194-003`,
      `TEST-SKILL194-004`.
- [x] `T-SKILL194-005`: Implement atomic ownership receipts and the bounded
      install/update/uninstall state machine. Covers `DES-SKILL194-003`,
      `DES-SKILL194-004`.
- [ ] `T-SKILL194-006`: Add red exact-path and double-discovery selection tests,
      then implement map-based deduplication and confirmation warnings. Covers
      `FR-SKILL194-005`, `DES-SKILL194-005`, `TEST-SKILL194-005`.
- [ ] `T-SKILL194-007`: Build the evidence fixture and execute isolated runtime
      verification for priority Agents across macOS/Windows/Linux; correct the
      Qwen stable-doc discrepancy. Covers `FR-SKILL194-006`,
      `DES-SKILL194-006`, `TEST-SKILL194-006`.
- [ ] `T-SKILL194-008`: Add large-package/many-Skill stress and failure cleanup
      tests with finite concurrency and resource assertions. Covers
      `NFR-SKILL194-001`, `TEST-SKILL194-007`.

## Verification And Convergence

- [ ] `T-SKILL194-009`: Verify normal Shared/Core/CLI/Desktop Skill workflows
      and durable target results first, then affected black-box inputs and recovery
      under the [testing standard](../../../rules/testing-standards.md). Run the
      applicable changed and release-risk harness profiles and record selection gaps.
- [ ] `T-SKILL194-010`: Run Shared/Core/CLI/Desktop typechecks, targeted lint,
      file-size gate, `pnpm spec:test`, `pnpm spec:index:check`, and
      `git diff --check`.
- [ ] `T-SKILL194-011`: Operate copy, symlink/fallback, conflict, update,
      duplicate warning, and safe uninstall in the running Desktop UI; inspect CLI
      summary/JSON output.
- [ ] `T-SKILL194-012`: Sync stable Skill behavior, compatibility reference,
      public docs/i18n, implementation, local issue status, and release assignment;
      archive after converge.
