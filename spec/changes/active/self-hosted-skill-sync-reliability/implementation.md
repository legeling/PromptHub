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

Remaining: assign the fix to the next published version; keep #185 open until that release is public.
