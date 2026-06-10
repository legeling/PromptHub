# Implementation

## Shipped

- Added a route regression for `POST /api/skills/fetch-remote` with an
  `http://` URL. The test failed first because the request returned `200` when
  the remote transport was mocked.
- Updated the Web Skill fetch route schema so non-HTTPS URLs return
  `422 VALIDATION_ERROR` before calling `SkillService.fetchRemote`.
- Added a defensive `SkillService.fetchRemote` HTTPS assertion so direct service
  callers cannot bypass the route parser and reach `requestRemoteBuffered`.
- Added a service regression proving the direct service boundary rejects
  `http://` URLs and does not call the remote transport.

## Follow-up: Remote Import Visibility Default

- Added route and service regressions proving non-admin users can import a
  remote Skill without explicitly passing `visibility`.
- Updated `SkillService.fetchRemote()` so imported remote Skills default to
  `private` for normal users and `shared` for admins when the request omits
  `visibility`.
- Preserved explicit visibility behavior: normal users that explicitly request
  `shared` still go through the existing create permission check.
- Re-aligned the oversized safety-report route fixture so it stays below the
  1 MiB JSON body limit while still exercising schema-level `422` validation
  for summary, finding count, and finding field bounds.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "non-HTTPS remote skill"`
  - Failed because the HTTP URL returned `200` through a mocked remote fetch.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "non-HTTPS remote skill"`
  - `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts src/services/skill.service.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/skills.ts apps/web/src/routes/skills.test.ts apps/web/src/services/skill.service.ts apps/web/src/services/skill.service.test.ts spec/changes/active/web-skill-remote-fetch-https`

Follow-up verification:

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "defaults normal user remote skill imports"` failed with `403` because a non-admin import without explicit visibility inherited the shared default.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "defaults normal user remote skill imports"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "fetches remote skill content"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "non-HTTPS remote skill"`
  - `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/services/skill.service.ts apps/web/src/services/skill.service.test.ts apps/web/src/routes/skills.test.ts`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow remote Skill fetch security boundary. No stable docs were synced
  because the long-lived remote fetch contract already expects HTTPS-only
  transport behavior.
