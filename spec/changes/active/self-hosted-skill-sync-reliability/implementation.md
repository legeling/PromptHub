# Implementation

## Product

Web

## Status

release-pending. Local verification is complete; publication attribution remains to be reconciled.

Status: implementation complete; release pending

- Added a desktop Web-sync sanitizer that removes machine-local repository and non-portable URL metadata while preserving HTTP(S) sources and the same safe base64 image data URLs accepted by Web.
- Extended the Web sync snapshot schema to preserve portable source identity, branch/path, package fingerprint, baseline, and binding metadata instead of silently dropping it during validation.
- Added portable Skill reconciliation keyed by stable `source_id`, package/content fingerprint, or legacy normalized name, with canonical ID remapping for versions and file snapshots. Local and remote copies now restore as one Skill instead of producing duplicate-name and missing-file errors.
- Added regression coverage for local scan payloads, remote URL preservation, duplicate desktop/Web IDs, file remapping, and version remapping.

Verification:

- `pnpm --dir apps/desktop exec vitest run tests/unit/services/self-hosted-skill-sync-reliability.test.ts`: passed (2 tests).
- `pnpm --dir apps/desktop exec vitest run tests/unit/services/self-hosted-sync.test.ts tests/unit/services/database-backup.test.ts`: passed (30 tests).
- `pnpm --dir apps/desktop exec vitest run tests/unit/services/self-hosted-skill-sync-reliability.test.ts tests/unit/services/self-hosted-sync.test.ts`: passed (11 tests) after the final sanitizer and replace-mode normalization changes.
- `pnpm --filter @prompthub/desktop typecheck`: passed.
- `pnpm --dir apps/web exec vitest run --config vitest.config.ts src/services/sync-snapshot.test.ts`: passed (3 tests).
- `pnpm --dir apps/web exec vitest run --config vitest.config.ts src/routes/sync-contract.test.ts src/routes/sync-import.test.ts src/services/sync-snapshot.test.ts`: passed (13 tests).
- `pnpm --filter @prompthub/web typecheck`: passed.
- `pnpm verify:release:quick`: passed (18/18 checks; desktop, Web, and Cloudflare suites passed).
- `pnpm lint:file-size`: passed.
- `pnpm spec:index:check`: passed.
- `git diff --check`: passed.

### 2026-10-22 binary package follow-up (#185)

The macOS Electron-to-Web regression exposed HTTP 422 before backup creation:
Desktop correctly sends `SKILL_SNAPSHOT_SYNC_VERSION` for binary Skill files,
but the backup route accepts only `desktop-backup-v1`. The shared Skill snapshot
encoding contract already supports these bytes. The route must accept the two
formats emitted by the current Desktop serializer, reusing the shared binary
version constant, while retaining rejection of unknown versions, unsafe paths,
invalid encoding, credentials and client/server version mismatches.

No storage layout, schema or migration changes: immutable backup files and their
checksums retain their existing owner. No format conversion or silent fallback.
Deploy the corrected Web server together with the matching Desktop version;
retain pre-upgrade backups for downgrade rather than converting binary snapshots.
The added sequential E2E case intentionally exceeds 50 lines to keep one package,
server and profile lifecycle together: install a local package with binary assets,
create version history, upload, delete locally, then restore/restart three times
and compare package bytes and version snapshots. Reporter deployment is unavailable.

Issue closure is based on verified repair, independently of publication, per the
current issue-management rules; publication alone does not prove remote acceptance.

Verification after the route fix:

- `PROMPTHUB_E2E_HEADED=1 pnpm --filter @prompthub/desktop exec playwright test tests/e2e/self-hosted-skill-roundtrip.spec.ts --workers=1 --timeout=120000`: passed (1 real Electron/live local Web case, three restore/restart cycles).
- `pnpm --filter @prompthub/web exec vitest run src/routes/desktop-backups.test.ts src/services/desktop-backup-store.test.ts src/services/self-hosted-backup-snapshot.test.ts --minWorkers=1 --maxWorkers=2 --silent`: 24 passed, including immutable retention, failed-write preservation, checksum corruption, symlink and secret-field rejection.
- Web typecheck and scoped route/test ESLint passed. The earlier cross-layer audit also passed 33 Web sync tests and the Desktop self-hosted service regressions.
- No reporter server, production deployment or Windows GUI was exercised. All local test servers/profiles are disposed by the E2E lifecycle.
