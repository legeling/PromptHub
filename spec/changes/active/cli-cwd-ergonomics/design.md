# Design

## Command Shape

Add or extend:

- `prompthub rules project-init [--name <name>] [--root-path <path>] [--id <id>]`
- `prompthub rules add-project` defaults missing `--root-path` to `process.cwd()`
  and missing `--name` to the folder basename.
- Prompt identifier commands accept id, title, or query.
- Rules identifier commands accept id, display name, platform name, or query.
- `prompthub mcp install [template-id|query]` can select from market templates.
- `prompthub ai route-set <route> [model-id|query]` can select a compatible
  model when omitted or ambiguous in an interactive terminal.

## Shared CLI Helper

Keep helper code local to `packages/core/src/cli/run.ts` for this batch because
the CLI parser is still centralized there. The helper should:

- rank exact matches before prefix and substring matches
- print numbered choices to stderr for interactive selection
- throw `CONFLICT` with candidate details in non-interactive mode
- throw `USAGE_ERROR` when a value is omitted in non-interactive mode

`ai-config-command.ts` uses the same behavior locally because it is a separate
command module and must not import from `run.ts` to avoid circular dependencies.

## Data And Contract Impact

- SQLite: none.
- Filesystem layout: none. Existing rules project creation still writes managed
  rules through `coreRulesWorkspaceService`.
- IPC/API: none.
- Shared types: none.

## Verification

- Add command-level tests in `apps/cli/tests/run.test.ts`.
- Add AI command tests in `apps/cli/tests/ai-config.test.ts`.
- Run focused CLI tests and core/CLI typecheck.
