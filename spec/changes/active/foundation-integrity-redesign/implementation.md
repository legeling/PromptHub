# Foundation implementation status

## Product

Shared

## Status

in progress

### BC01 repair (2026-10-14)

Plugin normal reads no longer delete historical metadata. The shared
`plugin-metadata-v1` migration is called by both Core and Desktop database startup.
It preserves distinct entries and histories, compares conflicting identities and
package bytes, saves the exact original metadata, and retires old metadata through
the existing publication journal. The unused MCP cleanup wrapper is removed.
The storage authority redesign remains incomplete; this repair changes no domain
authority or schema. Recovery behavior is defined in
`spec/knowledge/behavior/data-recovery.md`.

Focused verification: 25 Core Plugin cases and Core typecheck passed; two Desktop
database-entrypoint cases passed, covering coexisting sources, history, two reopens
and preservation on conflict. The first Desktop conflict fixture used the wrong
field (`notes` rather than `userNotes`); correcting the fixture produced the
expected integrity error without changing production conflict behavior.

The rebuilt, signed ARM64 DMG was installed into a task-owned directory. Native
UI displayed both the current and historical Plugins, the original version note
and binary snapshot, and the Chinese package file. A favorite write persisted
across two manual cold reopens. File readback verified exact binary bytes, one
source recovery copy and retired old metadata; all three starts reached
window-ready without startup errors. Evidence is retained in
`output/plugin-metadata-repair-20261014/native-acceptance.json`. The app was quit
normally after validation. This is a synthetic coexistence upgrade fixture, not
a complete stable-release upgrade or production automatic restore-relaunch test.
Signature validation passed; Apple notarization and Windows acceptance remain
open. Refreshed release verification covers all 40 registered checks: 33 passed
before the session interruption, then the seven unfinished checks passed through
the existing executor with unchanged registry commands/timeouts. All 2,581
candidate source/test/configuration hashes remained unchanged. Evidence:
`output/plugin-metadata-repair-20261014/release-combined.json` joins the original
success log with the resumed report; the interrupted process did not emit its
final JSON. Updated spec checks pass. Task-owned installed copies, profiles,
mount and package staging were removed after preserving readback, startup logs,
screenshots, DMG and ZIP; no acceptance app remains running.

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

Graph restore reuses the existing archive-import byte limit rather than the
ordinary JSON request limit. An authenticated route test restored 12 prompts and
their versions (over 2 MB), then read the content back successfully. The affected
Web typecheck and scoped ESLint passed on the staged snapshot.

## 2026-09-28 — Historical Skill internal-package startup migration

The historical canonical Skill exporter included `.prompthub/translations/`
files as package payloads. The current Skill reader rejects internal package
roots, preventing startup workspace reconciliation. Two bundles in the reported
profile contain four such payloads; version snapshots are unaffected.

`skill-package-internals-v1` runs before Desktop selects catalog reconciliation
or Prompt recovery, under the existing storage maintenance lock. Core catalog
reconciliation runs the same idempotent step under its existing maintenance and
database migration locks. It verifies each
affected source, preserves its complete original bundle under
`recovery/skill-package-internals-v1/<bundle-directory>/<source-hash>`, then
publishes a bundle without `.prompthub/` package payloads using the existing
publication journal. Metadata, history, actual package files and unknown manifest
fields remain intact. The strict business reader validates staged and published
results. Invalid hashes, symlinks, unknown roles or other schema errors stop the
upgrade without falling back. This is a targeted historical data repair; it does
not complete the broader SQLite-authority redesign.

The versioned step records its source hash in manifest provenance. It scans
bounded manifests on reopen, performs full byte verification/copies only for
affected bundles and does no rewrite once current. Work is linear in manifest
entries plus affected package bytes; copies use filesystem operations rather than
loading all packages into memory. Recovery storage retains one full original per
affected source hash. A publication failure rolls back through the existing
journal; successful bundles remain independently migrated if a later bundle fails.

Recovery: stop all writers, preserve the repaired bundle, restore its complete
original from the verified recovery directory and rebuild the derived catalog
using a source-compatible application. Do not restore historical bundles into the
current business reader without running the upgrade step. Recovery archives are
retained, not automatically deleted. Restored historical roots use the same
catalog reconciliation entrypoint.

Validation: Core catalog/schema/migration tests passed (32 + 4 + 5 cases),
Desktop startup routing passed (16 cases), and Core/Desktop source typechecks
passed. The routing test replaces the Prompt repairer and proves migration
ordering, not the repairer's implementation. Real SQLite/filesystem tests cover
catalog rebuild, workspace hydration, metadata/history/binary preservation,
read/write/reopen, repeated execution, publication rollback, corrupt bytes and
symlinks. The longer fixture and end-to-end test keep the full historical input
and assertions together so the data-preservation contract remains reviewable.

On the reported profile, two migrated bundles retained 25 metadata/history/package
files byte-for-byte; all four internal payloads were verified in their original
recovery bundles. A separate unregistered single-file legacy workspace was moved
intact to recovery/unregistered-skill-workspace-20260928 after confirming no SQLite
repo path referenced it; its SHA-256 was unchanged. This was profile recovery,
not a general loose-workspace migration. Loose directories stay outside this
migration's recognized bundle scope. The existing Prompt recovery subsequently
reported self-healed and retained its own full recovery artifact.

The repaired Desktop startup reached `startup:window_ready` on 2026-09-28.
Its initialized workspace reported 127 Prompts, 10 folders and 140 versions.
This confirms the startup error was cleared; interactive GUI workflows were not
automated or accepted. The single development instance remains available for
manual use. Desktop scoped ESLint and diff whitespace checks passed.


## Rule historical-read removal (2026-10-14)

BC07 conversion moves from normal Rule materialization to explicit startup/import bootstrap. Legacy JSON is parsed once per file, merged by Rule/version identity, and published with exact recovery copies and source retirement using the existing entry publication journal. Existing content takes precedence; conflicting IDs, cross-Rule identity ownership and malformed input fail before publication. The existing publication commit callback applies all Rule records/versions in one SQLite transaction; a database failure rolls the file publication back. Migration preserves all old versions, without applying ordinary edit retention. Runtime source normalization for supported external imports remains unchanged.

The batch does not complete SQLite authority conversion: Rules still use the current bundle publication and projection contracts. No schema or new host/lock framework is introduced. Expected work is O(source bytes + versions log versions), with one in-memory migration batch; normal reads no longer scan every historical file for each Rule. `prepareRule` exceeds the usual function-length guideline to keep the complete per-Rule migration plan together: content precedence, version preservation and the publication targets are reviewed as one unit. Both supported historical storage layouts exercise that plan in the migration suite.

Verification: 32 migration cases pass across both historical layouts, including malformed input, conflicting identities, more than 20 versions, retirement failure, SQLite failure, retry, completion recording and repeated startup without resurrection. Related Rule schema/catalog/detached-service checks, 11 CLI entrypoint/import/workspace checks, 32 Desktop workspace/Rule DB checks and 16 Rule import/scoped-rule checks pass. Core test types, CLI types, Desktop types, the production Desktop build, root lint/file-size checks and spec governance/index/traceability pass. Evidence for the final migration suite and CLI checks is under `output/rule-history-repair-20261014/`.

The signed ARM64 packaged app was launched without the E2E override using an isolated macOS application-data root. Native UI showed the preserved old Chinese history and current body; a real editor save produced a third version. A full ZIP export, subsequent Prompt edit and import triggered the production automatic relaunch (PID 31325 to 31946). The new window displayed the original Prompt at version 1 and all three Rule snapshots. Readback verified SQLite integrity, retired legacy input, its exact recovery copy, and the changed Prompt in the pre-restore safety backup. A further cold start and export allowed favorite writes and editor opening. An earlier post-export UI observation was inconsistent with the captured picture and did not recur; it is not classified as a confirmed product defect. Native evidence: `native-acceptance.json`, `native-readback.json`, `native-startup.jsonl`, and `native-restored-*.jpg` in the same output directory. All four app processes exited normally; task-owned package staging and profiles were removed after preserving evidence and the original ZIP. This is synthetic migration and restore coverage, not full stable-version upgrade, Windows or notarization acceptance.

## Historical Core upgrade acceptance (2026-10-14)

`packages/core/tests/historical-runtime-upgrade.test.ts` generates v0.5.9,
beta.1 and beta.2 profiles with their exact historical Core/DB/shared sources,
checks old-process reopen, then runs the current Core initializer in the same
temporary root. No saved fixture or embedded absolute path is rewritten.
Current public readers compare the original Prompt graph, versions, notes,
AI responses, complete Skill package, Rule history, configuration and applicable
Plugin/Agent/MCP records. Current edits and two database close/reopens exercise
ordinary consumers after upgrade. Synthetic MCP keys replace only the OS
keyring; actual credential encryption and SQL persistence remain exercised.

The complete lifecycle test exceeds 50 lines to retain the causal link from
historical generation through upgrade, edit and reopen; source preparation,
consumer observation and editing are separate helpers. Profile hashing is
linear in file bytes. Children are sequential, bounded to 60 seconds each,
reuse installed dependencies, and all temporary roots are removed in cleanup.
This covers historical default Core storage, not Desktop canonical profiles,
installed binaries, cross-platform migration or the pending SQLite authority
conversion.

Validation: all three direct upgrade/edit/reopen cases passed. All three
pre-commit failure/retry cases also passed in a separate focused run: failed
initialization exposed no database handle, preserved every historical table,
row, schema definition and user_version, and left all original non-DB files
byte-identical. Retry restored normal readers with the original records.
Initial failures were fixture expectations (new optional Skill fields and a
duplicate explicit Prompt snapshot after automatic versioning); no production
code was changed to satisfy them. Evidence is in
`output/historical-upgrade-20261014/`. The test and its imported source graph
pass scoped TypeScript checks. Root-based targeted ESLint (including no-any and
unused-symbol checks), file-size and spec governance/index/traceability checks
pass. An initial lint invocation from the Desktop directory ignored the Core
test; only the successful root-based invocation is counted. No production
source changed for this acceptance batch.

## Settings startup readiness (2026-10-14)

`loadSettingsFromMainProcess` previously treated a missing settings bridge or
null response as successful completion. A scalar/array response could proceed
through default merging and writes. The loader now rejects those invalid
responses before changing renderer state or publishing settings. Its existing
App startup caller propagates the error into the startup error state before
database fetching and periodic synchronization registration. Valid object
snapshots and existing field normalization remain unchanged; no historical
conversion or new storage format is introduced.

Validation: 73 existing settings/readiness cases pass; the nine new current
snapshot, missing bridge, malformed response and storage-failure cases pass in
a subsequent focused run. Initial new-test failures came from a language mock
that did not preserve the real Promise-returning contract; the fixture was
corrected without changing production language handling. Scoped test/source
types and targeted lint pass. Evidence is retained beside the historical
upgrade results. These are loader/store contracts with a replaced IPC boundary;
the startup error screen was not exercised in Electron for this small batch.

## Settings replacement input preservation (2026-10-15)

The three renderer replacement IPC handlers previously converted null settings
to an empty object and non-array marketplace/recovery inputs to empty arrays.
Malformed requests could therefore clear valid saved configuration. The IPC
boundary now rejects those shapes before calling persistence. Explicit `{}`
settings and `[]` collections retain their existing clear semantics; Core
continues to validate source entries and recovery paths. This changes no schema,
storage location or historical migration. Validation is constant-time before
the existing snapshot publication, with no extra I/O or network request.

`settings-replacement-validation.test.ts` exercises normal replacement and
explicit clearing through preload, and malformed requests through the registered
IPC handlers. It uses real Core persistence, isolated files and SQLite, compares
configuration bytes after rejection and checks state after closing/reopening.
Electron message transport, the home path and native proxy application are
substituted by the existing integration fixture; no credentials or user profile
are used. All 36 new cases pass after correcting fixture import order so home
isolation is installed before app services load. The initial fixture failure
occurred before business operations and is not product regression evidence.
The 15 existing IPC/settings cases passed in the first run with the same
production change. Scoped TypeScript and targeted ESLint pass. Commands and
results are retained in `output/settings-replacement-20261015/`.

Regression sensitivity: a temporary Vitest transform loaded the pre-fix IPC
implementation from HEAD only inside the test process. The normal explicit-clear
case and five existing entry-validation cases passed; 30 malformed replacement
cases failed because the old handler returned success. Exit code 1 and those
business assertion failures are recorded in `before-fix.log`. The shared source
was never reverted. File-size, spec governance/index/traceability and whitespace
checks pass. This batch does not prove native UI or release-candidate acceptance.


## Agent Provider SQLite authority (2026-10-15)

Normal Desktop Provider CRUD now uses the existing DB repository directly. The
former canonical wrapper and its JSON-mirror tests are removed. Core and Desktop
bootstrap run agent-provider-sqlite-v1 before exposing the repositories. Stable
profile/mapping IDs, archived state and existing device secret references are
preserved. Same-ID disagreements stop conversion without replacing either source;
unique historical records are imported. Original bundles are retained under the
content-addressed migration recovery directory and retired through the existing
file publication transaction. SQL commit or file publication failure rolls back
and can be retried. Reintroduced bundles cannot resurrect deleted SQL records.

Catalog maintenance and Prompt workspace repair preserve the Provider SQL tables
before snapshots are copied, including their foreign-key relationships. A missing
or unreadable business DB now requires recovery; Desktop no longer replaces it
with a partial file-derived database. Explicit historical import is unchanged.
Portable ZIP keeps its public bundle format: complete exports reuse the verified
checkpoint, selective exports materialize bundles from SQL in an owned temporary
directory. This retains mapping identities without exporting the full business DB
or local secret references. Restore converts those bundles at the import boundary.

Verification is retained in output/agent-provider-sqlite-20261015/:

- Ten migration cases cover actual Core startup, two reopens, conflicting profile
  and mapping data, SQL/file failure and retry, deleted-record resurrection,
  malformed/symlinked sources, missing DB, and SQL snapshots during catalog repair.
- Core full run: 836 passed, 10 failed solely because two older Rule/Skill fixtures
  omitted the business database. Those fixtures now prepare an existing database
  before their file migration inputs; all 14 cases in those two files pass in the
  focused rerun. The other 832 cases were unchanged and were not repeated.
- Desktop startup/runtime: 19 cases pass; repair/checkpoint: 12 pass, including a
  new SQL Provider preservation case. Archive export: four pass, including SQL
  readback, public-format content, mapping identity and temporary-file cleanup.
- Seven real portable ZIP integration cases pass across two focused runs. They
  cover selected and unselected domains/settings, Provider plus Generation,
  injected publication failure, exact byte/identity readback and two startups.
- Scoped TypeScript, targeted ESLint, file-size and spec governance checks pass.
  Initial migration fixture double-close and obsolete JSON/raw-DB ZIP assertions
  were corrected; failed runs remain recorded and are not reported as green.

These are local Core/IPC/service and real SQLite/file/ZIP boundaries. No new
native GUI, Windows upgrade, notarization or frozen release-candidate acceptance
was performed. Prompt/Skill/Rule/Generation/settings authority convergence and
causal synchronization are still open; the eight Foundation gates remain open.

### Conditional remote transport (2026-10-15)

WebDAV and S3 now preserve opaque ETags through native GET/PUT, preload and
renderer adapters, and accept one validated create-only or strong-ETag update
condition. Precondition failures and concurrent delete/write conflicts are
reported without an unconditional retry. S3 operations release SDK-owned
connections after consuming response bodies and retain shared proxy ownership.
No database or backup format migration is introduced by this transport step.

Verification: `pnpm --filter @prompthub/desktop exec vitest run --maxWorkers=1
--minWorkers=1 tests/integration/remote-conditional-publication.test.ts
tests/integration/release-acceptance-data-recovery-webdav.test.ts
tests/unit/main/s3-proxy.test.ts tests/unit/services/webdav.test.ts
tests/unit/services/s3-sync.test.ts tests/unit/services/sync-backup-publication.test.ts
tests/unit/services/sync-backup-core.test.ts` passed 55 tests in seven files.
The six new cases execute real preload and native HTTP/AWS SDK against an
isolated loopback service, including two competing writers, stale update,
create-only collision, malformed conditions before IO and HTTP 409.
Scoped TypeScript and ESLint passed; initial check configuration had missing
type roots and a filename collision, then type checking exposed an E2E mock
return shape which was corrected. No hosted provider or native GUI acceptance
is implied. Automatic synchronization still needs verified provider capability,
common-base resource reconciliation and deletion propagation.

Core capability/publication follow-up: six Core tests passed, including an
ETag-bearing service that ignores conditions, probe cleanup failure, competing
publication, lost-acknowledgement readback and missing/weak ETag rejection.
Native integration expanded to eight cases; both WebDAV and the real AWS SDK
verify supported and ignoring loopback services and remove only their probes.
The affected native/WebDAV/proxy set passed 16 tests. Core strict TypeScript,
Desktop scoped TypeScript, focused ESLint with no-any/unused checks and file-size
checks passed. These primitives are not yet wired into automatic synchronization;
T-FOUNDATION-005 remains open. Evidence: `output/sync-conditional-20261015/summary.json`.

## Causal resource comparison (2026-10-15)

Core `causal-sync` now validates generation metadata and compares a complete local
inventory with a common base and the observed remote generation. Independent
resource changes merge; conflicting changes, deletion versus edit and dangling
references return diagnostics without a partial generation. Deletions retain
resource identity, previous content hash, revision, commit and device identity.
Unknown or removed history requires a new explicit baseline instead of allowing
an offline device to resurrect a deleted identity. The comparator is pure and
does not own business rows, network publication or local database application.

Verification: `pnpm --dir packages/core exec vitest run tests/causal-sync.test.ts
--minWorkers=1 --maxWorkers=1` passed 37 cases. Scoped TypeScript including the
test and ESLint with no-any/unused checks passed. The 10,000-resource case with
9,999 declared references completed comparison in 77.9 ms on this host; this is
not a network, storage or UI performance measurement. File-size and whitespace
checks passed. An initial ESLint invocation selected files outside its base
directory and failed with ignored-file warnings; the corrected root invocation
checked all four changed TypeScript files successfully. Evidence and source
hashes are in `output/causal-sync-20261015/summary.json`.

Automatic sync still uses its earlier timestamp-based orchestration. Complete
domain snapshots, SQL baseline/cursor persistence, object pinning, conditional
generation publication, local atomic application, conflict UI and device
acknowledgement/compaction remain integration work. This batch does not close
T-FOUNDATION-005 or establish release readiness.

## Local checkpoint capture consistency (2026-10-15)

Removed the Promise yield between local structured-data collection and package/
media materialization in the Desktop checkpoint projector. Its internal Rule
callback now returns synchronous local data; the single production caller and
existing test callers use the same contract. The public async result remains
unchanged. A regression starts projection, immediately edits the Prompt and
overwrites its image, and verifies the snapshot contains both original rows and
original bytes while the live workspace keeps both later edits.

Five focused projector/checkpoint/authority/startup/historical-upgrade files
passed 40 cases. All seven real portable ZIP integration cases passed, including
nonempty selected/unselected domains, Provider/Generation identities, injected
publication failure and two normal startups. Scoped TypeScript and ESLint passed.
Evidence is in `output/snapshot-consistency-20261015/summary.json`. These checks
cover the local service/preload boundary; Electron GUI and cross-process root
ownership are not established by them.

## Prompt canonical graph to SQLite (2026-10-15)

Prompt, Folder, version, relation and output-format repositories now use the
db package directly. The canonical Prompt coordinator and its mutation-time
JSON publication calls were removed. Core/Desktop bootstrap converts historical
graphs through `prompt-sqlite-v1`, preserving unique SQL and file identities,
rejecting conflicting identities/media, copying referenced media to runtime
paths, retaining a verified recovery copy, and committing rows plus completion
in one SQL transaction. Normal catalog maintenance explicitly retains the SQL
Prompt graph. Archived export/import still verifies its complete graph format.

Seven migration cases cover graph/media preservation, stable IDs, conflict,
publication rollback, SQL failure/retry, deletion without resurrection and
identical archive retirement. The actual Core startup/CLI path and Desktop
registered IPC tests check edits, deletion, history, relationships, SQL failure
and reopen. Two added Desktop startup tests exercise the real migration and
reject an unreadable SQL image without attempting file reconstruction.

Verification: the full Core run passed 89 files / 895 tests. Desktop's initial
focused run passed 39 cases outside the startup fixture; replacing the startup
fixture's text placeholder with a real initialized SQLite image and adding two
cases produced 18 passing startup cases. The initial new migration fixture also
needed the real initializer, a valid parent reference and the adapter's null
result contract; all seven migration cases subsequently passed. Initial portable
ZIP acceptance exposed Plugin path migration's dependency on a retired Prompt
catalog. The fix preserves graph-declared-path validation when a historical
graph exists and independently verifies Plugin bundles when it does not. Its
nine focused cases and all seven portable ZIP cases then passed, including
nonempty domains, stable Provider mapping identities, Generation bytes/revisions,
selected/unselected settings, publication failure and two normal startups.
The Core full run preceded this final Plugin fix; the affected migration suite
and real portable integration were rerun after it, rather than claiming another
unchanged full run.

Core strict TypeScript, scoped Desktop/test TypeScript, scoped ESLint with no-any
and unused checks, file-size and spec governance checks passed. The 1,000-record
archive materialization measured 987.5 ms and a SQL edit 0.4 ms; the 10,000-record
SQL edit plus delete measured 25.9 ms, with 14,080 KiB maxRSS increase including
reopen/readback and a 7,258,112-byte database. These are isolated host service
measurements, not Electron interaction or cross-platform guarantees. The first
1k timing included archive verification in the edit interval; its corrected
measurement reran only that case. Exact commands, outputs and final source
hashes are under `output/prompt-sqlite-20261015/summary.json`.

Legacy Markdown workspace startup merge, the remaining file-backed domains,
root ownership, causal sync integration and the complete release harness remain
open. T-FOUNDATION-003/008 and 0.6.0 release readiness are not established.
Rollback requires preserving current data first and restoring a paired complete
pre-migration safety point and historical graph in an isolated root; copying
old JSON into the writable upgraded root is not a supported rollback.

## Prompt historical Markdown conversion (2026-10-15)

Core/Desktop startup and catalog maintenance run `prompt-workspace-v1` after canonical Prompt conversion. Historical Markdown is merged once with identity conflict detection, a byte-preserving recovery copy, SQL completion and journal rollback. Restored empty databases remain empty. Normal IPC mutations and startup no longer publish or merge Markdown; explicit exports use the cache workspace. The codec is shared with explicit import/export. The shared codec retains long explicit field mappings to keep the supported historical format reviewable; migration and explicit import/export exercise those mappings.

Fourteen real-SQLite migration cases pass, covering both historical layouts, nested folders, exact recovery bytes, represented fields versus SQL-only metadata, version locations, conflicts, SQL/file rollback and retry, unsafe IDs/symlinks, restored empty databases, and deletion/reopen. Desktop focused checks initially passed 53 cases; the strengthened Core/Desktop startup and codec cases subsequently passed 17 cases. Full Desktop/test TypeScript and scoped strict ESLint pass. Initial verification caught a missed codec helper import, two mismatched test assertions against the adapter/error contract, unused test bindings, and a prior conditional-publication test narrowing issue; each was repaired without weakening data-preservation assertions. The full Core run passed 90 files / 911 cases. The broader Desktop run passed seven real ZIP restore cases, fifteen public Prompt/AI workflow cases, four historical SQLite rebuild cases and seven self-heal cases; one self-heal test still asserted that canonical files should overwrite SQL. It now exercises a stale resource index while preserving legitimate SQL edits and passed its focused rerun. No production assertion or recovery check was relaxed. File-size, spec governance and diff checks pass. Commands, logs and source hashes are recorded in `output/prompt-workspace-sqlite-20261015/summary.json`.

This batch closes Core/Desktop Prompt Markdown startup/CRUD dual ownership. Web Markdown, other structured domains, causal sync integration and complete native/cross-platform release acceptance remain open. No commit or publication is implied.

## Web Prompt SQLite authority (2026-10-15)

Web startup now invokes the shared one-time journaled migration with its explicit historical format. Tenant ownership, visibility, usage, AI response and nested version files are preserved; unknown owners fail without becoming ownerless. Normal Prompt/Folder/backup/import/sync writes no longer publish Markdown. Explicit workspace export uses the cache path and preserves complete staged publication. SQL imports no longer inherit physical Markdown path-length constraints. Prompt/Folder ownership changes are transactional, and direct overwrite checks the existing record owner.

Verification: 22 Core migration cases pass (14 Desktop-format and 8 Web-format); the Desktop startup suite passes 3 cases. The focused Web run passed 28 cases initially, with two test-contract mistakes (import success is 201; Folder readback uses the list endpoint). Corrected affected tests passed 10 cases, and the complete Web suite passed 79 files / 466 cases in 45 seconds. This covers authenticated Hono requests, real SQLite reopen, exact recovery bytes, unknown-owner rejection, same-ID ownership conflict, publication rollback/retry, explicit export preservation and deep SQL imports. Core/Web TypeScript, scoped strict ESLint, file-size and spec gates pass. The Web server bundle builds successfully. The initial Core lint invocation was outside its effective file scope; the recorded root-scoped strict invocation is the evidence. Commands, logs and source hashes are under `output/web-prompt-sqlite-20261015/summary.json`. No live service, browser or cross-platform deployment was exercised; other domains, causal sync integration and full release acceptance remain open.

## Stable-ID SQL updates and import preservation (2026-10-15)

Rule upsert and Prompt/Folder/Skill direct import now use primary-key conflict updates instead of SQLite REPLACE. Updating a parent no longer cascades into version history, nested folders, Prompt parent/folder links, graph relations or output-format items. Skill source uniqueness collisions fail without deleting the other identity. Full snapshot replacement retains its explicit deletion/transaction boundary. No schema or data migration is introduced.

Rule verification: four new disk/reopen and rollback cases plus 41 existing Core migration/placement cases pass; 29 Desktop workspace cases pass. Core source and focused test typechecks and scoped ESLint pass. An isolated copy using the old SQL fails three of four cases, including exact history-preservation assertions; the temporary copies were removed. Evidence: `output/rule-db-history-20261015/summary.json`.

Direct-import verification: five new Core cases pass after correcting fixtures to create Skill snapshots explicitly; the later fixture typecheck required the declared `is_favorite` field, and the two affected Skill cases pass again. Eight existing Core graph/Skill cases, 14 Web ownership/import/workspace cases, 14 Web snapshot/graph-restore cases and 141 Desktop DB/portable-ZIP cases pass. The Web direct-import flow uses authenticated routes and real database close/reopen. Web source/test typecheck, focused Core test typecheck and scoped ESLint pass. The initial Web command included a nonexistent backup-service test selector; three files actually ran, followed by the separate real backup/graph-restore suite. An isolated old-SQL copy fails four of five cases on Prompt history, Folder descendants, Skill history and source-identity conflict. Evidence: `output/direct-import-preservation-20261015/summary.json`.

No browser, installed application or cross-platform release was exercised. These fixes preserve relational state; they do not complete Rule/Skill/settings/Generation authority conversion or integrate causal synchronization.

## Version import conflict and truthful response (2026-10-15)

Prompt/Skill version import now compares stable identity, parent, ordinal and complete normalized content before accepting an existing row. Identical input is idempotent, including reordered JSON object keys; different content or ownership raises `VersionImportConflictError`. New rows are inserted and verified within one transaction. Empty optional text is preserved, and directly bound Skill version text rejects null bytes. Web maps conflicts to 409/CONFLICT without disclosing the conflicting record, and successful direct import returns the stored snapshot. Complete restore transactions roll back on a later conflict. This adds no schema, network request or compatibility mode.

Fourteen new Core cases cover exact retry, both unique identities, content and package-file conflicts, parent changes, late batch rollback, null-byte rejection, explicit empty strings, disk reopen and a thousand-version transaction. The focused run passes 35 Core and 8 Web cases. Importing 1,000 small version rows and repeating the batch took 149.8 ms on this host; this excludes database initialization and is not a cross-platform or large-package performance guarantee. The isolated old implementation fails 11 of the 14 cases, including conflict and rollback assertions; temporary mutated files were removed.

The full Core suite passes 94 files / 942 cases; full Web passes 80 files / 468 cases. Desktop Prompt/Skill DB and real portable-ZIP tests pass 97 cases. CLI workspace sync, historical Rules upgrade and import validation pass 10 cases. Desktop source/test typechecks, Web source/test typecheck, focused Core test typecheck, scoped ESLint and file-size checks pass. Exact commands, timings, logs, limitations and source hashes are in `output/version-import-conflicts-20261015/summary.json`. No installed-app GUI, remote provider or cross-platform release acceptance is implied.

## SQLite and file commit recovery (2026-10-15)

Joint publication previously committed SQL before marking the file journal committed. A process exit in that interval could leave new SQL references with rolled-back files. Schema v5 adds one operational receipt per publication key, written in the same transaction as business changes. Journal v3 records the bound database path; recovery verifies the exact operation ID before preserving or rolling back files. Missing/unreadable SQL, missing committed receipts and ambiguous prepared v2 SQL journals retain recovery material and fail. The shared owner rejects an uncommitted outer transaction and a mismatched database path. Existing Prompt canonical/Markdown, Agent Provider/settings and Rule history conversions now use this boundary. Catalog maintenance upgrades an older database before domain conversion and preserves receipt rows; pure SQL operations do not create receipts.

The final focused SQLite suite passes 11 cases, including real child exits before/after SQL commit, an earlier receipt for the same key, failed journal marking, missing database, repeated recovery, populated schema-v4 upgrade/reopen and a SQL-only follow-up after an uncertain joint commit. Prompt and both Rule-authority fixtures additionally exercise journal failure through their real migration/startup entrypoints. An isolated mutation that ignores the receipt fails three cases, including an old-file/new-SQL mismatch; temporary copies were removed.

Full Core passes 95 files / 955 cases. A later SQL-only follow-up case and its helper adjustment pass the affected 11-case suite and type/lint checks; the unchanged full suite was not repeated. Desktop's six-file run passes 84 cases and times out one real portable-ZIP case while Core runs concurrently. That exact case passes alone in 9.93 seconds with the original 30-second deadline; no timeout or product assertion was changed. Web's five related files pass 22 cases; CLI's three files pass 10. Core source/focused-test and Desktop source typechecks, root-based scoped ESLint and file-size checks pass. Initial harness option/type-root problems and outdated test typing were corrected; an initial outside-base-path lint selected no files and is not counted. Exact commands, logs and hashes are in `output/sqlite-file-commit-20261015/summary.json`.

This closes the observed SQL/file commit gap. Rule/Skill/settings/Generation authority conversion, causal sync integration and complete native/cross-platform release acceptance remain open. Recovery/rollback of schema v5 requires the paired pre-upgrade database safety point and files, not a manual version downgrade or receipt deletion.


## Core/Desktop/CLI Rule SQLite authority (2026-10-15)

Rule metadata, project bindings, version identities and ordering now live only in SQLite. Current and historical body files use `data/rule-files/`; empty current content and empty/deleted history remain independent. Normal reads preserve missing-file errors instead of deleting history or rebuilding SQL from JSON. File changes and SQL commit through the shared receipt publication. Batch import validates and commits together, new projects remain detached, and explicit save keeps its local commit if external deployment fails.

Startup converts legacy Rule bundles and workspace metadata once, preserves SQL-only fields and exact recovery sources, and rejects conflicting bodies/history. Catalog maintenance preserves Rule SQL. ZIP/checkpoint exports derive their Rule archive from SQL and managed files; archive document schema 2 supports independent current content and empty history. Rollback requires a paired pre-upgrade database and file backup. Scoped Claude identities use digest directories and directory publication to preserve legal long filenames; an added disk/reopen/delete case reproduced the temporary-filename overflow before the directory fix.

The full Core run passed 97 files / 968 cases before final reference guards and scoped-directory correction. Subsequent affected Core checks passed 42 cases for file-reference/history behavior, then 18 storage/migration/detached cases and 39 ownership/history cases for the directory change. The final Desktop run passed 38 cases, including 29 Rule workspace cases and all nine real portable ZIP cases. ZIP coverage includes complete history, removal of the current-history snapshot and removal of all history, with exact current body preservation through two normal startups. CLI workspace sync passed all five cases after correcting its outdated new-project binding assertion to the accepted detached contract; the other five CLI history/import cases had already passed.

Core source/focused-test and Desktop source/test typechecks, scoped ESLint, file-size, spec governance and diff checks pass. The initial run exposed absent-parent delete flushing; that confirmed publication bug was fixed with two focused regression cases. Initial type/fixture corrections and the scoped-filename failure are recorded alongside successful checks. Exact commands, durations and source hashes are in `output/rule-sqlite-20261015/summary.json`. This is service/registered IPC/renderer integration evidence, not installed GUI or cross-platform acceptance. Self-hosted Web Rule storage, other remaining domains, causal sync integration and full release acceptance remain open.


## Web Rule SQLite authority and tenant identity (2026-10-15)

Schema v6 adds `owner_user_id` to Rule and version composite keys and their foreign key. Existing local rows remain in the explicit empty-owner local collection; Web requires an existing authenticated user. Same public Rule/version IDs can belong to different users without overwriting or deleting each other. The schema rebuild preserves v5 metadata, references, ordering and history inside the existing initializer transaction and safety-point boundary. The new migration manifest checksum binds `rule-schema.ts`; rollback requires the paired pre-v6 database and files.

Web normal Rule CRUD now uses the shared SQL/file publication and point reads. Metadata/index JSON writers and per-record compensation were removed. History deletion preserves the current file. The one-time Web migration preserves the exact legacy tree, rejects unknown owners, conflicting SQL, missing content and symlinks, and retains all historical versions. Backup import applies Rule rows within its existing SQL work and publishes Rule files through the same receipt boundary. Existing Skill/settings/Agent file workflows still need their own convergence; this batch does not establish whole-backup atomicity for every domain.

The full Core suite passed 98 files / 971 cases. The full Web run exercised 82 files / 476 cases: 459 passed and 17 failed only because two existing acceptance files still asserted the retired `data/rules` layout. Updating those assertions to the current directory and adding raw tenant SQL readback produced 20 passing cases in both affected files, including a fresh process for every request. The unchanged 80 files were not rerun. Six new Web migration cases cover two owners, recovery bytes, SQL failure/retry, unknown owners, 25-version preservation, conflicting current data and a symlink. Authenticated CRUD and whole-batch rollback cases also pass. Two old mocked import-failure hooks were replaced by real SQL triggers while keeping their database/media rollback assertions.

Desktop's four-file run passed 47 cases, including historical database upgrades and all nine real portable ZIP cases; CLI's three files passed all ten. After binding the schema checksum and adding a scale fixture, all three tenant migration cases pass with Core source/test typechecks and lint. The 1,000-Rule / 2,000-version v5 migration took 89.9 ms, with 1,703,936 bytes RSS delta and a 1,536,000-byte database on this host; counts, references and foreign keys were verified. This measures metadata migration, not large body files, production load or another operating system.

Web source/test and Desktop source/test typechecks, scoped ESLint, server build, file-size and spec checks pass. Initial PRAGMA return-shape and validation-message assertions were corrected to the adapter/current contract. Exact commands, failures, corrections, timings and final source hashes are under `output/web-rule-sqlite-20261015/summary.json`. No GUI, installed application, paid provider or cross-platform release was exercised. Settings, Skill/Generation authority, causal sync integration, root ownership and complete release acceptance remain open.

## 2026-10-15 Web Settings SQLite authority

- Removed SettingsService's JSON fallback and read/write mirror. GET now only
  reads SQL plus defaults; updates, nullable clearing and backup imports remain
  transactional. Invalid stored JSON reports failure rather than changing type.
- Added startup `web-settings-sqlite-v1`: validates owners and historical files,
  preserves whole-snapshot SQL precedence, imports file-only users, retains exact
  source bytes with private permissions, and commits source retirement and ledger
  through the shared SQL/file journal. Unknown source fields remain preserved.
- Added authenticated tenant/reopen, source migration, SQL and file-stage failure,
  retry, repeated-start deletion, malformed JSON/fields, symlink, null-byte and
  prototype-key regressions. Removed the retired settings path from the current
  Web storage topology; the historical helper remains for conversion tooling.
- Default-only exports now use the Unix epoch as their unchanged settings
  baseline. This prevents an untouched snapshot from replacing later settings
  while preserving existing WebDAV pull and forced-import behavior.

Verification: first focused 4 files / 29 tests passed; the additional migration
failure/input cases passed in the full Web run. Full Web run 1: 483 passed and one
sync-contract failure exposed the missing default baseline. A proposed broad
missing-timestamp merge guard then passed 18 focused tests but full run 2 exposed
one WebDAV pull regression (483 passed). The final implementation retains the
existing merge contract and sets the exported default baseline; all 22 affected
sync/import/WebDAV tests pass. The other 79 files are unchanged since the full
run; no claim of a final all-green full rerun is made. Web source/test typecheck,
strict scoped ESLint and final server build pass. File-size, spec governance
(5 tests, index and 16 traceability changes), and whitespace checks pass.
Evidence is under `output/web-settings-sqlite-20261015/`.

This verifies in-process authenticated Hono requests, real SQLite/filesystem
rollback and disk reopen. The WebDAV transport suite uses its existing mocked
server-functions boundary. No GUI, installed application, real remote WebDAV,
cross-platform or overall 0.6.0 release acceptance is claimed. Desktop Settings,
Web device registry, remaining Skill/Generation authority and causal-sync
integration remain open.

### Renderer 辅助状态 SQLite 收敛（2026-10-15）

市场源、恢复路径和自部署设备 ID 改为现有 SQLite settings 的三个独立键；Core
读取器只读当前 SQL，普通设置 GET/SET 排除这些领域键。旧配置文件由
`renderer-state-sqlite-v1` 一次性转换并保留原始 recovery 字节；不同值冲突不覆盖，
失败同时回滚 SQL 和旧文件退出。设备身份保持稳定，显式清空在重开后仍为空。
工厂显式注入数据库，ZIP 恢复的配置更新和验证均打开、关闭暂存数据库。
首次 renderer 导入复用 SQLite 收据 publication，把配置文件与辅助设置一起提交。
纯解析函数抽出以供迁移和正常 SQL 入口共享；保护秘密的现有加密流程未替换。

验证：Core 3 文件 28 项通过（9 项新 SQL 所有权案例）；Desktop 5 文件 67 项通过，
新增接口所有权案例后重跑 3 个受影响文件 61 项通过。扩展 12 文件 70 项首次为
60 通过、10 失败：9 项 ZIP 夹具没有绑定刚初始化的连接，1 项隐私夹具仍要求已退出
的 Prompt JSON。修正这两处并补充另一工厂调用方后，3 文件 16 项全部通过：9 项
真实 ZIP 恢复、3 项隐私状态、4 项 Skill 组合，含两次启动。未重复其余 10 个未受
夹具修正影响的已通过文件；不把分批证据描述为最后一次全套全绿。

源码与测试类型检查、严格局部 ESLint、Desktop main/preload/renderer 构建、文件
行数门禁及 spec 5 项/索引/16 个追踪检查通过。第一轮新设置读取器错误地将 SQLite
无记录的 null 当成损坏值，已修正；Windows 文件句柄模拟限定为普通文件，目录
fsync 仍由共享 publication 的平台行为负责。测试建库放在一个事务中，最终 Core
焦点检查约 12 秒；这属于夹具成本改善，不是产品性能结论。临时测试类型配置最初
未找到 Node 类型根，补充现有依赖的 typeRoots 后通过。

证据：`output/renderer-state-sqlite-20261015/summary.json` 与完整命令日志。
没有新增依赖、GUI 操作、长期服务、Git 提交或发布；构建未替代打包、原生及
跨平台验收。应用/AI/同步设置、CLI 凭据共享及剩余 Foundation 领域仍待完成。

### 共享设备密钥与设置 vault 基础模块（2026-10-15，设置接入未完成）

系统 keyring 的延迟加载、32-byte 密钥验证与二进制编码抽到 `device-keyring.ts`，
MCP 仍使用同一服务名、原 AES-GCM 数据格式和错误代码。`settings-vault.ts` 定义
当前 vault v2：聚合秘密映射经 AES-256-GCM 加密，格式身份和 key ID 参与认证；
空 payload 不触碰系统密钥，已有非空密文缺失密钥时不生成替代品。

这是设置迁移接入前的安全边界验证，尚未改变应用设置或 CLI 的日常数据源。
6 个 Core 文件共 22 项通过，覆盖新加密/原生接口替身、MCP 原合同、历史升级、
迁移和快照恢复；源码、焦点测试类型与严格局部 ESLint 通过。未访问真实系统
keychain，未证明新 vault 的完整设置升级或跨端验收。证据在
`output/settings-vault-20261015/summary.json`。设置 SQL codec 和迁移接入仍待完成。

### 2026-10-15 shared application settings conversion

`CoreSettingsStore` now owns application, AI and sync settings in SQLite. Device
credentials remain in the AES-GCM vault; ordinary SQL values contain references.
Desktop general settings, renderer persistence, CLI AI configuration, startup
proxy application and GitHub token lookup use that owner. The historical
app/providers/sync/AI JSON files are retired by `settings-sqlite-v1`, with exact
source bytes and original SQL values preserved in private recovery entries.
Electron safeStorage is used only to decrypt historical device vaults. CLI-only
upgrade of those vaults requires one Desktop upgrade; no redacted mirror or
plaintext fallback substitutes for a missing device credential.

Initial renderer migration commits auxiliary SQL state, settings, vault and the
completion marker together. Settings replacement preserves fields owned by
other modules. Main password verification material cannot be read or changed
through ordinary settings endpoints. AI upgrade-backup repair runs only before
the SQL upgrade ledger; explicit clears cannot be resurrected afterward.
Empty model routes use the established `{}` default before and after portable
restore. Historical nonempty CLI inventories retain their pre-renderer ownership.

Evidence is retained under `output/settings-sqlite-20261015/` as per-command JSON
and bounded logs. The initial Core run passed 49 cases; after route-default and
historical ownership corrections the five affected files passed 43 cases.
Desktop settings/IPC/startup tests passed after correcting unsupported test
matchers and a null/undefined expectation. Real portable ZIP recovery passed all
nine cases after fixing the empty-route contract. The broader Prompt/AI fixture
was corrected to inspect SQL rather than a retired JSON mirror; its affected
case passed. Five CLI AI cases passed across the initial and corrected runs.
Credential lookup and associated installer tests passed 47 cases, and real IPC
registration passed four. Source/test types, scoped strict lint and Desktop/CLI
builds passed at their recorded revisions. The final CLI help no-initialization
regression passed with all five AI configuration cases; Core source types and
the final CLI build and affected-file lint passed. The built CLI successfully
ran help, providers, models and routes against an isolated fresh root; help
did not create a database and the three reads returned the empty configured
state. The temporary root was removed. Final documentation checks are recorded
in the same evidence directory.

The first scoped ESLint invocation ignored Core paths outside its working
directory; it is not lint evidence for those files. The corrected root invocation
explicitly selected and passed those files. Tests replace only the OS keychain
transport: real native keyring access, GUI workflows, Windows/Linux binaries,
signing and release publication remain unverified. This conversion does not
complete the remaining Skill/Generation/session authority and causal-sync work.

### 2026-10-15 session SQL authority boundary

Session sources, index annotations and conversation metadata already reside in
SQLite. They now have an explicit persistent session category in catalog
maintenance; the obsolete file-migration target is removed from the inventory.
No schema or identity migration is necessary. Source-scoped annotations and
Agent conversation metadata remain separate identities; full scans preserve
annotations on missing transcripts and maintenance copies their complete rows.

The new Core workflow covers two sources with the same external ID, annotation
updates, missing/reappearing logs, independent favorite/archive metadata,
planned handoffs, maintenance copying and disk reopen. Explicit deletion also
survives reopen. Core passed 61 cases across three files, and Desktop DB/scan
services passed 40 cases; source/test types and strict scoped lint passed.
Removing session preservation in an isolated module copy produced exit 1 at
the new retained-source/annotation counts assertion. The mutation copy and
temporary test were removed. Commands and logs are in
`output/session-sqlite-20261015/`; no native GUI or remote sync was exercised.

### 2026-10-15 Skill metadata and current-package SQL conversion

Core/Desktop/CLI Skill metadata, source bindings and version identities now use
SQLite. The sole managed package is `data/skills/<encoded-id>/files/`; normal
commands no longer publish metadata bundles or regenerate writable caches.
Explicitly linked external packages retain their path. Missing packages fail
without reconstructing files from a stale SQL body. CLI imports use temporary
operations staging and publish the complete package once. SQL/package changes
share the receipt journal, including deletion with an explicit CLI purge request.

`skill-sqlite-v1` checks metadata/history before adoption, preserves historical
bundles, bindings and unpublished cache bytes in recovery, and retires original
sources in the same publication. Repeated startup cannot resurrect SQL-deleted
identities. Maintenance and portable restore preserve SQL ownership and local
bindings. Skill history payloads in SQL and Web Skill mirrors remain open; this
batch does not complete the full Skill authority requirement.

Focused real-disk ownership, lifecycle, migration, CLI and portable ZIP workflows
passed at the recorded revisions. Initial failures included old path/authority
expectations, a fixture import, and CLI test isolation; corrected affected checks
are retained separately rather than reported as one full-suite pass. The six
historical upgrade cases and nine portable ZIP cases passed. Removing cache
retirement in an isolated migration copy fails the new preservation regression.
Desktop/CLI builds, source/test types and scoped lint passed before the final CLI
delete/isolation correction; its follow-up evidence is recorded separately in
`output/skill-sqlite-20261015/`. Native GUI and full release acceptance remain open.

The delete/isolation follow-up passed 26 CLI cases, types and scoped lint. The
built CLI imported a complete package, changed and read files in separate
processes, updated metadata, deleted and reopened an empty library; its temporary
profile was removed. A full CLI run then passed 163 of 165 cases and exposed one
obsolete path assertion plus an actual explicit-restore error: complete incoming
packages were incorrectly rejected when the SQL row had no local path. Explicit
replacement now validates and publishes the supplied package without requiring
a prior package. The corrected 17 CLI export/import/output cases and 23 Core
package cases passed, including binary bytes after removing the original source.
This is full-run plus focused correction evidence, not a fresh full-suite pass.

Test isolation incident: one new CLI case initialized Core after `runCli` reset
runtime paths and therefore opened the user's real profile. The database and
retired Prompt/Agent files were restored from the first automatic safety point
and migration recovery. The database hash exactly matches that safety point;
402 Prompt inventory entries, four Agent bundles and 123 Skill bundles with
2,019 payload hashes were verified. The attempted Skill conversion rolled back
on a source-identity conflict. Task-created duplicate/recovery artifacts were
removed; the first safety point and private incident evidence were retained.
No user content was copied into the repository. The case now configures its
temporary root explicitly, and the CLI test harness rejects unconfigured direct
initialization. This was a real environment mutation followed by restoration,
not an untouched-environment run. The identity conflict remains an upgrade
boundary requiring resolution before release.

### Web Skill JSON retirement and atomic package publication (2026-10-15)

Web Skill CRUD now writes metadata and version records only to SQLite. Actual
packages use stable server IDs under `data/skill-files/<encoded-id>/files/`;
client paths are never dereferenced. Metadata edits do not enumerate or rewrite
other packages. Version creation captures the complete binary-safe package;
rollback restores its files. Package edits/deletes and backup restores use the
SQLite receipt publication decision. Backup matching uses stable IDs with
ownership checks, and stale Skill snapshots cannot overwrite newer package bytes.

`web-skill-metadata-v1` validates historical metadata, owners, entrypoints and
version ownership before replacing the old tree. It preserves the full source
and a database safety point, imports file-only records beside SQL-only records,
rejects conflicts and permits retry after a failed commit. Version JSON files
are excluded from the live package budget. Unknown users are not reassigned.
Current body/history blobs in SQL, other backup asset writers and causal sync
integration remain separate unfinished boundaries.

Evidence: `output/web-skill-sqlite-20261015/summary.json`. The first focused run
passed 32/33 cases; the remaining migration fixture incorrectly replaced the
existing default author with null and was corrected. Four migration cases then
passed. Web types found a historical timestamp union and passed after its
boundary normalization. The full Web run passed 484/486 cases across 84 files;
both failures asserted the retired name-derived filesystem limit. The updated
11 cases across those two files passed with long names, package bytes, related
records and media retained. This is an aggregate run plus focused corrections,
not a fresh all-green aggregate. The production Web client/server build, final
source types, scoped lint, 15 Core package cases and file-size gate passed.
The full Web suite included its existing real HTTP process/restart tests; the
new Skill workflow uses authenticated in-process Hono requests and real SQLite,
files and reopen. No browser or cross-platform acceptance is claimed.

### Generation SQLite ownership and portable recovery (2026-10-15)

Schema v7 and GenerationDB preserve full request snapshots, slot errors, revised
prompts and favorites in SQLite. Actual image bytes remain in generation assets.
Normal reads do not rebuild metadata from files, and listing a running batch no
longer interrupts it. Startup recovery is explicit. New images and SQL changes
share the receipt publication decision. The one-time migration validates historical
indexes, manifests and all existing image candidates, preserves recovery material,
and rolls back on late SQL failure. Portable archives materialize the existing
public bundle format on demand; restored candidates preserve both selected and
unselected SQL records and migrate transport bundles at startup.

Evidence: output/generation-sqlite-20261015/summary.json. Four focused Core files
passed 13 cases; cross-domain Core checks passed 45, and catalog reconciliation
passed 33. Desktop checks exposed obsolete path/index fixtures and a real restore
error that reimported retired Agent settings after their owner had converted them.
The fixtures and settings import were corrected and affected checks passed.
The portable integration run initially passed six non-Generation cases; after
startup reconciliation was corrected, two Generation success cases passed,
including two starts after restore. The failure/recovery case then passed after
its obsolete object-store assertion was replaced with an actual asset-byte check.
These are aggregate runs plus focused corrections, not a new all-green aggregate.
Final Desktop source/test types, scoped ESLint, production renderer/main/preload
build and whitespace checks passed. A 5,000-batch / 10,000-slot metadata read took
99.6 ms with a 31.2 MB RSS increase; 5,000 slots were successful outputs, and image
bytes were not loaded. Real SQLite, filesystem, ZIP and startup paths were
exercised; Electron transport was mocked. No GUI or cross-platform acceptance
is claimed. Skill history storage, causal sync integration and complete Foundation
release acceptance remain open.

### Persistent causal sync commit state (2026-10-15)

Schema v8 adds destination-local sync_targets for the common base and pending
operation metadata. Core CausalSyncSession fixes the complete local inventory
hash, candidate generation, observed strong ETag and operation identity before
publication. Conflicting plans do not advance the base. Confirmed completion
checks both the original inventory and the final applied inventory inside the
local SQL transaction. Failed application preserves the old base and pending
operation. Later local edits remain intact and require another comparison.

The Core publication entrypoint connects the persisted identity to the existing
conditional capability probe and HEAD writer. Uncertain replies survive reopen;
an exact remote candidate is acknowledged without a second HEAD write. Explicit
conditional conflicts retain the old base and competing remote bytes. Unsupported
targets are reported without a HEAD write. Catalog maintenance preserves local
sync metadata, while pre-v8 databases acquire an empty table transactionally.

Evidence: output/causal-sync-state-20261015/summary.json. The first focused run
passed 56/58 cases; two new assertions expected undefined instead of the adapter's
actual null and were corrected. Ten session cases then passed. Nullable-field and
discriminated-union narrowing were corrected for the Desktop type configuration.
The final full Core suite passed 111 files / 1,042 cases in 189.57 seconds, including
historical upgrades, deletion/conflict scenarios, failed migration/retry, late
SQL failure, persistent pending state, catalog maintenance and remote publication.
Core strict types, Desktop source/test types, scoped lint, production Desktop
renderer/main/preload build and 26 Desktop migration/checkpoint cases passed.
Spec governance/index/traceability checks passed. Remote storage in the new
publication tests is an in-process protocol fixture, not a real WebDAV/S3 service.

This batch does not switch automatic synchronization. File-changing application
requires a preflight before the existing publication swaps files, followed by SQL
and baseline completion in its receipt transaction; the current complete method
is SQL-only. Full domain inventories, file write-set integration, UI conflict
resolution, transport/device identity wiring and real provider acceptance remain
open. No user profile, browser, external endpoint or Git operation was used.

### Causal file application boundary (2026-10-15)

`CausalSyncSession.completeWithFiles` now joins the existing SQLite receipt
publisher. A preflight after staging and before target replacement checks the
original complete inventory. Domain SQL writes, final inventory validation,
baseline advancement and the publication receipt commit together. Failed staging,
replacement or SQL keeps the old baseline and pending operation; committed SQL
with an unacknowledged file journal recovers from its receipt. Empty file write
sets run the same preflight. No new storage format or recovery owner is added.

Eight new tests use real initialized/reopened SQLite databases and binary files
with a small fixture domain. They cover replacement/deletion, edits during
staging, late baseline failure/retry, incomplete application, partial rename
failure, empty file write sets, unconfirmed operations and receipt recovery.
The focused suite passed 38 cases; full Core passed 112 files / 1,050 cases in
206.35 seconds. Fifteen Desktop Skill IPC/checkpoint cases, Core strict types,
Desktop source/test types, scoped lint and spec gates passed. An initial test-only
TypeScript error was corrected by narrowing unknown SQLite rows before reading
fields. Evidence is in `output/causal-sync-files-20261015/`.

The fixture proves the shared commit boundary, not complete domain synchronization.
Actual domain exporters/write-set construction, automatic sync replacement,
conflict UI and real WebDAV/S3 acceptance remain open. No installed GUI or new
production build was exercised in this batch; the previous production build
preceded these changes.

### Domain causal-sync orchestration (2026-10-15)

The Core workflow pins deterministic immutable payloads, checks conditional-write
support before creating a baseline, validates domain payloads before publishing
HEAD, and applies SQL/files through the existing receipt. A remotely confirmed
operation can finish from pinned payloads while offline. Domain composition keeps
all registered domains in one commit and rejects resource types without an owner.

Implemented adapters cover Prompt graphs/history/media, complete Skill packages
and history, Rules with managed body/history files, Generation batches with
hash-verified outputs, and public MCP definitions/history/credential references.
Skill replacement preserves local `.prompthub` sidecars. Rule deployment paths,
MCP bindings and credential bytes stay device-local; missing MCP credentials use
the existing unavailable state. None of these adapters deploy external Agent files.

The final affected checks total 23 cases across workflow (8), Skill (5), Rule (2),
Generation (2), MCP (2) and publication (4). They exercise real SQLite and files;
only the workflow's remote store is a protocol fixture. Core strict source/test
types and scoped lint pass. Initial Skill binary conversion incorrectly used a
Uint8Array string conversion; the two failing cases and type error were corrected
using Buffer conversion, and all five Skill cases then passed. MCP reference
iteration was narrowed to its typed fields before its two cases/types/lint passed.
Two initial static-check commands failed due to tool/config location; corrected
commands use Core's tsc and Desktop's ESLint configuration. Logs are retained in
`output/causal-sync-workflow-20261015/` without overwriting failed-run evidence.

Historical acceptance was rerun from the exact v0.5.9, beta.1 and beta.2 source
fixtures: all six upgrade/edit/reopen and failed-upgrade/retry cases pass. This
is Core/process evidence; it does not prove packaged Electron or Windows startup.

Whole-workspace activation remains open: Plugin/configuration inventories, actual
automatic-sync routing, conflict/baseline resolution, encryption integration and
real WebDAV/S3 service acceptance are not yet complete. The old automatic entry
has not been switched to an incomplete inventory. Full release verification has
not run after this batch. No commit, push, package publication or user-profile
mutation was performed.

### Plugin SQL ownership and portable acceptance (2026-10-16)

- Schema 9 and `plugin-sqlite-v1` move Plugin metadata/version relationships to
  SQLite and current/history bytes to `data/plugin-files/`. Startup migration
  retains exact recovery sources and rejects retired input that reappears.
- Normal service reads/writes, rollback, package import, source updates and
  canonical backup projection use the SQL owner. Complete and selected ZIP
  exports materialize public Plugin bundles from the current owner.
- Verified: 6 tagged historical upgrade/reopen/failure-retry cases, 4 real Plugin
  storage/sync cases, and 64 desktop cases across Plugin services, selected ZIP
  export and the 9 multi-domain restore scenarios. The latter include two normal
  startups and injected publication rollback. Desktop TypeScript and scoped
  ESLint pass. Evidence: `output/causal-sync-workflow-20261015/plugin-export-*`,
  `plugin-marketplace-final.*` and `plugin-final-lint.*`.
- Earlier failures exposed outdated path assumptions, a rollback response that
  returned a cleaned temporary path, SSH source metadata filtering, and ZIP
  export still reading retired directories. Those paths now use the committed
  owner. Failure injection targets the actual data publication directory.
- This is source/runtime acceptance, not signed-package, Windows or remote
  provider acceptance. Full release verification remains pending automatic-sync
  entrypoint and explicit conflict-resolution integration.

### Complete desktop causal-sync entrypoint (2026-10-16)

- WebDAV/S3 startup, interval and save triggers now call the typed main-process
  causal workflow. The inventory covers Prompt graphs/media, Skill packages and
  history, Rule bodies/history, MCP definitions/history, Plugin packages/history,
  Agent provider profiles, Generation outputs, portable settings and marketplace
  sources. Credentials, machine paths and deployment bindings stay local.
- Explicit baseline and per-resource conflict choices carry an observation token.
  Changed observations require a new review. Both inventories are retained before
  resolution; retained recovery objects are hash-verified on reuse. Conditional
  publication archives the preceding generation. Unsupported destinations cannot
  run live sync. Explicit manual backups retain their existing formats.
- Existing AES-GCM encoding is shared by renderer backups and main sync; ciphertext
  ETags remain the conditional-write identity. Wrong passwords and modified salt,
  IV, ciphertext or tag are rejected. Unchanged sync does not rewrite media or HEAD.
- Real preload/registered IPC, WebDAV HTTP and S3 SDK tests pass for two independent
  populated profiles, all nine owners, encrypted S3, baseline adoption, conflict
  resolution, reopened database reads and secret/path exclusion. Electron delivery
  alone is mocked in those tests; the HTTP endpoint is a controlled local fixture.
- Isolated built Electron acceptance passes startup sync, explicit remote-baseline
  selection, rendered Prompt list refresh and two cold reopens. The test exposed
  optional undefined settings being sent to the strict persistence boundary;
  renderer extraction now omits unset fields. Its new real-SQL regression passes.
  The E2E is included in the root release smoke command. OS keyring transport is
  isolated by the existing test helper; native credential-store acceptance is separate.
- Commands/evidence: `pnpm --dir apps/desktop exec vitest run
  tests/integration/causal-sync-entrypoint.test.ts
  tests/unit/components/sync-review-host.test.tsx` (5 cases), corrected Core
  workflow/planner/publication (51 cases), workflow/recovery/encryption (13 cases),
  renderer persistence (15 cases), Desktop test/source types, scoped ESLint and
  Desktop production build. Commands run with
  `--config.verify-deps-before-run=false`; exact logs and initial failures are in
  `output/causal-sync-workflow-20261015/`. Electron command:
  `pnpm --dir apps/desktop exec playwright test tests/e2e/causal-sync.spec.ts`.
- Real WebDAV/S3 service endpoints, signed/notarized macOS and Windows upgrade
  acceptance are not established by these results. Current Skill/history SQL
  payload retirement remains a separately recorded storage-model gap. Full root
  release results must be recorded after the final candidate checks finish.

### Release harness correction batch — 2026-10-16

The first complete harness on the integrated sync/storage tree finished with 27
passed, 4 failed and 9 dependency-blocked checks. Core, CLI, Desktop integration
and Desktop smoke failures are retained in `output/release-sync-20261016.json`.
Static checks, builds, Web, Worker and mobile checks passed; this is not release
acceptance.

The correction batch initializes the database at the Plugin CLI entrypoint and
exports/restores current Plugin packages and complete histories through one Core
portable-bundle boundary shared with Desktop. Temporary staging is removed on
success and failure. Existing bundle import remains the explicit historical
boundary; runtime storage remains SQLite metadata and real package files.
Prompt graph validation precedes Plugin migration so a rejected Prompt graph does
not change the existing catalog. Antigravity link upgrade resolves the destination
from the current Skill record while recognizing historical managed link sources.

Rule acceptance uses historical metadata only as startup migration input. Valid
copies retire into recovery; unsafe legacy file links abort startup. Normal
removal operates on the SQL-owned managed directory and preserves external files.
Status scans probe each target once, update only changed SQL status and leave file
bodies/history untouched. Prompt smoke acceptance reads actual IPC records and
history after a cold restart instead of inspecting retired metadata JSON.

Causal sync validates unique Skill source identities before remote publication.
MCP final name swaps publish in one database transaction without deleting rows or
credential ownership; temporary names exist only inside that transaction. New
regressions cover both constraints. Verification of this correction batch is
pending.

The CLI cross-process version check exposed a create/read contract mismatch:
Plugin version creation returned device-local fields that persisted history
intentionally excludes. Creation now returns the stored version, so its response
matches subsequent history reads and cold CLI processes. The original complete
package/history equality assertion remains unchanged.

Portable Plugin restore parses archive bundles or the explicit historical
library/history plus package snapshot format. Historical machine paths are never
read as current file sources. Missing portable package bytes, unrecognized
metadata and mismatched library inventories fail before current storage changes.
Complete package/history snapshots publish through the same Plugin owner receipt.
The 1,000-Prompt startup benchmark now measures authoritative SQL edits surviving
reopen, retaining its existing time and memory ceilings; retired file metadata
must not overwrite those edits.

Release regression repair keeps existing managed Skill packages out of local
rediscovery, and uses the already initialized i18next instance in the renderer
sync service. Local Prompt workspace recovery preserves all non-Prompt SQL
owners and verifies them in an explicit local-SQLite context; portable checkpoint
verification continues to validate archive bundles. Tests use isolated on-disk
profiles and current SQL/file owner APIs, including real rollback fault injection,
malformed-history rejection, and detached imported project bindings. Discovery
fixtures follow the existing Reasonix config-preview and VS Code application
preset contracts without adding writable Agent targets.

Claude scoped Rule identities retain their nested native path while managed
packages use the verified identity's leaf filename; display names do not become
filesystem paths. Local recovery preserves device-linked Skill paths and verifies
Rule paths against the current `rule-files` owner. Plugin domain counts include
preserved SQL rows. The existing local-scan orchestration remains together to
retain per-directory error reporting; registered package paths are indexed once
and each discovered path is checked once, adding linear work and a linear set.

The second full release run completed 40 checks in 1,424.0 seconds: 32 passed,
eight failed. Core, CLI, Desktop integration and built Electron smoke passed;
the remaining failures were the obsolete catalog-rebuild benchmark assertion and
seven Desktop unit shards. After repair, the 22-file focused run passed 308/321
cases; affected reruns plus three added real managed-package IPC cases passed,
including the final eight self-heal cases. Source/test type checks and focused
lint passed, as did CLI snapshot roundtrips. Full release verification is being
repeated against the frozen repaired source; these focused results alone are
not a release-readiness claim. Skill SQL history payload retirement remains a
separate Foundation implementation gap, and real-provider/native-package gates
remain open.

Final frozen-candidate verification on 2026-10-16 passed all 40 release checks
in 1,442.1 seconds, concurrency two. The 2,657 source/test/configuration hashes
were unchanged. Results: Core 1,090; CLI 165; Desktop unit 6,147; Desktop
integration 324 passed/four existing skips; isolated built Electron smoke six;
Web 486; Worker 43; Mobile 38. All selected static/build/governance/performance
checks passed. Reports and source-stability evidence use the
`output/release-sync-verified-20261016` prefix. The release record captures exact
acceptance boundaries. Real-provider, current-candidate notarization, Windows
native upgrade and the separate Skill/history SQL payload retirement remain open;
this run does not claim complete Foundation or publication acceptance.

The historical Plugin import decoder keeps package inventory, history ownership
and archive-byte validation together so every imported path is audited before
publication. That boundary is intentionally one function despite exceeding the
usual 50-line guidance after formatting; dedicated malformed-path, incomplete
inventory, full-history and repeated-open tests cover it.


### Skill current/history file payload migration (2026-10-16)

`SkillStorageDB` now reads current text from the actual package and version payloads
from `<skills-root>/.prompthub/versions/<skill-id>/<version-id>/`. Core owns the
workflow; Web supplies its server root and prohibits client package paths. SQLite
keeps metadata, source bindings, stable version IDs, ordinals, notes and counters.
The nullable historical payload columns are cleared and protected from runtime
writes after `skill-payload-files-v1`. No normal read reconstructs missing bytes
from SQL. Missing current files retain usable metadata; missing history fails
explicitly. Historical packages stay outside normal Skill discovery.

The versioned migration follows the existing package/metadata upgrade, retains a
database safety point, stages complete text/binary history, and publishes files,
SQL retirement and its migration marker through the existing receipt transaction.
A failure before SQL commit restores prior files and SQL; a failure while recording
completion after SQL commit is resolved from the committed receipt on reopen.
Downgrade requires restoring the paired pre-upgrade database and package files;
removing migration markers or enabling retired writers in an upgraded root is
unsupported. External linked packages are read without overwriting their source.

Normal CRUD, version save/delete/rollback, direct import, causal sync, Web backup,
portable ZIP restore and historical catalog reconciliation use this owner. The
portable legacy SQL codec is confined to historical input and isolated transport
staging; accepted runtime roots convert before normal use. Whole-package binary
snapshots, absent versus empty snapshots, metadata and timestamps are preserved.

Migration scans metadata once, keeps historical identities in memory and decodes
one version at a time during staging. Work is proportional to files and bytes;
version lookups use the existing indexed identity. The migration and package
preparation functions exceed 50 lines to keep ordered validation/staging/commit
coordination visible in one boundary; their normal, linked, rollback, SQL-failure
and reopen paths are covered by the payload and package regression suites.

Affected verification is complete:

- Ten real SQLite/file migration cases cover populated old current/history data,
  complete binary snapshots, stable identities, two reopens, partial file failure,
  late SQL failure after payload clearing, committed-receipt recovery, linked
  sources, malformed/missing history and ordinary version rollback/deletion.
- Final full Core passes 125 files / 1,100 cases; full Web passes 84 files / 488
  cases. Desktop's selected Skill/storage/portable/sync unit suite passes 168 files
  / 1,639 cases; the later affected four-file rerun passes 83 cases, including the
  new history-discovery case. Desktop Skill integration initially passed 50/52;
  the affected nested-source suite passes all five cases after the missing-package
  metadata boundary was corrected. Overlapping reruns are not additive totals.
- The isolated CLI suite completes in 71.24 s with 164/165 passing; its sole failure
  expected a deleted package's former SQL body. The corrected metadata-only
  assertion and all 14 Skill CLI cases pass. The earlier concurrent 194 s run and
  30 s per-case timeout are diagnostic evidence; no budgets/timeouts were raised.
- Desktop/Web/CLI production builds, Core/DB/Desktop/Web/CLI source types,
  Desktop and focused Core test types, and scoped ESLint pass. The first lint
  attempt ignored 18 files outside its working directory; the final repository-root
  invocation checks all 27 selected files without ignored-file warnings.
- The final 64-version x 64 KiB binary-history fixture (4 MiB) migrates in about
  3.04 s and preserves every payload. The process high-water RSS increases by
  9,584 KiB during that sample; it is not a standalone peak-memory bound.

Initial aggregate failures also exposed raw historical fixture writers, missing
current-file metadata reads, catalog-reconciliation history adoption and Web
entrypoint frontmatter ownership. Fixtures now distinguish old input from runtime
writes; the owning paths are corrected and affected checks pass. Exact commands,
failures, reruns and selected source hashes are retained under
`output/skill-payload-files-20261016/summary.json` and its referenced logs.

This completes the recorded Skill current/history SQL payload retirement gap.
It does not rerun or inherit the earlier 40-check release claim for the changed
candidate. No GUI/native installation, remote-provider or cross-platform release
acceptance was performed, and no commit, push, tag or publication was made.

### Full release follow-up for Skill payload migration (2026-10-16)

The first complete follow-up exposed a missing Desktop startup invocation of
`migrateSkillPayloadFilesV1`. Desktop now invokes the shared migration after
`migrateSkillSqliteV1`, before Skill consumers start. Nine real portable recovery
cases verify current/history preservation, SQL retirement, failed publication
and repeated startup. The built startup-sync fixture explicitly disables the
application's default minimize-on-launch preference, retaining native visibility
and two-cold-reopen assertions; three consecutive focused runs pass.

The second full run encountered CLI/Web timeouts and Desktop integration exceeded
its deadline while other projects compiled. Budgets and business assertions remain
unchanged. After those tasks ended, run 3 completed in 1,581.7 s with 38/40 checks
passing and all 2,612 selected source/test/config hashes unchanged. Its four failing
cases belong to two Desktop unit files: the legacy layout fixture skipped product
database initialization; the package inventory did not include the new internal
history directory. Tests now enter normal startup and verify current/history,
retired SQL payloads, exact directory inventory and reopened readback. The layout
suite passes 15 cases and the package suite passes five; Desktop test types pass.
The first focused run exposed an incorrect new expectation that update history
contains the new body: the established contract snapshots the prior package for
rollback, and the corrected assertion checks that body while the current package
checks the updated body. Diagnostic reports are retained as
`output/release-skill-payload-20261016-run{1,2,3}.json`; no release readiness is
claimed from these failed runs, and no commit or publication was performed.

The corrected frozen candidate then passed all 40 checks in run 4, taking
1,543.2 s at concurrency one. All 2,612 source/test/configuration hashes remained
unchanged. Core: 1,100; CLI: 165; Desktop unit: 6,148; Desktop integration: 324
with four existing skipped tests in two skipped files; built Electron smoke: six;
Web: 488; Worker: 43; Mobile: 38. All static/build/bundle/performance gates pass.
Core took 257.0 s, CLI 59.7 s and Desktop integration 506.6 s, without increasing
budgets. Evidence is `output/release-skill-payload-20261016-run4.json`, its log and
source-stability report. This supersedes the failed follow-up runs for local
verification only. Actual deployed WebDAV/S3, current-candidate macOS notarization
and Windows stable-upgrade/two-start native acceptance remain unverified. No
commit, push, tag or publication was performed.

### Existing-profile native startup repair (2026-10-16)

The development launch after the full gate failed against the populated local
profile. The gate did not cover three historical states: distinct Skill IDs sharing
source IDs, a verified metadata-only Plugin plus a stale missing package locator,
and orphaned Prompt Markdown histories left after deletion. The prior unresolved
historical Skill identity conflict is addressed by this migration batch.

- Skill conversion keeps the established SQL source owner, detaches conflicting
  bindings, and retains every resource ID, package, version and original recovery
  bundle. With no established owner, all ambiguous bindings are detached. The
  selection uses maps and linear scans; the SQL uniqueness constraint remains.
- Plugin conversion retains the verified matching current record when the duplicate
  legacy locator is absent, including a metadata-only bundle. It does not claim to
  restore missing bytes. Metadata conflicts and differing extant bytes still fail.
- Prompt conversion archives orphan history bytes in the existing atomic recovery
  publication without synthesizing parents. Owners are resolved after all historical
  locations are merged; failure restores source files before retry.

Focused checks pass: three Skill collision cases, 31 Prompt migration cases,
17 Plugin cases, and 17 Desktop startup/layout cases. Core source and touched test
strict types, Desktop test types, six-file lint and production build pass. Diagnostic
fixture corrections and isolated-copy path/credential failures are retained in
`output/native-startup-repair-20261016/`; they are not successful startup evidence.

A private populated copy verified conversion and byte preservation. Its renamed
Electron test identity failed native legacy credential decryption, so no ready-window
claim is made for that copy. The normal development client using the original profile
then completed page loading at 06:44:10 UTC with successful credential/proxy reads.
SQLite integrity is `ok`: 118 Prompts and 128 versions are unchanged, 123 Skills and
515 versions remain, and one Plugin is retained. The six added SQL Skill rows were
previously file-only resources. All 1,381 current Skill package files, 2,019 Skill
recovery payloads and 135 historical Prompt files match their pre-migration bytes.
The pre-migration data/config/encrypted-secrets snapshot is retained under the local
profile's recovery directory. The private diagnostic copy is removed after checks.
The development server remains on port 5175 for the requested client session with a
four-hour process lifetime. The earlier 40-check result predates this repair; full
release/platform/provider acceptance is not claimed. No Git mutation or publication.

### 0.6.0 draft preparation (2026-10-16)

The draft candidate uses `0.6.0` in the root, shipped app manifests, Expo metadata
and standalone CLI identity. Seven localized product READMEs and the unreleased
changelog describe the candidate as unpublished. The website sync keeps public
stable metadata/downloads on `0.5.9`; screenshots and UI locales are unaffected.
Private shared packages retain `0.1.0`.

Desktop CI already creates Draft Releases and gates Homebrew/R2 on published
state. The self-hosted workflow previously pushed GHCR images on any version tag;
it now waits for `release.published`, with a regression guarding draft-only tags.
Manual dispatch remains an explicit maintainer action. No public promotion,
container deployment or stable channel change is included in this preparation.
The retained development process was stopped before freezing the candidate.
Fresh quick/full gate results and draft artifact state are recorded after execution.

The first fresh draft gate completed 37/40 checks in 1,826.2 seconds with all
2,675 selected source/test/config hashes unchanged. CLI failed one obsolete
beta-version assertion and its unchanged 75-second suite budget (94.9 seconds);
a Desktop workflow assertion still required tag-triggered image publication.
Those two assertions now follow the shipped manifest and the confirmed
published-release trigger respectively. Causal-sync E2E reached a visible window
initially, then recorded a minimized native window and correctly skipped startup
sync; its settings remained minimizeOnLaunch=false. The origin of that later
window change is unconfirmed, so product behavior and the test remain unchanged
for focused reproduction. Other Desktop integration, build, performance, Web,
Worker and Mobile checks passed. This diagnostic run does not authorize tagging.

Focused follow-up passes CLI lint/typecheck and all 165 CLI cases in 67.2 seconds
under the unchanged 75-second budget. Both self-hosted workflow cases pass.
The unchanged causal-sync E2E passes in 14.7 seconds, including baseline adoption
and two cold reopens; no window policy or timeout was relaxed. The initial timing
and minimized-window failures remain diagnostic evidence. The combined repaired
candidate requires a fresh full gate before tag creation.

All completed issue work included in the draft is recorded as release_pending.
The public changelog also includes remote Skill search, enabled-Agent Plugin
visibility, Option key identity and private-descendant Favorites filtering.

The repaired frozen draft candidate passes the complete release profile: 40/40
checks in 1,655.7 seconds (27m 36s), concurrency one, with all 2,675 selected
source/test/config hashes unchanged. CLI passes in 65.5 seconds under its original
75-second budget, Desktop integration in 529.5 seconds, all eight unit shards,
and built Electron E2E in 50.9 seconds. Core, performance, builds, Web, Worker and
Mobile gates pass. An independent pre-submission inventory/hash scan also finds
no added, removed or modified candidate source files. Evidence is
`output/release-0.6.0-draft-20261016/full-rerun.json` and its source-stability reports.

The first failed full run remains diagnostic evidence. No product source, window
policy, timeout or runtime budget changed between that run and this passing gate;
only the two obsolete test contracts were corrected. GitHub cross-platform
packaging, macOS notarization and Windows packaged upgrade checks remain pending
at this point. The authorized distribution state is Draft only.

Five scoped commits separate Agent parser extraction, Option shortcuts, private
Favorites filtering, the shared storage/sync boundary, and draft preparation.
Main and annotated tag v0.6.0 were pushed atomically at candidate 46c4d1ff.
GitHub Draft creation is confirmed with isDraft=true and isPrerelease=false;
assets remain pending after release workflow 38872008360 failed its Linux gate.
Existing issue fix commits automatically closed #237/#238; live GitHub state
confirms #236 remains open. Snapshots were refreshed from all 213 issues.
Temporary files and verification logs were excluded from every commit.

Linux CI exposed missing historical Git objects, an unavailable Secret Service,
a CLI runtime of 76.7 seconds against the existing 75-second budget and four
Electron smoke failures. CI preparation now fetches complete history, provisions
GNOME Keyring inside D-Bus and runs the unchanged full gate serially. The isolated
E2E keyring moves from post-launch evaluation to Node preloading so cold startup
and later mutations use the same test credentials. Product source is unchanged.
The repaired workflow must pass all checks and packaging jobs before artifacts
are uploaded to the existing Draft; the v0.6.0 tag is not moved.

The second Linux run (38873982980) passes 36/40 checks in 1,564.5 seconds,
including historical upgrades, Desktop integration and eight of nine E2E cases.
Two default-path unit fixtures inherited the runner's XDG configuration; their
expected platform environments are now explicit. Hidden-startup WebDAV used an
old IPC mock that does not intercept the current main-process transport; it now
shares the real local HTTP fixture with causal-sync acceptance. All 165 CLI
tests passed but the suite took 92.5 seconds against 75 seconds; subprocess
acceptance now builds one fresh production CJS bundle instead of recompiling
the TypeScript graph for every command. The build remains inside the budget,
README dev invocation remains covered, and all persistence assertions remain.
These are test-only repairs; another complete Linux gate remains required.

The complete Linux rerun (38878434851, e1665573) passes all 40 checks in
1,160.6 seconds. All 165 CLI tests pass in 49.5 seconds, within the unchanged
75-second budget. All nine built Electron cases pass, including hidden-startup
WebDAV and two cold reopens. The original
tag still resolves to 46c4d1ff; product source, package versions, lockfile and
Electron packaging configuration match the build commit.

macOS ARM64 packaging is blocked by Apple's HTTP 403 notarization response:
a required developer agreement is missing or expired. The other four matrix
jobs were cancelled. The Account Holder must handle the agreement before
macOS packaging can resume; signing/notarization checks are not bypassed.
The Windows x64-only rerun is immediately cancelled by the matrix state;
its packaged two-launch upgrade smoke remains unverified.
The GitHub release remains Draft with no assets; public stable remains 0.5.9.

After the Account Holder accepted Apple's agreement, attempt 3 logs successful
macOS notarization. Linux and Windows ARM64 packaging pass, but Windows x64's
second-start smoke still expects published rather than the current already-canonical
state. Both native launches reach window readiness and the required migration
states before the smoke-only clean exit. The assertion and workflow regression
are aligned with the startup owner; no product source changes. A fresh complete
gate and packaging run remain required. The matrix cancellation means the final
macOS artifact verification has not yet completed.

Workflow 38888080707 at 445672c8 passes all 40 checks in 1,500.2 seconds,
including all nine built Electron cases. Windows x64's packaged upgrade smoke
passes two launches; Windows ARM64 and Linux packaging also pass. Apple
notarization succeeds, but the first macOS attempt loses the network connection
during DMG ticket validation after the ZIP passes architecture, signature,
ticket and Gatekeeper checks. Two macOS-only reruns hit the same CloudKit
ticket-delivery network loss during stapling (-1005 / 68), cancelling Intel
jobs. These external failures do not justify changing signing requirements.
The full asset gate remains incomplete: Draft is retained with zero uploaded
assets, stable stays at 0.5.9, and the original tag is unchanged. Further
identical reruns are stopped until ticket-service connectivity recovers.

### Windows historical snapshot path correction (2026-10-16)

Native Desktop startup failed in `skill-payload-files-v1` because old Windows
history contained backslash-separated relative paths. The current shared
validator correctly requires slash-separated paths; the upgrade boundary had
not converted that historical representation.

Core's `migrateSkillPayloadFiles` now orders a separate
`skill-snapshot-paths-v1` correction before the unchanged payload converter.
Desktop, Core startup and legacy catalog adoption use this entrypoint. The
ownership, backup, transaction, retry and downgrade contract is recorded in
[Skills](../../../knowledge/behavior/skills.md#current-and-historical-payload-ownership-2026-10-16).
The correction implementation is
`packages/core/src/migrations/skill-payload-upgrade.ts`, SHA-256
`a177d62b1ce4a74fcfb151d27d64a45cc8651b3bfca0cf21f99d68fb48a4331f`.

Verification:

- `pnpm --filter @prompthub/core test tests/skill-payload-upgrade.test.ts tests/skill-payload-files.test.ts tests/skill-file-snapshot.test.ts`: 50 tests passed. The 12 new cases exercise real temporary SQLite/files, normal Core startup and two reopens, exact text/binary history, unsafe and colliding paths, SQL transaction rollback and publication failure/retry. Only the existing OS keychain test boundary is substituted.
- Core typecheck, Desktop `typecheck:tests` (including shared package tests), focused ESLint for all five changed/new TypeScript files, and `git diff --check` passed.
- `pnpm electron:dev` rebuilt the main/preload processes and opened a responding native PromptHub window with the existing local profile. Read-only diagnostics compared all nine historical versions and 27 files against hashes captured before startup; version identities, content and file bytes matched, and SQL payload columns were retired.
- Full release harness, remote providers and other operating systems were not exercised by this correction. Native startup is confirmed; broader interactive UI acceptance was not performed.
