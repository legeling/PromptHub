# Implementation

## Status

Implemented.

## Changes

- Added bounded platform id, platform path, and agent asset path schemas to `apps/web/src/routes/settings.ts`.
- Limited platform preference records and arrays to 64 entries.
- Required non-empty trimmed ids and paths for:
  - `builtinAgentOverrides`
  - `customPlatformRootPaths`
  - `customAgentRootPaths`
  - `disabledPlatformIds`
  - `customSkillPlatformPaths`
  - `skillPlatformOrder`
- Preserved existing semantics by validating only shape and size, not filesystem existence or platform registry membership.
- Added route regression coverage for malformed platform settings and valid platform setting round-trip.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts -t "rejects malformed platform settings"`
- `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `git diff --check -- apps/web/src/routes/settings.ts apps/web/src/routes/settings.test.ts spec/changes/active/web-settings-platform-boundary`

## Follow-up

- Full repository verification was not run because the worktree contains many unrelated active changes and this change only affects the Web settings route boundary.
