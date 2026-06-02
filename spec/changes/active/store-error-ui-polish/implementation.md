# Implementation

## Summary

Polished two desktop warning/error surfaces: the About settings preview-channel area now stays within the standard setting-row description pattern, and the Skill Store rate-limit error now gives accurate retry/network guidance without referencing a nonexistent GitHub token setting.

## Delivered Changes

- Removed the extra standalone preview-channel notice block in `AboutSettings` and kept the enabled-state message inside the normal setting-row description.
- Kept the blocking preview opt-in modal as the primary high-emphasis warning step.
- Restructured the Skill Store remote-error banner into a clearer title/body/action layout.
- Updated GitHub rate-limit guidance in `SkillStore` and `CreateSkillModal` to recommend retrying later or switching networks.
- Added a dedicated `Community` section to `AboutSettings` with a direct Discord link plus a QQ dual-path entry (`mqqapi` client jump + copyable group number) so users can reach the PromptHub community from inside the app without needing a separate invite webpage.
- Refined `AboutSettings` information labeling so the open-source row now presents the concrete PromptHub repository path, the QQ entry uses a QQ-specific brand icon, and the previous `Author` section is presented as `Contact Author`.
- Updated the root `README.md` community section to add a prominent Discord invite card and reposition QQ as an additional community channel instead of the only entry point.
- Added shared GitHub store error mapping for three user-facing cases: rate limit, network failure, and invalid/missing repository.
- Synced all 7 locale files for the new update-channel active-state copy and the corrected rate-limit message.
- Added regression tests covering the new remote-store error categories, the About settings community links, and ensuring the UI no longer tells users to configure a GitHub token in settings.
- Decoupled the Skill Store source-list expansion state from `storeView`, so opening the store keeps official, Claude Code, OpenAI Codex, custom stores, and the add-store entry visible after users switch to My Skills, Project Skills, or Agent Skills.
- Separated Skill Store detail update actions so imported Skills initially show only `Check update`; `Update` appears only after a check confirms a store update is available, and the check action becomes `Recheck update` after a status has been resolved.
- Converted the imported status in Skill Store detail into an `Open in My Skills` action when the store entry can be matched to an installed library Skill. The action switches to My Skills, selects the installed Skill detail, and closes the store modal.

## Verification

- Commands run:
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/about-settings.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/components/update-dialog.test.tsx`
- `pnpm --filter @prompthub/desktop lint`
- Tests passed:
- `tests/unit/components/about-settings.test.tsx`
- `tests/unit/components/skill-store-remote.test.tsx`
- `tests/unit/components/update-dialog.test.tsx`
- Build / lint status:
- Desktop lint passed
- Additional targeted verification:
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx --testNamePattern "keeps skill store sources expanded"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "update action only"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "installed My Skills detail"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
- JSON parse validation for all desktop locales (`en`, `zh`, `zh-TW`, `ja`, `fr`, `de`, `es`)
- `pnpm --filter @prompthub/desktop typecheck`

## Follow-Up

- Consider adding a dedicated “network / upstream unavailable” error code mapping layer if more remote store providers are added later.
