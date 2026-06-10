# Implementation

## Shipped Changes

- Added a regression in `apps/web/src/services/skill-workspace.test.ts` that
  simulates an interrupted `SKILL.md` write after a complete skill workspace
  export already exists.
- Added a regression proving interrupted export scratch directories such as
  `.skills-staging-*` are ignored during workspace import scans.
- Updated `apps/web/src/services/skill-workspace.ts` so exports now:
  - validate path bounds before creating staging files
  - preserve existing additional skill sidecar files from the live workspace
  - write `skill.json`, `SKILL.md`, version files, and sidecar files into a
    sibling staging directory
  - replace the live `data/skills` directory only after staging succeeds
  - remove staging and preserve the existing live workspace when staging writes
    fail
  - restore the previous live workspace if replacement fails after moving it
- Updated `spec/knowledge/behavior/web.md` with the stable skill workspace
  export guarantee.

## Verification

- Failure first:
  - `pnpm --filter @prompthub/web test -- --run src/services/skill-workspace.test.ts -t "preserves the existing workspace"` failed because the old direct rewrite deleted the previous `SKILL.md`.
  - `pnpm --filter @prompthub/web test -- --run src/services/skill-workspace.test.ts -t "ignores interrupted export scratch"` failed because `.skills-staging-leftover` was imported as a real skill directory.
- Passing:
  - `pnpm --filter @prompthub/web test -- --run src/services/skill-workspace.test.ts -t "preserves the existing workspace"`
  - `pnpm --filter @prompthub/web test -- --run src/services/skill-workspace.test.ts -t "ignores interrupted export scratch"`
  - `pnpm --filter @prompthub/web test -- --run src/services/skill-workspace.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/services/skill-workspace.ts apps/web/src/services/skill-workspace.test.ts spec/changes/active/web-skill-workspace-atomic-export spec/knowledge/behavior/web.md`
