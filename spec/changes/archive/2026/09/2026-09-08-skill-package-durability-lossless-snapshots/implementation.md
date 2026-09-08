# Implementation status

## Status

Completed locally on 2026-09-08; unreleased. Implementation, focused acceptance,
isolated submission validation and stable-document convergence are complete.

- Missing derived caches reuse verified canonical payloads during metadata publication;
  explicitly missing external sources fail instead of publishing an empty inventory.
- Managed file writes, renames, deletions and snapshot replacement stage a complete
  package, check canonical revision, then publish before touching the derived cache.
- Shared UTF-8/base64 snapshots preserve original bytes. Dedicated desktop IPC and core
  readers replace preview-based backup/version reads; desktop, CLI, Web and Cloudflare
  consumers retain and validate encoding. Binary diffs display byte metadata.
- Plain-text transport remains unchanged. Binary transport uses versioned file envelopes,
  CLI bundle version 3, canonical document schema 2, sync capability header 2 and a
  non-JSON prefix for raw WebDAV/S3 payloads. Old raw parsers fail before restoration.
- Legacy auxiliary-file snapshots are completed with their separately saved entrypoint.
  Unknown encodings, malformed base64, unsafe paths and over-limit packages fail closed.
  Historical preview placeholders are not guessed back into binary bytes.
- Atomic restore retains the old package on swap failure. A failed rollback retains a
  named recovery directory; a post-publication projection still referencing staging
  retains that source for subsequent recovery.

## Verification

- Core regression coverage: 52 tests passed across `skill-file-snapshot`,
  `skill-snapshot-filesystem`, `skill-snapshot-limits` and `skill-package-durability`.
  Command (from `packages/core`):
  `vitest run tests/skill-file-snapshot.test.ts tests/skill-snapshot-filesystem.test.ts tests/skill-snapshot-limits.test.ts tests/skill-package-durability.test.ts --minWorkers=2 --maxWorkers=2 --coverage.enabled --coverage.include='**/skills/file-snapshot.ts' --coverage.include='**/skills/canonical-package-mutation.ts' --coverage.include='**/shared/utils/skill-file-snapshot.ts' --coverage.allowExternal --coverage.thresholds.100`.
  All three new production modules reached 100% statements, lines, functions and
  branches (189/189 branch counters). Fixtures exercise actual filesystem/SQLite
  state, 500-file capacity, malformed encoding, failed publication, revision conflict,
  atomic-swap failure and failed rollback recovery. Whole-file 100% coverage is not
  claimed for legacy IPC, backup, schema, CLI and route modules; changed behaviors
  have dedicated contract/round-trip/failure regressions.
- Desktop focused IPC/version/backup/transport suites passed. The filesystem backup
  integration regression restores binary bytes and text above the preview limit;
  canonical IPC regressions verify durable write/rename/delete after rehydration.
- Desktop and CLI capability regressions reject an old server before upload/PUT,
  while Web/Cloudflare route regressions reject incompatible readers/writers and
  malformed snapshots before mutation.
- Final isolated release quick harness:
  `node --experimental-strip-types scripts/verify-release.mts --profile quick --surface governance --surface shared --surface core --surface cli --surface desktop --surface web-self-hosted --surface web-cloudflare --concurrency 2`.
  The checkout contained only this submission, excluding unrelated dirty foundation
  changes. The first run completed in 465 seconds: 25 of 26 checks passed, including
  governance, shared/core/CLI/Web/Cloudflare suites, all static gates and seven desktop
  unit shards. Desktop shard 6 had two obsolete assertions matching the replaced
  path-validator message; all other 643 tests in that shard passed. Both assertions
  now match the shared validator while retaining durable-original-file checks.
  Minimal rerun: `vitest run tests/unit/main/skill-installer-local-resilience.test.ts --minWorkers=2 --maxWorkers=2`
  from `apps/desktop`: 56/56 passed. No production changes followed these gates;
  unchanged shards were not rerun. The original harness report remains a failed
  first-run record, not a claimed all-green rerun.

Stable boundary synchronized: `spec/knowledge/behavior/skills.md`. Binary version
diffs reuse the existing localized binary-file hint and show byte sizes rather than
base64 content, following the UI review guidance.

Not run: GUI/E2E, production packaging, Windows/macOS installer acceptance or real
WebDAV/S3/self-hosted/Cloudflare deployment tests. This is local implementation,
not a release or deployed-provider acceptance. No live profile or remote data has
been changed. Downgrade requires the preserved pre-upgrade backup described in
`design.md`; historical preview placeholders cannot be reconstructed.
