# Foundation implementation status

## Status

in progress

The user accepted the design and authorized implementation on 2026-09-05.
Batch 1 and the catalog startup integration have focused verification. The full redesign is NOT
complete or release-ready. No commit, push, deployment, GUI control or live
profile migration was performed.

## Implemented batch

- Canonical entry journals use version 2 with preparing/prepared/committed states.
  Ownership is recorded before staging. Recovery removes incomplete owned stages,
  rolls back uncommitted publication, and preserves committed data during cleanup.
  Version 1 prepared journals remain supported; unknown versions fail closed.
- Commit-marker replacement errors preserve an unknown outcome. Post-commit
  projection errors cannot reverse files. Cleanup failure returns committed with
  cleanupPending and retains the journal. Bounded streaming digests verify payloads.
- Recovery discovery runs before Desktop graph validation and DB entrypoints.
  A live owner PID blocks recovery; this is NOT the complete OS root-owner broker.
- Prompt creation and initial history share a SQL transaction. Canonical
  Prompt/Skill/Agent APIs reject an unrelated raw outer transaction before writing.
  Safe multi-command UnitOfWork composition remains an integration task.
- Invalidated catalog handles reject reads, writes and cached statements until
  closed. Core/CLI initialization now rebuilds missing/stale canonical catalogs
  before its first writable open; an already-open stale handle still fails closed.
- Skill hydration failure preserves the committed new DB and bundle. Bulk Skill
  deletion publishes one write set; cache cleanup does not resurrect deletions.
  Rule/Agent compensation paths preserve committed and unknown outcomes.
- Renderer refresh invalidates detail cache and stale selection. Responses
  require matching request identity/generation, including ABA protection.
  Detail cache and total outstanding detail requests are each bounded at 100;
  superseded requests consume capacity until settled. Durable revisions are pending.
- Worker uses tenant/DB-bound snapshot baselines and conditional SQL updates.
  Stale writes return 409; ambiguous D1 results do not report success. Primary
  entities, duplicate IDs, versions and malformed inputs are validated.
  Request streams stop at their byte limit before JSON parsing. Full nested
  schemas and normalized online resource tables are not yet implemented.
- Manifest v5 references immutable data/image/video objects with full SHA-256.
  Objects upload before the manifest. v4 retains its short-hash read compatibility.
  Unchanged semantic content remains no-op, including encrypted snapshots without
  plaintext semantic hashes. Non-404 failures are not treated as empty remotes.
  Existing Skill upload counts are preserved. A private protocol helper keeps
  sync-backup-core within its actual 1500-line limit.

## Compatibility and resource limits

Older builds cannot interpret pending v2 local journals or v5 remote manifests.
They must not share writable roots/destinations with this unreleased build.
Complete journal recovery with a supporting build before reopening an older one;
never remove or downgrade a journal to bypass compatibility checks. Actual
old-writer isolation and the upgrade/downgrade migration remain release gates.

Publication limits: 20,000 write-set entries, 100,000 visited entries per target,
4 GiB per target, 16 MiB per journal, 128 discovered journals, and a 64 KiB hash
buffer. Descriptor identity and actual read lengths reject changing files.
Existing Prompt callers still submit the whole graph; interaction performance
targets are not established by this batch.

Worker limits: 100,000 collection entries and a 50 MiB request/snapshot limit.
Supported compatibility versions: 1, 3.1, 4.0, desktop-backup-v1, web-backup-v2,
web-cloudflare-backup-v1, prompthub-cli-workspace-v1 and prompthub-cli-workspace-v2.
These compatibility inputs do not establish cross-product schema equivalence.

Windows staged-file flushes use writable handles, as required by
[Microsoft FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers).
Directory-handle failures are narrowly classified. Tests simulate the Windows
branches on macOS; this is not native Windows or power-loss acceptance.

## Verification

Disjoint focused suites plus targeted reruns after fixes passed 224 cases:

| Scope                                 | Cases | Boundary                                                                                              |
| ------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------- |
| Core publication/domain/DB            |    91 | Actual temporary files/WASM SQLite; real child exits during preparation, publication and after commit |
| Desktop startup/store/backup/adapters |    70 | Startup fixtures, deferred async state and stateful remote adapters                                   |
| Worker                                |    26 | D1 fixtures and real Request/ReadableStream; no production D1                                         |
| CLI Prompt/workspace sync             |    20 | Isolated workspaces and transport fixtures                                                            |
| Self-hosted Web Prompt routes         |    17 | Real isolated SQLite and route contracts                                                              |

These were complete implementation/repair batches, not one full-repository run.
Environment/fixture failures were corrected and the affected checks rerun.

Canonical entry publication coverage is 100% lines/statements/functions and
97.18% branches (242/249). This does NOT satisfy 100% changed branch/condition
coverage. Remaining short-circuit, platform and defensive cases must be closed
before merge. V8 branch coverage does not prove the complete condition matrix.
Machine-readable results are retained in verification-summary.json.

Scoped Desktop ESLint, Worker lint, file-line limits and traceability checks pass.
Core, DB, Desktop and Worker typechecks passed for the verified implementation. No full release harness, production build/package, GUI/two-start
upgrade, native Windows, real S3/WebDAV/D1, power-loss or live restore drill ran.

## Catalog startup integration (2026-09-08)

- The shared reconciler now lives in Core. Headless canonical startup stages and
  verifies a catalog before its first writable database open. Repeated init of
  the open handle validates it without replacing its underlying file.
- Desktop delegates through a compatibility wrapper. Its existing unreadable
  catalog rebuild policy is explicit; headless startup preserves an unreadable
  database and fails rather than silently dropping its operational records.
- Bound paths, symlink rejection, client exclusion, future-schema rejection,
  orphan sidecar preservation and preserved-table compatibility are checked
  before replacement. Committed journals recover before canonical validation.
- No schema/layout conversion was added. Staging and journaled replacement reuse
  the established Core shadow builder; canonical files are never rewritten from
  the stale catalog. Rebuild rollback and a subsequent successful retry passed.

Validation: 100 distinct focused cases passed in this batch: 32 new Core
startup/reconciliation cases, 26 adjacent Core cases, 22 Desktop startup/self-heal
cases and 20 CLI Prompt/workspace cases. The 32 new cases exercise real temporary
files and WASM SQLite, plus the in-process CLI entrypoint. All nine preserved
configuration/server/operational tables contain non-empty rows and match after
rebuild. Three initial fixture assertions compared database order with file order;
those assertions now compare each representation to its own original snapshot.
The favorite fixture sets a real persisted favorite before materialization.

Core reconciler: 165/165 lines, 10/10 functions, 42/42 V8 branches. Core database
entrypoint: 30/30 lines, 1/1 functions, 7/7 branches. The explicit condition matrix
is in verification-batch2.json; these results do not claim formal MC/DC or native
Windows coverage. Core/Desktop typechecks, scoped ESLint, file-size and traceability
checks pass. The broader Core/CLI/Desktop quick profile finished: 17/18 checks
passed, including all 630 Core, 123 CLI and 5,622 Desktop unit tests (6,375 total),
CLI/Desktop lint and all three typechecks. Its only failure is `governance-spec`:
`.agents/skills/spec-init/tests/spec-init-commit-rules.sh` was already deleted in
the incoming worktree. The unrelated Skill migration was preserved; this is not
a green quick/release result. See verification-batch2-quick.json.

The isolated startup measurement passed its existing coarse storage-scale bounds:
1,000 one-KiB Prompts, current catalog 1,365.9 ms, rebuild 1,437.7 ms, cumulative
maxRSS increase 6,416 KiB on darwin/arm64 with Node v26.7.0. One sample per state
is a baseline, not P95 acceptance. Even the current path stages a complete DB;
avoiding that repeated work remains necessary before interaction/10k acceptance.
The repeatable fixture is `packages/core/performance/canonical-catalog-startup.perf.ts`.

Static review confirmed the same canonical authority, preserved-table registry,
package dependency direction and journal commit boundary. Full-catalog staging
and cooperative maintenance remain; this batch does not implement the OS owner,
old-writer isolation, incremental rebuild or Ready capability. The inherited
current-catalog comparison checks the complete Prompt graph and generic resource
manifest rows; independent drift inside other domain SQL projections is still
part of T-FOUNDATION-003/004, not proven absent by those hashes. Whole redesign
release gates remain open. No live data or user processes were changed.

## Remaining required implementation

1. OS root ownership, authenticated Desktop/CLI IPC and old-writer isolation.
2. Complete command/receipt/UnitOfWork integration and runtime readiness.
3. Incremental resource publication and interaction-performance acceptance.
4. Conditional remote HEAD, independent namespace, immutable manifest history,
   three-way sync, tombstones, device expiry, pinning and retention.
5. Normalized Worker online records and verified snapshot conversion.
6. Persistent job attempts and fencing of late Provider/deployment results.
7. Condition coverage, historical migrations and native/remote release gates.

The current v5 pointer still lacks CAS and immutable manifest history. Immutable
objects alone do not provide multi-writer sync safety. Timestamp-based automatic
sync direction remains legacy behavior until its replacement batch; audit A07
and the complete accepted architecture are not claimed resolved.

## Worktree and cleanup

Existing Prompt version/tag, Skill bundle and sync observability edits were
preserved. AGENTS Skill authority text was corrected to the accepted canonical
boundary. Task-owned test processes and fixtures are cleaned; no server is kept.
Small test/design/evidence artifacts remain for review. Temporary coverage output
is removed after its summary has been recorded. Batch 2 quick output is condensed
to result metadata, test totals and the actual governance failure. No task-owned
process or service remains running.

## 2026-09-24 — Migration-only renderer boundary

Renderer Prompt/Folder/version/graph
operations now require the current bridge. Historical IndexedDB conversion lives
under services/migrations, opens sources read-only, compares source content after
import, preserves source files and propagates failure. A legacy browser done flag
is not verification evidence. Startup errors retain an error screen instead of
timed UI release or automatic sync.

Backup graph restore now requires one current atomic endpoint. Web implements
that endpoint with scoped SQL transactions, ownership checks and complete graph
validation; summary reads implement the current bridge contract. This batch does
not retire Core canonical-file authority, migrate all settings to SQL, remove
read-time MCP/Plugin/Rule conversion, or establish the complete 0.6.0 baseline.

Verified from an exported Git index, without unrelated worktree changes:

- Desktop: 48 focused cases across renderer-to-real-SQLite CRUD/version/relation/reopen,
  historical conversion, backups, persistence and readiness error propagation.
- Web: 19 cases across bridge, real SQLite graph restore/rollback and an authenticated
  HTTP route round trip, including malformed input, broken references and unauthorized access.
- Core: 17 renderer migration/marker cases. Legacy browser flags are not accepted as proof.
- Desktop and Web `pnpm exec tsc --noEmit`: passed. Scoped Desktop ESLint and
  `git diff --cached --check`: passed.

The SQLite round trip found and corrected `createVersion` returning an undefined
note while reopening returned null. No browser/Electron transport is claimed by
that test. The IDB tests model its request callbacks; real historical-client profile,
Electron UI and complete 0.6.0 migration acceptance remain pending.
