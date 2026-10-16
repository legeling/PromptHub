# Historical runtime source samples

These are synthetic profiles created by unmodified, local Git source objects.
They exercise fresh CLI/Core default initialization and normal domain writes,
then close and reopen the same profile in another process of that exact source.
The samples do not establish any current-version upgrade or authority migration.

| Source | Exact commit | Runtime mode | Schema version |
| --- | --- | --- | --- |
| v0.5.9 | `1e933ae29726361982c5ce7b49bc4f4c6da326ba` | Core default database | 0 |
| beta.1 | `494d57d7da654b8380e4b81f8f51fc5c72e6b7f7` | Core default database-catalog | 3 |
| beta.2 | `b7854508c3c69eb99cc2d1b6207db02ce5a25ddc` | Core default database-catalog | 3 |

Each profile contains two Prompts, a Folder, Prompt versions, notes, a synthetic
AI response, a relation and output format, a complete Skill package with text
and binary files and two revisions, project Rule content and two revisions,
and non-secret AI configuration. No provider request is made. The beta profiles
also contain two active Agent provider profiles and a complete Plugin package
with history, plus MCP configuration written and updated through its library
service. beta.1 uses distinct provider names; beta.2 preserves two active
profiles with the same name, as allowed by that source's writers and schema.

Each `.tar.gz` contains only `profile/`, including synthetic import sources.
Its JSON manifest records all regular files and byte hashes, the full SQLite
schema/index/trigger definitions, FK declarations, every table row, migration
rows, `user_version`, old-runtime reads before and after reopening, resolved
source modules and their hashes, and loaded third-party package versions.
Source roots in these records are temporary generation paths, not deployment
targets. They are retained as provenance and have been cleaned up. Future
upgrade tests must use the application's explicit relocation/import contract;
they must not silently rewrite source fields or pretend these paths still exist.

## Rebuild

From the repository root, using the existing compatible dependencies:

```sh
pnpm exec node packages/core/tests/fixtures/historical-runtime/generate.mjs
```

To rebuild selected sources, append `v0.5.9`, `beta.1`, or `beta.2`.
The generator uses read-only `git archive`, creates one temporary parent,
extracts the three historical packages, and links their workspace imports
only to those historical packages. Installed third-party dependencies are
reused; missing dependencies fail without installation. The loader rejects
workspace source resolved outside the historical export. Every child has a
60-second deadline and bounded output; temporary roots are removed in `finally`.

Rebuilding replaces the owned sample archive and manifest for each selected
source. IDs and timestamps come from the historical writers, so rebuilt bytes
are not expected to match a previous run. The manifest describes the exact new
bytes and semantic observations. No historical source, Git checkout, branch,
current schema or product setting is edited.

## Source-sample verification

```sh
pnpm --filter @prompthub/core run test tests/historical-runtime-fixtures.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
```

This test is selected by the Core package's normal test command. It verifies
resolved old-module hashes against the exact Git blobs in one bounded batch
per source, the archive's hash and complete file inventory, and independently
opens the saved SQLite image read-only to compare all rows, schema, migrations
and FK declarations. It checks representative nonempty domain data and the
beta.2 duplicate active profiles. It never invokes a current initializer or
runs an upgrade. Source generation itself proves the old writers and reopen;
the test proves the retained sample has not been lost or changed.

## Uncovered source modes

Current Core upgrade coverage is maintained in
`../../historical-runtime-upgrade.test.ts`. It regenerates these same sources
in temporary roots and upgrades each profile in place, preserving absolute
paths instead of rewriting the retained archives. Three normal upgrade/edit/
reopen cases and three transaction-failure/retry cases passed on 2026-10-14.
Run it with the normal Core test entrypoint:

```sh
pnpm --filter @prompthub/core exec vitest run tests/historical-runtime-upgrade.test.ts --minWorkers 1 --maxWorkers 1
```

The following source-mode limits still apply.

- Desktop canonical startup requires its renderer migration and checkpoint
  publication. These CLI/Core samples do not handwrite authority or layout
  markers to imitate that startup. A genuine Desktop source sample is a
  separate batch.
- MCP bundle history is not generated in these beta samples' default
  database-catalog mode. This is an uncovered mode, not a claim that the beta
  products cannot represent MCP history.
- Ordinary Desktop Settings IPC, secret vaults, installed distributions,
  external suppliers and native Agent consumption were not executed.
- Continuous cross-version upgrades and the current D3 target migration
  remain separate acceptance work.

Generation uses Node 26.7.0 and tsx 4.21.0. The manifests record actual loaded
data dependencies: node-sqlite3-wasm 0.8.53, uuid 13.0.0, yaml 2.9.0, and
ignore 7.0.5 for the beta sources. Only synthetic public configuration and empty
API-key fields are stored. Sample inspection/hash cost is linear in the small
retained file and row volume; no throughput or large-profile claim is made.

Initial generator failures were fixture issues: macOS `/var` versus
`/private/var` path identity, a `rowid` assumption for an FTS table, and an
incomplete one-Skill Plugin input. The generator now canonicalizes its own
temporary root, sorts complete SQL rows without assuming `rowid`, and supplies
a Skill plus command Plugin package. No old source was patched. The first
successful samples contained one Skill history entry; a second original
snapshot was added before the guide revision, and all three samples were
regenerated. These setup corrections are not product regression evidence.
The first retained-sample check compared SQLite BLOB Uint8Arrays directly with
their JSON numeric-key objects and failed all three samples. The verifier now
compares the same JSON representation, retaining every byte; no BLOB table or
field is excluded.

## Retained-sample results (2026-10-09)

All three exact source runtimes generated and independently reopened their fresh
profiles. Each archive is 20,480 bytes; retained file/module/migration counts and
actual generation process evidence are below. Detailed child commands and
exit codes are in each manifest.

| Source | Archive bytes | Profile files | Loaded source files | Legacy migration rows | user_version | Seed/reopen PID | UTC seed start → reopen end |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v0.5.9 | 20480 | 14 | 63 | 6 | 0 | 41691/41719 | 2026-10-09T03:51:52.520Z → 2026-10-09T03:51:53.855Z |
| beta.1 | 20480 | 25 | 111 | 12 | 3 | 41802/41805 | 2026-10-09T03:51:53.973Z → 2026-10-09T03:51:54.861Z |
| beta.2 | 20480 | 25 | 112 | 13 | 3 | 41881/41883 | 2026-10-09T03:51:54.935Z → 2026-10-09T03:51:55.749Z |

The normal Core test command selected all three new fixture cases: 3/3 passed
(2026-10-09 11:54:24 Asia/Shanghai, 501 ms; execution session 65606 exited 0).
All 286 loaded source hashes were independently compared with the specified
Git blobs; all 64 profile files, SQL rows, BLOB bytes, schema and FK declarations
matched. The earlier verifier run failed three cases on BLOB representation
(session 97168); its JSON representation correction is documented above.

Targeted ESLint for the new test and four owned MJS files passed (session 94346
exited 0). A temporary scoped Core tsconfig included only the new fixture test
and its imported storage dependencies; tsc --noEmit passed (PID 43427,
03:55:04.032–03:55:04.757 UTC). The temporary config was removed. This does not
report whole-package typecheck, product build or release harness results.

Resource inspection confirmed all recorded source-generation children exited,
all generation/extraction roots and scoped configs were absent, and no process
or port was retained. Historical source exports, including the interrupted
October 5 inspection export, were removed. No installation, network call, GUI,
Git mutation or current product source change was performed in this batch.
