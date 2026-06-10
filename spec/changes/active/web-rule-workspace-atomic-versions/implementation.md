# Implementation

## Shipped Changes

- Added a regression in `apps/web/src/services/rule-workspace.test.ts` that
  simulates an interrupted imported version write after a rule already has
  readable managed content and version history.
- Updated `apps/web/src/services/rule-workspace.ts` so rule version imports now:
  - write version markdown files and `index.json` into a sibling staging
    directory
  - replace the live `.versions/<rule-id>/` directory only after staging
    succeeds
  - restore the previous version directory if replacement fails after moving it
- Added rule-record rollback for import failures so previous managed content,
  `_rule.json`, and version history are restored if any write in that record
  fails.
- Updated `spec/knowledge/behavior/rules-workspace.md` with the stable Web rule
  workspace import failure guarantee.

## Verification

- Failure first:
  - `pnpm --filter @prompthub/web test -- --run src/services/rule-workspace.test.ts -t "preserves existing rule versions"` failed because the old direct rewrite path deleted the existing version history on interrupted version write.
  - After staged version directories, the same focused test failed again because managed content had already been overwritten with new imported content. The test was tightened to require full rule-record preservation.
- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/services/rule-workspace.test.ts -t "preserves existing rule versions"`
  - `pnpm --filter @prompthub/web test -- --run src/services/rule-workspace.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/rules.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/services/rule-workspace.ts apps/web/src/services/rule-workspace.test.ts spec/changes/active/web-rule-workspace-atomic-versions spec/knowledge/behavior/rules-workspace.md`
