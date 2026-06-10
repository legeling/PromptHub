# Implementation

## Shipped Changes

- Added a regression in `apps/web/src/services/prompt-workspace.test.ts` that
  simulates an interrupted prompt markdown write after a complete workspace
  export already exists.
- Added a regression proving interrupted export scratch directories are ignored
  during workspace bootstrap/import scans.
- Updated `apps/web/src/services/prompt-workspace.ts` so exports now:
  - validate path bounds before creating staging files
  - write folder metadata, prompt markdown files, and version files into a
    sibling staging directory
  - replace the live `data/prompts` directory only after staging succeeds
  - remove staging and preserve the existing live workspace when staging writes
    fail
  - restore the previous live workspace if replacement fails after moving it
- Updated `spec/knowledge/behavior/web.md` with the stable prompt workspace
  export guarantee.

## Verification

- Failure first:
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt-workspace.test.ts -t "preserves the existing workspace"` failed because `stable-prompt.md` was deleted by the old direct rewrite path.
- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt-workspace.test.ts -t "preserves the existing workspace"`
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt-workspace.test.ts -t "ignores interrupted export scratch"`
  - `pnpm --filter @prompthub/web test -- --run src/services/prompt-workspace.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts src/routes/folders.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/services/prompt-workspace.ts apps/web/src/services/prompt-workspace.test.ts spec/changes/active/web-prompt-workspace-atomic-export spec/knowledge/behavior/web.md`
