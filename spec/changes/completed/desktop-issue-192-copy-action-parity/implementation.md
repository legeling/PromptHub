# Implementation

> Completed change history. Current requirements: [owning topic](../../../knowledge/behavior/prompt-workspace.md). Earlier proposals and designs below are retained as evidence, not current instructions.

## Product

Desktop

## Status

- Status: completed (local acceptance; publication pending)
- Phase: converge

## Shipped

- Both detail and menu "Copy Prompt" actions now call the canonical workspace
  copy handler.
- The copy plan applies zero, one, or multiple output-format mappings in stable
  order while retaining source Prompt usage attribution.
- Variable, language, copied-state, toast, queue cleanup, and source identity
  are shared. Review also cleared the source identity after a single variable
  copy completes or its clipboard write fails.
- GUI acceptance exposed another duplicate owner: `VariableInputModal`
  copied each filled item before invoking the workspace continuation. It now
  delegates to the supplied callback without writing an intermediate item.
  Without a callback, the standalone modal still copies once. Rejected
  continuations report the existing localized copy error, not success.

## Verification

- 2026-10-13: 38 selected tests passed across eight files. Four new
  `apps/desktop/tests/integration/prompt-copy-persistence-acceptance.test.tsx`
  cases execute the real copy flow, preload/IPC, SQLite and durable reopen:
  ordered target hydration, English content, source-only usage, variables and
  clipboard failure/retry. Only Electron/home and OS clipboard transport are
  replaced; copy business logic is not mocked.
- `apps/desktop/tests/unit/components/variable-copy-ownership.test.tsx`
  adds four real-modal regressions: no intermediate write, caller-owned single
  write, standalone copy and rejected continuation. The queue-item assertion
  failed on the old implementation (exit 1, unexpected write of
  `Second audienceX`) and passed after the fix. Existing modal tests now give
  their caller the real clipboard helper rather than expecting two owners.
- The original parity component test proves bottom-button delegation only;
  exact two-entry clipboard equality is supplied by the real GUI below.
  Existing cancellation and 10,000-row planner tests remain supplemental.
- Measured V8 line/branch coverage: copy flow 95.85%/84.31%, variable modal
  84.96%/84.54%, action bar 64.36%/42.85%, workspace variable dialogs
  63.09%/62.50%. Uncovered edit/delete/AI surfaces are outside this fix;
  metrics are not a claim of complete application coverage.
- Desktop source/test typecheck, targeted ESLint and production build passed.
  Normal Vitest integration/unit globs and the root harness select these files.
- Self-hosted Web imports the same Desktop renderer and variable dialog, so
  this fix has one UI owner for both clients. Web typecheck and 19 focused
  workspace/bridge/Prompt API tests passed, supplementing Desktop acceptance. They
  do not constitute a Web browser GUI walkthrough. CLI has no menu/detail
  action or variable modal to duplicate this particular defect.
- Real Electron on macOS, isolated profile/home: menu and bottom actions both
  wrote `Second formatted output\n\nFirst formatted output` to the native
  clipboard. With two variable targets, both wrote
  `Second audienceX\n\nFirst topicY`; intermediate collection and cancellation
  retained a controlled clipboard sentinel and source usage. Successful copies
  showed the copied button/toast; four completions produced source usage 4 and
  target usage 0/0. Closing/reopening the process retained those counts.
  The observed buttons/dialog were readable and operable at 1200x800.

Re-run from the repository root:

```sh
pnpm --dir apps/desktop exec vitest run tests/integration/prompt-copy-persistence-acceptance.test.tsx tests/unit/components/variable-copy-ownership.test.tsx tests/unit/components/variable-input-modal.test.tsx tests/unit/components/prompt-copy-action-parity.test.tsx tests/unit/components/prompt-copy-flow.test.tsx tests/unit/components/prompt-copy-plan.test.ts tests/unit/components/prompt-variable-copy-dialog.test.tsx tests/unit/components/prompt-copy-utils.test.ts
pnpm --dir apps/desktop typecheck:tests
pnpm --dir apps/desktop build
```

The ordered-copy integration scenario keeps its setup, single-write assertions
and durable reopen together rather than splitting the workflow at 50 lines.
No persistence migration, clipboard fallback or CLI/Web contract changed.
Windows, distribution packaging and the full release harness were not run.
The unbundled tray-resource warning is outside the copied-entrypoint workflow.
Specification governance/index/traceability and the file-size gate passed;
the full changed/release harness was not executed or claimed.

## Analyze

- Traceability complete: functional persistence, modal red/green, focused
  coverage and actual two-entry clipboard/variable GUI evidence are recorded.
- Conflicts/blockers resolved: the existing output-format pipeline is the
  canonical behavior for every same-named copy action.

## Converge

- Stable Prompt behavior and local issue overlay synced: yes.
- Local delivery: `local_done`; no publication or remote closure is implied.
- A completion commit uses `Closes #192`; it takes effect only on GitHub's
  default branch and does not authorize a push.
- Recorded complete at the original path to preserve existing references.

## Synced Docs

- `spec/knowledge/behavior/prompt-workspace.md`

## Follow-ups

- A separately named raw-copy action requires a distinct product requirement
  and is not part of this fix.
