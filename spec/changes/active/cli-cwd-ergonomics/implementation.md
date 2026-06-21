# Implementation

## Status

Implemented.

## Notes

- This change does not alter storage ownership or schema.
- Existing non-interactive scripts remain deterministic: ambiguous matches return
  `CONFLICT` instead of silently picking a candidate.

## Shipped

- Added shared CLI fuzzy ranking and numbered terminal selection helpers in the
  main CLI command surface.
- Added `rules project-init` and made `rules add-project` default missing
  `--root-path` to the current working directory and missing `--name` to the
  directory basename.
- Prompt commands now resolve prompt ids from id, title, or query for common
  get/use/copy/update/delete/version flows.
- Rules commands now resolve rule ids from id, display name, platform name, or
  query for read/save/rewrite/version flows.
- MCP template install and MCP `--servers` selection now accept id/name/query
  with interactive fallback.
- AI `route-set` now accepts a model query or can interactively list compatible
  models when the model id is omitted.
- Synced stable Prompt and Rules behavior docs with the CLI selection and
  cwd-aware rules initialization contracts.

## Verification

- `pnpm --filter @prompthub/cli exec vitest run tests/run.test.ts`
- `pnpm --filter @prompthub/cli exec vitest run tests/ai-config.test.ts`
- `pnpm --filter @prompthub/cli exec tsc --noEmit`
- `pnpm --filter @prompthub/core exec tsc --noEmit`
- `git diff --check -- packages/core/src/cli/run.ts packages/core/src/cli/ai-config-command.ts apps/cli/tests/run.test.ts apps/cli/tests/ai-config.test.ts spec/changes/active/cli-cwd-ergonomics`
