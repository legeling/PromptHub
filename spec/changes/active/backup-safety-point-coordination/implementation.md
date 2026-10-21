# Backup Safety Point Coordination Implementation

## Product

Desktop

## Status

release-pending. Local implementation and scoped verification are recorded below; publication attribution remains to be reconciled.

## Traceability

| Requirement          | Design         | Verification                                   | Task                                     |
| -------------------- | -------------- | ---------------------------------------------- | ---------------------------------------- |
| `FR-BACKUPCOORD-001` | Reuse Identity | `TEST-BACKUPCOORD-001`, `TEST-BACKUPCOORD-002` | `T-BACKUPCOORD-001..002`                 |
| `FR-BACKUPCOORD-002` | Ownership      | `TEST-BACKUPCOORD-003`, `TEST-BACKUPCOORD-004` | `T-BACKUPCOORD-001`, `T-BACKUPCOORD-003` |
| `FR-BACKUPCOORD-003` | Retention Plan | `TEST-BACKUPCOORD-005`                         | `T-BACKUPCOORD-001`, `T-BACKUPCOORD-004` |
| `FR-BACKUPCOORD-004` | Ownership      | `TEST-BACKUPCOORD-006`                         | `T-BACKUPCOORD-001`, `T-BACKUPCOORD-005` |

## Analyze Gate

- No storage format, IPC contract, database schema, or authority source changes.
- Existing family registries remain the deletion owners.
- The existing recovery rule that managed points are bounded by count, age, and
  bytes is preserved and strengthened with an aggregate desktop policy.
- Unowned directories and live user data remain outside automatic cleanup.

## Implemented Behavior

- In-app installation records the downloaded target version. First startup
  reuses an exact modern install-time safety point created after the last-run
  marker; stale, ambiguous, or raw-evidence snapshots are rejected.
- Layout migration consumes the current startup safety point, and residual
  retries reuse a valid marker-referenced complete point. Missing marker
  references are replaced by a fresh complete point.
- Startup that creates or adopts an upgrade/layout point plans one aggregate
  retention set across upgrade, recovery, and database families. Ordinary
  startup skips the scan. The plan protects the newest valid point in every
  family, pinned recovery artifacts, and incomplete layout references.
- New whole-root snapshots omit standalone transient database recovery copies.
  The files stay in the active root and remain independently discoverable.
- The coordinator supports read-only planning, bounded non-following active
  storage scans, family-isolated cleanup failures, and structured startup logs.

## Verification

- Core recovery registry: 17 tests passed.
- Desktop focused suites: updater 19, upgrade startup 11, upgrade snapshot 33,
  layout migration 15, and managed retention 18 tests passed.
- Managed retention coverage: 100% statements, branches, functions, and lines.
- Desktop and Core TypeScript checks passed; focused ESLint and Prettier passed.
- File-size gate passed with `apps/desktop/src/main/index.ts` held at 1500 lines.
- Spec governance and traceability gates passed for 15 active changes.
- Desktop production build passed for renderer, main, and preload bundles.
- A real built Electron cold start used an isolated E2E `userData` root with a
  `0.5.9 -> 0.6.0-beta.1` marker. The window loaded as PromptHub, exactly one
  upgrade manifest was created, aggregate retention was present in the startup
  log, and the active probe file remained unchanged. The app and temporary root
  were closed and removed after the check.
- A read-only run against the live root measured 107.3 MiB active durable data,
  a 512 MiB budget, 1539.3 MiB of valid managed points before retention, and
  401.6 MiB after the projected plan. It would retain 1 upgrade, 1 recovery,
  and 3 database points while removing 4 upgrade and 1 recovery points,
  reclaiming about 1137.8 MiB (1.11 GiB).
- The live backup directory remained 1,684,844 KiB after the dry run, with five
  upgrade and two recovery manifests still present. No live backup was deleted.
- After explicit cleanup authorization, the same plan was applied once with no
  family errors. Four duplicate upgrade points and one older recovery point
  were removed; one upgrade, one recovery, and three database points were
  verified against their registries. The complete live `backups/` directory is
  now 482,016 KiB. The 57,936 KiB manifest-less historical directory and the
  standalone `prompthub.db.backup-before-*` recovery copy remain untouched.
  The active SQLite database returned `ok` from `PRAGMA quick_check`.
- Live profiling isolated the previous slow path in upgrade directory sizing:
  the original upgrade registry scan took about 9.0 seconds. Manifest-backed
  accounting reduced its warmed read-only scan to about 0.7 seconds; recovery
  and database scans measured about 0.4 and 0.5 seconds. Ordinary launches now
  skip all three scans because no safety point changed.
