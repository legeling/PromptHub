# Implementation

## Status

Implemented.

## Notes

- Issue #163 requests personal notes for skills installed from stores or Git.
- The existing `description` field is source metadata and is updated from
  `SKILL.md`/store metadata, so it must not be reused for user notes.
- The durable source of truth for user notes is the managed skill repo sidecar
  file `.prompthub/user.json`.
- Notes are intentionally not written to `SKILL.md` and are not persisted in
  SQLite.
- The detail page reads and writes notes only for installed managed skills.
- Note saves use `skipVersionSnapshot` so personal notes do not create skill
  content history entries.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skill-user-sidecar.test.ts` passed: 7 tests passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx` passed: 24 tests passed.
- `git diff --check -- apps/desktop/src/renderer/services/skill-user-sidecar.ts apps/desktop/tests/unit/services/skill-user-sidecar.test.ts apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx apps/desktop/src/renderer/i18n/locales spec/changes/active/desktop-issue-163-skill-user-notes packages/shared/types/skill.ts packages/db/src/schema.ts packages/db/src/init.ts packages/db/src/skill.ts apps/desktop/tests/unit/main/skill-db-source-id.test.ts` passed.
