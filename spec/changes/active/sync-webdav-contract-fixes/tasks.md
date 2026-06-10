# Tasks

- [x] Fix WebDAV pull error classification so non-404 failures are not masked as missing backups.
- [x] Fail WebDAV push when `manifest.json` upload fails.
- [x] Restore media-complete WebDAV backup layout for web sync.
- [x] Keep both legacy single-file fallback names readable.
- [x] Re-align web sync client types with the unified `summary` contract.
- [x] Add route/orchestrator regression tests for auth failures, legacy fallback, manifest handling, and media round-trip.
- [x] Run lint, targeted tests, and build verification.
- [x] Add follow-up regression so merged WebDAV config cannot inherit an insecure endpoint from another provider.
- [x] Verify sync route/WebDAV tests, web typecheck, lint, and diff check for the follow-up.
- [x] Add follow-up regressions so imported settings cannot persist insecure WebDAV endpoints through `/api/import` or `/api/sync/data`.
- [x] Enforce WebDAV settings policy in sync snapshot normalization and verify import/sync tests.
- [x] Add shared sync settings validation for field length and `lastSyncAt` format across live config, settings updates, imports, and direct sync imports.
- [x] Verify targeted sync/settings/import regressions, web route test files, typecheck, lint, and diff check.
- [x] Add WebDAV manifest integrity regressions for data hash mismatch, media hash mismatch, unsafe manifest media names, and media-upload-before-data publication.
- [x] Verify focused orchestrator tests and diff check for the manifest integrity follow-up.
- [x] Reject WebDAV endpoints containing query strings or fragments before config acceptance, connection tests, or target URL construction.
- [x] Keep WebDAV-only endpoint rules from rejecting self-hosted provider HTTP endpoints, and verify targeted route/service tests plus web typecheck/lint.
