# Implementation

## Shipped

- Added a route regression proving generic `PUT /api/skills/:id` with
  `currentVersion` returns `422 VALIDATION_ERROR`.
- The regression also verifies that after the rejected update, creating the next
  version returns version `2` rather than a caller-controlled jump.
- Updated the generic Skill update schema to reject `currentVersion` and direct
  callers to the versioning endpoint.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects version counter writes through generic skill updates"`
  - Failed because generic `PUT /api/skills/:id` returned `200` and changed the counter.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects version counter writes through generic skill updates"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/skills.ts apps/web/src/routes/skills.test.ts spec/changes/active/web-skill-safety-report-boundary spec/changes/active/web-skill-version-counter-boundary`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web Skill version counter API boundary. No stable docs were synced
  because the long-lived versioning behavior remains unchanged.

## Follow-ups

- None currently.
