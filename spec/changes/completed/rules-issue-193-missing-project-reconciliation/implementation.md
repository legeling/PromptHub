# Implementation

> Completed change history. Current requirements: [owning topic](../../../knowledge/behavior/rules-workspace.md). Earlier proposals and designs below are retained as evidence, not current instructions.

## Product

Shared

## Status

- Status: completed (local acceptance; publication pending)
- Phase: converge

## Shipped

- Forced scan computes project target state once and persists only changed
  `_rule.json`/RuleDB status.
- Missing project records retain managed content and versions, show an explicit
  missing badge/path, and support selected confirmation-gated cleanup.
- Cleanup rechecks target absence, rejects unsafe/global/present IDs, returns
  removed/skipped/failed IDs, and fails closed for tampered managed paths.
- Review added cleanup failure feedback and split workspace support helpers so
  the owning service remains below the 1,500-line preferred gate.

## Verification

- 2026-10-13: four real preload/IPC/filesystem/SQLite tests passed in
  `apps/desktop/tests/integration/rules-missing-project-acceptance.test.ts`.
  They verify delete/rescan/reopen, retained managed content/history, scoped
  cleanup, invalid/global/present/duplicate IDs, reappearing targets,
  per-record deletion failure and retry. Only Electron transport and the
  isolated home are replaced; the deletion fault is explicit.
- The 128-project case measures real I/O: one existence check per target,
  zero project metadata/upsert/version writes when unchanged, and one of each
  after one target disappears. Fixture preparation plus both scans took
  14.77 seconds locally; this is not a cross-platform performance budget.
- Failure capability: in an isolated copy, bypassing persisted reconciliation
  made `persists deletion` fail with exit 1: stored `synced` instead of
  `target-missing`. The mutation was removed and the original source hash
  verified. No shared source was mutated.
- Rules workspace/IPC/sidebar component checks: 37 tests passed. These
  supplement, rather than replace, the real-storage baseline.
- The standalone CLI normal entrypoint passed
  `apps/cli/tests/rules-missing-target.test.ts`: add/save, external deletion,
  scan, database close/list/read, explicit removal and external-file retention.
  It uses the existing isolated-home/current-schema fixture and real command
  handlers. CLI source/test typecheck and targeted ESLint passed.
  Web Rules instead own tenant-scoped managed copies; project paths
  are metadata, not permission to scan a browser user's local filesystem.
  External local-target disappearance is therefore a Desktop/CLI boundary,
  not a new server filesystem scan.
- Core typecheck, Desktop source/test typecheck, targeted ESLint and the
  file-size gate passed. The two integration files are selected by the normal
  integration project and the root harness's `desktop-integration` check.
- Real Electron GUI on macOS, isolated profile/home: externally deleted two
  targets, clicked Rescan, observed both missing badges/paths and readable
  managed content/history, selected one record, cancelled cleanup (three
  records retained), then confirmed cleanup (only the selected record gone).
  The unselected missing body, present target and external `keep.txt` remained.
  Renderer reload and process close/reopen retained the correct state.

Re-run from the repository root:

```sh
pnpm --dir apps/desktop exec vitest run --project integration tests/integration/rules-missing-project-acceptance.test.ts --minWorkers=1 --maxWorkers=1
pnpm --dir apps/desktop exec vitest run --project unit tests/unit/main/rules-workspace.test.ts tests/unit/main/rules-ipc.test.ts tests/unit/components/rules-sidebar-panel.test.tsx
pnpm --dir apps/desktop typecheck:tests
pnpm --dir packages/core typecheck
pnpm --dir apps/cli exec vitest run tests/rules-missing-target.test.ts --minWorkers=1 --maxWorkers=1
```

The sequential functional scenarios intentionally exceed 50 lines to keep
the real entrypoint, durable reopen and preservation assertions together.
No schema/layout migration was introduced. Windows drive-letter/native GUI
acceptance, distribution packaging and the full release harness were not run.
The unbundled GUI emitted the existing missing-tray-resource warning; tray
behavior is outside this issue's acceptance.
Specification governance/index/traceability passed; the full changed/release
harness was not executed or claimed.

## Analyze

- Traceability complete: persisted state, scoped cleanup, measured writes,
  recovery and the running-Desktop workflow have acceptance evidence above.
- Conflicts/blockers resolved: missing project targets are retained as explicit
  recoverable records; deletion remains a confirmed cleanup action.

## Converge

- Stable Rules behavior and local issue overlay synced: yes.
- Local delivery: `local_done`; no publication or remote closure is implied.
- A completion commit uses `Closes #193`; it takes effect only on GitHub's
  default branch and does not authorize a push.
- Recorded complete at the original path to preserve existing references.

## Synced Docs

- `spec/knowledge/behavior/rules-workspace.md`

## Follow-ups

- A future provenance field could support safe auto-cleanup of scan-generated
  records, but it requires its own migration and product decision.
- A reusable pre-migrated Desktop DB fixture should replace per-test migration
  in the Rules suite; that harness optimization is separate from #193.
