# Implementation

## Shipped

- Added a route regression proving generic `PUT /api/skills/:id` with a
  `safetyReport` field returns `422 VALIDATION_ERROR` and leaves the stored
  Skill safety report unset.
- Updated the generic Skill update schema to reject `safetyReport` and direct
  callers to `PUT /api/skills/:id/safety-report`.
- Added a route regression proving oversized dedicated safety reports return
  `422 VALIDATION_ERROR` and do not persist a report.
- Bounded dedicated safety report summaries, findings count, and finding text
  fields in the Web route schema.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects safety report writes through generic skill updates"`
  - Failed because generic `PUT /api/skills/:id` returned `200` and accepted the report.
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects oversized safety reports"`
  - Failed because `PUT /api/skills/:id/safety-report` returned `200` and persisted the oversized report.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects safety report writes through generic skill updates"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects oversized safety reports"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "scans safety findings"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/skills.ts apps/web/src/routes/skills.test.ts spec/changes/active/web-skill-safety-report-boundary spec/changes/active/web-skill-version-counter-boundary`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web Skill safety report API boundary. No stable docs were synced
  because the long-lived Skill safety behavior remains unchanged: safety reports
  are still persisted through the dedicated route.

## Follow-ups

- None currently.
