# Implementation

## Status

Implemented.

## Changes

- Added bounded metadata schemas in `apps/web/src/routes/skills.ts`.
- `tags` and `original_tags` now require trimmed, non-empty entries, at most 100 characters each and at most 100 entries per array.
- `prerequisites` and `compatibility` now require trimmed, non-empty entries, at most 500 characters each and at most 50 entries per array.
- The shared create schema still covers `POST /api/skills`, `POST /api/skills/import`, and `PUT /api/skills/:id` through the existing partial update schema.
- Added route tests for rejected malformed metadata and valid create/update round-trip behavior.
- Added `SkillService.create/update` defensive metadata validation so
  service-level callers cannot bypass the route schema.
- Added a failure-first route regression for `POST /api/skills/fetch-remote`
  with `importToLibrary=true`, proving parsed remote frontmatter tags could
  bypass metadata limits before the service check.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects malformed skill metadata arrays"`
- `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "persists valid skill metadata arrays"`
- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "remote skill imports with malformed parsed metadata"`
  - Failed because the remote import returned `201` and persisted a skill with
    an overlong parsed tag.
- `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "remote skill imports with malformed parsed metadata"`
- `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "metadata arrays"`
- `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "fetches remote skill content"`
- `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/services/skill.service.test.ts`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `git diff --check -- apps/web/src/routes/skills.ts apps/web/src/routes/skills.test.ts spec/changes/active/web-skill-metadata-array-boundary`

## Follow-up

- Full repository verification was not run because the worktree contains many unrelated active changes and this change only affects the Web skill route metadata boundary.
