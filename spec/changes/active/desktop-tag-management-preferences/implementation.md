# Implementation

## Status

Implementation landed and targeted verification passed.

## Notes

- existing desktop code already includes `TagManagerModal` and prompt tag rename/delete IPC hooks
- prompt tags are currently derived from prompt rows, so add-tag requires durable storage beyond pure aggregation
- added a persisted `promptTagCatalog` in renderer settings to support manual prompt tags before any prompt uses them
- added a General Settings preference for prompt tag click mode (`single` / `multi`)
- sidebar and detail tag clicks now respect the configured tag filter mode
- fixed the new sidebar tests by restoring the default skill-module test context and only switching prompt-module expectations inside prompt-tag-specific cases
- fixed prompt tag manager unit test timeouts by stabilizing the mocked `useToast()` return value so the modal's `loadPromptTags` callback no longer retriggers on every render
- added the same prompt tag click mode selector to the tag manager modal so users can adjust the behavior in context while managing tags
- widened the prompt tag creation row by letting the input wrapper own the flexible width instead of applying `flex-1` to the inner input element only
- enlarged the prompt tag manager modal so the search, create row, and tag list have more breathing room
- normalized current-version persisted prompt tag settings during zustand hydration so invalid `tagFilterMode` values fall back to `multi` and catalog entries are trimmed, filtered, deduplicated, and sorted before prompt tag UI consumes them

## Verification

- `pnpm exec vitest run tests/unit/components/general-settings.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/tag-manager-modal.test.tsx`
- `pnpm lint`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-tags.test.ts` first reproduced the current-version hydrate gap, then passed after settings normalization.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/settings-tags.test.ts tests/unit/components/tag-manager-modal.test.tsx tests/unit/components/general-settings.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `git diff --check -- apps/desktop/src/renderer/stores/settings.store.ts apps/desktop/tests/unit/stores/settings-tags.test.ts spec/changes/active/desktop-tag-management-preferences spec/issues/active/quality.md`
