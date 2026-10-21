# Tasks

> Completed change history. Current requirements: [owning topic](../../../knowledge/behavior/prompt-workspace.md). Earlier proposals and designs below are retained as evidence, not current instructions.

## TDD Sequence

- [x] `T-COPY192-001`: Add a red component regression reproducing different
      clipboard content from the menu and bottom "Copy Prompt" actions. Covers
      `FR-COPY192-001`, `TEST-COPY192-001`.
- [x] `T-COPY192-002`: Extract the pure copy plan, preserve source identity,
      and cover no/one/multiple/missing-target and language branches. Covers
      `FR-COPY192-001`, `FR-COPY192-002`, `DES-COPY192-002`,
      `TEST-COPY192-002`.
- [x] `T-COPY192-003`: Route the bottom action through the canonical handler,
      unify completion/cleanup, and add variable cancellation plus clipboard
      failure tests. Covers `DES-COPY192-001`, `DES-COPY192-003`,
      `TEST-COPY192-003`.
- [x] `T-COPY192-004`: Add the large in-memory planning regression and record
      operation counts without timer-based tests. Covers `NFR-COPY192-001`,
      `TEST-COPY192-004`.

## Verification And Convergence

- [x] `T-COPY192-005`: Run focused tests with coverage for the copy flow,
      action bar, and changed context branches.
- [x] `T-COPY192-006`: Run Desktop source-and-test typecheck, targeted lint,
      inspect changed-surface harness selection, run affected checks,
      `pnpm spec:test`, `pnpm spec:index:check`, and
      `git diff --check`.
- [x] `T-COPY192-007`: Operate both entry points in the running Desktop app and
      record clipboard, variables, copied state, toast, and layout observations.
- [x] `T-COPY192-008`: Update stable Prompt behavior, implementation record,
      local issue status, and release assignment; archive after converge.
