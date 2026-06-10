# Implementation

## Status

Implemented.

## Changes

- Added installed-source update APIs to the desktop skill store:
  - `getInstalledSkillSourceUpdateStatus(skillId)`
  - `updateInstalledSkillFromSource(skillId, options?)`
- Added GitHub fallback candidate derivation for installed skills that have a GitHub tree `source_url` but no cached registry entry.
- Reused the existing registry update status service for remote hash comparison, local modification detection, conflict detection, version snapshots, and repo sync.
- Added a My Skills detail header action that checks source updates and switches to an update action when a source update is available.
- Fixed GitHub issue #168 false local-modified detection: if the installed `SKILL.md` content already matches the latest source content, a stale `installed_content_hash` no longer reports local changes.
- Added an explicit `Overwrite local changes` action in My Skills detail after a source update check returns `local-modified` or `conflict`, matching the existing store-detail overwrite behavior. Creating a snapshot preserves rollback history, while the overwrite action is now the explicit user consent required to continue.
- Added locale strings for the new check/update states in all supported desktop locales.
- Preserved the installed skill's user-facing `source_label` during store/source updates so private store labels do not drift into generic Git host labels such as Gitea Import.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts --testNamePattern "GitHub-imported skill"` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx --testNamePattern "source updates|locale skill keys"` passed.
- `pnpm --filter @prompthub/desktop typecheck` passed.
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/stores/skill.store.ts src/renderer/components/skill/SkillFullDetailPage.tsx tests/unit/stores/skill.store.test.ts tests/unit/components/skill-i18n-smoke.test.tsx` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts --testNamePattern "private Gitea"` passed.
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/skill-full-detail-async-actions.test.tsx tests/unit/components/skill-i18n-smoke.test.tsx tests/unit/services/skill-store-update.test.ts tests/unit/stores/skill.store.test.ts` passed: 4 files, 102 tests.
- `pnpm --dir apps/desktop exec tsc --noEmit --pretty false` passed.
- `git diff --check` passed.
