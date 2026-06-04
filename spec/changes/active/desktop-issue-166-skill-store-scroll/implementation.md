# Implementation

## Status

Implemented.

## Notes

- The overflowing surface is the Skill module sidebar in `apps/desktop/src/renderer/components/layout/Sidebar.tsx`, not the main `SkillStore` content pane.
- The fixed skill navigation now keeps only first-level entries at the top.
- Expanded Skill Store sources now render in a middle `min-h-0 flex-1 overflow-y-auto` region, so many official/custom sources scroll internally without pushing the bottom sidebar content out of the app boundary.
- The regression test uses 36 custom store sources and asserts the last source plus the add-store action remain inside the internal scroll region.
- The first-level Skill Store entry now toggles the expanded source list closed when the user is already on the store page; clicking it again reopens the selected source list.
- Custom store empty rendering now uses a single empty state. When a connected custom source has no loaded skills, the specific custom-store empty message suppresses the generic "No skills found" search/category empty message.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/sidebar.test.tsx` passed after the fix: 27 tests passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-custom-sources.test.tsx` passed after the duplicate empty-state fix: 8 tests passed.
- `git diff --check -- apps/desktop/src/renderer/components/layout/Sidebar.tsx apps/desktop/tests/unit/components/sidebar.test.tsx spec/changes/active/desktop-issue-166-skill-store-scroll` passed.
- File size guard checked: `Sidebar.tsx` remains below the 2,000-line source-file limit at 1,998 lines.
- Existing test-suite warning remains: one legacy React `act(...)` warning in the classic sidebar layout test; it did not fail the suite and was not introduced by this regression test.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx` was also checked and currently has an unrelated existing pagination expectation failure: the test still searches for `Load more`, while the rendered UI exposes page navigation (`Previous page` / `Next page`).
