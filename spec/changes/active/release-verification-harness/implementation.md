# Implementation

## Shipped

- Added `scripts/verify-release.mts`.
- Added root scripts:
  - `pnpm verify:release`
  - `pnpm verify:release:quick`
- Added package-level `typecheck` scripts for `@prompthub/shared`, `@prompthub/db`, and `@prompthub/core`.
- Included `packages/shared/utils/**/*` in shared package typechecking because it is exported package surface.
- Added explicit Node type boundaries for `@prompthub/core` and `@prompthub/db`.
- Fixed a package-level typecheck bug in `packages/core/src/rules-workspace.ts` where `fileExists()` was used as a truthy Promise instead of being awaited.

## Verification

- `pnpm verify:release -- --list` passes and shows the full release profile command list.
- `pnpm verify:release:quick -- --list` passes and shows only quick-profile checks.
- `pnpm --filter @prompthub/shared typecheck` passes.
- `pnpm --filter @prompthub/db typecheck` passes after adding the package's Node type boundary.
- `pnpm --filter @prompthub/core typecheck` passes after fixing the awaited file-exists check.
- `pnpm verify:release:quick` fails at `desktop-unit`. The harness successfully stops on the failing layer. Current observed failures:
  - `tests/unit/components/top-bar.test.tsx`
  - `tests/unit/components/skill-store-custom-sources.test.tsx`
  - `tests/unit/services/skill-filter-large.test.ts`
  - `tests/unit/services/skill-filter.test.ts`
  - `tests/unit/services/skill-platform-sync.test.ts`
  - `tests/unit/services/skill-stats.test.ts`
  - `tests/unit/main/skill-db-versioning.test.ts`
- `pnpm verify:release` was not run because quick profile already exposed blocking unit failures.

## Synced Docs

- `spec/workflow/04-verification/README.md`
- `spec/rules/testing-standards.md`
- `spec/issues/active/quality.md`

## Follow-ups

- Triage the user-reported bugs into explicit regression tests and map each one to the lowest effective harness layer.
- Fix the existing desktop unit failures before treating the release harness as green.
