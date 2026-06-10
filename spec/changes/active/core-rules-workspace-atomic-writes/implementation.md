# Implementation

## Shipped Changes

- Added regression coverage in
  `apps/desktop/tests/unit/main/rules-workspace.test.ts` for interrupted
  managed rule writes. The test first reproduced the old behavior where
  `data/rules/projects/.../AGENTS.md` was replaced by partial content.
- Added regression coverage for backup import version restoration failures.
  The test first reproduced the old behavior where the existing
  `.versions/<rule-id>/` directory was removed before replacement versions were
  fully written.
- Added same-directory atomic text/JSON writes in
  `packages/core/src/rules-workspace.ts` for shared managed Rules workspace
  files, `_rule.json`, version snapshot files, and version indexes.
- Changed backup import version restoration to build a complete staging
  version directory and then publish it with rollback to the previous live
  directory on failure.
- Kept external target rule writes on the previous direct write path to avoid
  changing user-managed path semantics such as symlink replacement.
- Synced stable persistence behavior into
  `spec/knowledge/behavior/rules-workspace.md`.

## Verification

- Failure-first: `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "preserves previous managed content"` failed against the old direct-write implementation with `partial-write` replacing the stable managed file.
- Failure-first: `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "preserves previous versions"` failed against the old import implementation with the previous version history reduced to `[]`.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "preserves previous managed content"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts -t "preserves previous versions"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/rules-workspace.test.ts`
- `pnpm --filter @prompthub/core typecheck`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop exec eslint tests/unit/main/rules-workspace.test.ts --max-warnings 0`
- `git diff --check -- packages/core/src/rules-workspace.ts apps/desktop/tests/unit/main/rules-workspace.test.ts spec/changes/active/core-rules-workspace-atomic-writes spec/knowledge/behavior/rules-workspace.md`
