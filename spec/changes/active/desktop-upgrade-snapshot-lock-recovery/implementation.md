# Implementation

## Product

Desktop

## Status

release-pending. Scoped verification is recorded below; publication attribution remains to be reconciled.

## Shipped

- Upgrade startup resolves the canonical database before the legacy database and
  runs the shared guarded lock recovery immediately before snapshot capture.
- A stale registered owner is removed only when its process is dead and no live,
  unknown, or unsafe owner remains.
- Blocked ownership still returns `snapshot-failed`, preserves lock evidence,
  and leaves the last-run version marker unchanged.

## Verification

- `TEST-UPLOCK-001` stale registered owner and real SQLite image:
  - Command: `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/upgrade-backup-startup.test.ts tests/unit/main/upgrade-backup.test.ts`
  - Result: 36 tests passed.
- `TEST-UPLOCK-002` live owner preservation:
  - Command: same focused Vitest invocation.
  - Result: passed; lock remained and marker did not advance.
- Desktop typecheck:
  - Command: `pnpm --filter @prompthub/desktop typecheck`
  - Result: passed.
- Real user-data development cold start:
  - Command: `pnpm electron:dev`
  - Result: orphan lock recovered, v0.6.0 safety snapshot created, database
    initialized, and `startup:window_ready` recorded for `0.6.0-beta.1`.
  - Warning: Prompt canonical workspace bootstrap reported one missing manifest
    and continued without workspace sync; this is separate from the snapshot
    lock failure.

## Analyze

- Traceability complete: yes.
- Conflicts/blockers resolved: stable concurrency policy and runtime ordering agree.

## Converge

- Stable workflow/knowledge/rules synced: `database-concurrency.md` updated.
- Issues/releases/ADRs/indexes synced: no issue, release, or ADR change required;
  the active change index was regenerated with the current change inventory.
- Final change destination: keep active until the startup fix is committed/released.

## Synced Docs

- `spec/knowledge/behavior/database-concurrency.md`

## Follow-ups

- Investigate the independent missing Prompt canonical manifest warning without
  coupling that recovery work to the upgrade snapshot lock fix.
