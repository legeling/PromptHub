# Implementation

## Shipped

- Added a service-level regression test proving `SkillService.list()` must not
  issue per-skill detail queries after the visible list query.
- Changed `SkillService.list()` to query complete visible skill rows directly
  and map them to the existing Web skill payload shape in one read path.
- Kept `GET /api/skills` and `GET /api/skills/search` contracts unchanged.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts -t "lists visible skills without per-skill detail queries"`
  - Failed before implementation because listing two visible skills called
    `prepare()` five times.
- `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts -t "lists visible skills without per-skill detail queries"`
- `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `git diff --check -- apps/web/src/services/skill.service.ts apps/web/src/services/skill.service.test.ts apps/web/src/routes/skills.ts apps/web/src/routes/skills.test.ts spec/changes/active/web-skill-metadata-array-boundary spec/changes/active/web-skill-list-query-efficiency`

## Synced Docs

- No stable docs required updates because this change preserves the public Web
  API contract, SQLite schema, filesystem layout, and durable skill semantics.
  The active delta spec records the query-efficiency boundary.

## Follow-ups

- Consider adding pagination or explicit result limits to Web skill list routes
  if large self-hosted libraries become common; this change only removes the
  current N+1 read pattern.
