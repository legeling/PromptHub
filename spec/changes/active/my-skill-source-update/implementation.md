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
