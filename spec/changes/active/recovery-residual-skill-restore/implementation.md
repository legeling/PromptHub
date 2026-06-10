# Implementation

## Status

Implemented.

## Notes

- Empty legacy root databases are cleaned only when they are regular, readable SQLite files with zero prompts, folders, and skills.
- Non-empty legacy root database conflicts are preserved as `prompthub.db.legacy-conflict-*.db` backups, then removed from the root so the unified `data/prompthub.db` becomes the active database.
- Symlinked legacy root databases remain protected and continue to surface as migration failures.
- Desktop runtime database path selection now prefers `data/prompthub.db` whenever it exists, so a partial marker with root residual `prompthub.db` cannot reopen the root database and recreate a stale lock.
- Upgrade snapshots now skip Electron top-level runtime singleton symlinks (`SingletonCookie`, `SingletonLock`, `SingletonSocket`). Nested symlinks inside user data payloads still fail snapshot creation.
- Current residual candidates now tag Skill-only leftovers as Skill data instead of workspace data.
- The recovery dialog now uses a narrower shell, a non-overlapping action footer, denser source/preview cards, and a clear no-effective-database label for zero-size candidates.
- Follow-up UI pass removed the dialog focus outline that appeared as an orange border and changed the recovery action bar back to normal document flow so it no longer overlays preview rows.
- Real startup verification on `~/Library/Application Support/PromptHub` now reports `startup:data_layout_migration` with `status: "migrated"` and `failedEntries: []`; recovery candidates are empty. The former root database was preserved as `prompthub.db.legacy-conflict-2026-06-09T17-46-40-876Z.db`.

## Verification

- `pnpm --dir apps/desktop exec vitest run tests/unit/main/data-layout-migration.test.ts tests/unit/main/recovery-candidates.test.ts tests/unit/components/data-recovery-dialog.test.tsx`
- `pnpm --dir apps/desktop exec vitest run tests/unit/main/upgrade-backup.test.ts tests/unit/main/runtime-paths.test.ts tests/unit/main/data-layout-migration.test.ts`
- `pnpm --dir apps/desktop exec vitest run tests/unit/main/runtime-paths.test.ts tests/unit/main/data-layout-migration.test.ts tests/unit/main/data-recovery.test.ts tests/unit/main/recovery-candidates.test.ts`
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/modal.test.tsx tests/unit/components/data-recovery-dialog.test.tsx`
- Real-data copy dry run using the local `~/Library/Application Support/PromptHub/prompthub.db` and `data/prompthub.db` copies returned `status: migrated`, `failedEntries: []`, and `residual: []`.
- Real desktop dev startup after rebuilding main moved the root residual to a `prompthub.db.legacy-conflict-*.db` backup, wrote marker `dbLayoutVersion: "0.5.7"`, and `detectResidualLegacyEntries(...)` returned `[]`.
- `pnpm --dir apps/desktop exec tsc --noEmit --pretty false`
- `git diff --check`
