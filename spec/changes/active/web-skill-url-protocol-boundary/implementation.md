# Implementation

## Shipped

- Added `apps/web/src/services/skill-url-validation.ts` with shared protocol
  validators for Skill URL metadata:
  - `source_url` and `content_url` allow only HTTP(S)
  - `icon_url` allows HTTP(S) or base64 image `data:` URLs
- Updated live Skill route schemas so create/import/update requests reject
  unsafe URL protocols before reaching persistence.
- Added defensive `SkillService` validation so direct service callers and
  remote Skill imports cannot bypass the route schema.
- Updated sync snapshot parsing so `/api/import`, ZIP import, `/api/sync/data`,
  and WebDAV pull reject unsafe imported Skill URL metadata before
  `BackupService.import()` writes records.
- Added route, service, and import regressions for unsafe URL metadata, plus a
  valid base64 image icon round-trip.

## Verification

- Failure-first checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "validates skill URL metadata"` failed because `javascript:` source URLs were accepted with `201`.
  - `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts -t "validates skill URL metadata"` failed because direct `SkillService.create()` accepted `javascript:` source URLs.
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "unsafe URL metadata"` failed because `/api/import` accepted unsafe Skill URL metadata with `201`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "validates skill URL metadata"`
  - `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts -t "validates skill URL metadata"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "unsafe URL metadata"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts src/services/skill.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "sync imports"`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/skills.ts apps/web/src/routes/skills.test.ts apps/web/src/services/skill.service.ts apps/web/src/services/skill.service.test.ts apps/web/src/services/skill-url-validation.ts apps/web/src/services/sync-snapshot.ts apps/web/src/routes/import-export.test.ts spec/changes/active/web-skill-url-protocol-boundary`
