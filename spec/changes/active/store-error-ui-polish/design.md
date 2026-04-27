# Design

## Call Chain

- `AboutSettings -> preview enabled state copy`
- `SkillStore -> loadGitHubSkillRepo/loadStoreSource -> remote error banner`
- `CreateSkillModal -> loadGitHubSkillRepo -> shared rate-limit message`

## Affected Modules

- `apps/desktop/src/renderer/components/settings/AboutSettings.tsx`
- `apps/desktop/src/renderer/components/skill/SkillStore.tsx`
- `apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx`
- `apps/desktop/src/renderer/i18n/locales/*.json`
- related component tests

## Technical Approach

- Remove the heavy standalone amber warning block from the enabled preview-channel state and replace it with a lighter inline note that matches the setting-card rhythm.
- Keep the blocking confirmation modal as the primary high-salience warning moment.
- Introduce a dedicated remote-store rate-limit hint that recommends waiting and switching network instead of referencing a missing GitHub token setting.
- Improve the Skill Store error banner spacing and CTA layout so the primary error text and retry action do not feel cramped.

## Verification Plan

- Component tests for `AboutSettings`
- Remote-store tests for rate-limit error text
- Desktop lint and targeted tests
