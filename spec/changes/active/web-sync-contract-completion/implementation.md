# Implementation Record

## Product

Shared

## Status

in progress. Native restore, tombstones/conflicts, freshness and sensitive-data work remain open; P0 evidence does not close the plan.

## Current baseline

- `packages/shared/types/sync.ts` models the complete prompt graph fields, and
  the P0 provider adapters now preserve them.
- The remaining gaps are native agent reapplication, tombstones, conflict
  policy, encryption policy, and release publication.
- MCP/Plugin libraries and agent asset files are already represented in the
  self-hosted payload; native Web reapply and conflict/delete semantics remain
  explicitly deferred P1 work.

## Implemented P0 changes

- Added prompt relation fields, structural validation, dependency filtering, and
  import preview/skipped counts to the desktop backup format.
- Added ID-preserving direct IPC restore operations for relations and output
  format items.
- Added prompt graph fields to desktop self-hosted push/pull merge logic with
  endpoint filtering.
- Added Web parser normalization and `BackupService` export/import persistence
  with actor visibility checks and imported/skipped dependency diagnostics.
- Added prompt graph fields to WebDAV/S3 legacy and incremental payload builders
  and restore plumbing.
- Added desktop graph-restore preflight so runtimes without the direct bridge
  fail before clearing local data.
- Added regression tests for local backup, IPC handlers, self-hosted payloads,
  Web route round trips, malformed dependencies, and provider serialization.

## Follow-up tranche implemented

- Manifest/data/media integrity preflight and complete freshness coverage are
  specified in `specs/sync/spec.md` as `FR-SYNC-007` and `FR-SYNC-008`.
- Incremental data and media hashes/sizes are verified before restore; mismatch
  and missing-file paths are covered by `sync-backup-core` tests.
- Auto-sync freshness now scans all timestamped durable backup surfaces and
  fails when the snapshot read itself fails.
- Tombstones, conflict policy, and native MCP/Plugin reapplication remain
  explicitly deferred until their ownership and rollback semantics are designed.

## Verification log

Focused verification passed:

- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/web typecheck`
- Desktop backup, self-hosted sync, sync core, format, and IPC regression suites
- Incremental integrity and freshness regression suites (`sync-backup-core`:
  16 tests)
- Web sync snapshot and sync import route suites
- Web sync contract, WebDAV, import/export, and graph-diagnostics suites
- Desktop graph-restore preflight regression suite

Broader verification passed:

- `pnpm verify:release:quick` (all 18 checks; 300.5 seconds)
- Desktop unit suite: 332 files, 2,871 tests
- Web unit suite: 56 files, 337 tests
- Cloudflare worker suite: 5 files, 10 tests
- `pnpm lint:file-size`
- `git diff --check`
- `pnpm spec:index`

## Analyze

- Traceability is now complete for `FR-SYNC-001` through `FR-SYNC-008`.
- The previous traceability offset and the incorrect relation endpoint names
  were corrected before the next implementation pass.
- The desktop restore transaction boundary and Web skipped-record diagnostics
  are explicit implementation behavior, not hidden assumptions.

## Converge

- Stable sync knowledge is updated, and the latest release harness agrees with
  the implementation. Final convergence is blocked only by the unavailable
  Docker container smoke.
- Issue/release records remain open and must not be closed or archived yet.
- Final destination: move this change to the dated archive only after the
  implementation, release verification, and Docker smoke agree.

## Pending verification

- Docker container smoke remains a CI/host follow-up because Docker is not
  available in the current local environment.
