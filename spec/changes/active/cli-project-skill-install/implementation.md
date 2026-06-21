# Implementation

## Status

Implemented.

## Notes

- Added `prompthub skill project-install [id|name|query]` and alias `prompthub skill install-project`.
- The command defaults the project root to `process.cwd()` and the target Skill root to `<project>/.agents/skills`.
- No database migration was required; the command reads existing My Skills records and resolves their local package repo paths.
- Interactive selection writes choices and prompts to stderr; stdout remains the final JSON/table command result.
- Existing target Skills are skipped by default and replaced only when `--force` is passed.
- Synced stable behavior into `spec/knowledge/behavior/skills.md`.

## Verification

- `pnpm --filter @prompthub/cli exec vitest run tests/run.test.ts`
- `pnpm --filter @prompthub/cli exec tsc --noEmit`
- `pnpm --filter @prompthub/core exec tsc --noEmit`
