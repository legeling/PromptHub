# Implementation

## Shipped Changes

- Added a shared Rules workspace regression proving an imported backup record
  with `id: "project:../../../escaped-rules"` is rejected and does not create a
  managed `AGENTS.md` outside `data/rules/projects/`.
- Added a direct project creation regression proving
  `createProjectRule({ id: "../escape-create" })` is rejected before any
  managed project directory is created.
- Added `assertSafeProjectId()` in
  `packages/core/src/rules-workspace.ts` and validate explicit project ids
  before they are used in managed project directory names.
- The same validation covers backup imports because missing project records are
  created through `createProjectRule()`.
- Synced the stable project id path-segment rule into
  `spec/knowledge/behavior/rules-workspace.md`.

## Verification

- Failure-first: `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "rejects imported project ids"` failed before the fix because the shared service did not reject at the project-id boundary and surfaced `Unknown rule file id: project:../../../escaped-rules`.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "rejects unsafe project ids before creating"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "rejects imported project ids"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "imports backup records|creates a managed project rule"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts`
- `pnpm --filter @prompthub/core typecheck`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop exec eslint tests/unit/main/rules-workspace.test.ts --max-warnings 0`
