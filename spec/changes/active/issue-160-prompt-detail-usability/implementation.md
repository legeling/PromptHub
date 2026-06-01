# Implementation Notes

## Status

Implemented.

## Changes

- Prompt detail inline editing now includes `description`.
- `Enter` saves single-line title and description edits; multiline prompt fields keep `Ctrl/Cmd+Enter` save so normal newline input still works.
- The detail metadata row now shows prompt type and a folder selector together, and changing the selector moves the prompt through the same update path as context-menu folder moves.
- The detail folder selector now uses the app's custom `Select` component instead of a native browser select.
- The detail folder selector remains enabled while inline editing so title, description, prompt content, and folder can be adjusted in one edit session.
- The detail description edit control is now rendered below the title row so it can use the full detail width; it is wider/taller and uses the same bordered app surface style as nearby detail fields.
- The detail title edit control now also uses the same white card surface and compact height, avoiding the raw browser focus rectangle and reducing layout jump between view and edit modes.
- Inline system/user prompt textareas now use the same white rounded card surface and focus ring, instead of mixing transparent textareas with browser-like focus rectangles.
- Inline edit save/cancel controls are now compact icon-only buttons with accessible labels.
- The detail folder selector trigger height now matches the adjacent prompt type pill.
- The detail body and sticky action row now use the available panel width instead of centering inside `max-w-5xl`, reducing excessive whitespace on high-resolution displays.
- The detail tag dropzone removes its left padding so tag chips align with the metadata row above it.
- Folder removal now passes `folderId: null` through the shared update DTO so clearing a prompt folder is representable.
- Sidebar folder rows receive direct prompt counts from `Sidebar -> SortableTree -> SortableTreeItem`.
- Added `prompt.addDescription` locale keys across all desktop locales.

## Tests

- Added detail inline-edit coverage for title Enter-save, empty-description edit/save, and detail-page folder changes.
- Added coverage that the detail folder selector is no longer a native combobox.
- Added sidebar coverage that verifies direct prompt counts are passed to the folder tree.
- Updated the context-menu move integration test to disambiguate folder names from the new detail-page native select options.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/integration/components/main-content-inline-edit.integration.test.tsx tests/integration/components/main-content-context-move.integration.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/select.test.tsx` passed.
- `pnpm --filter @prompthub/desktop lint` passed.
- `pnpm --filter @prompthub/desktop typecheck` passed.
- `pnpm --filter @prompthub/desktop test -- --run` was run. It still fails in unrelated dirty-worktree skill tests: missing non-English skill locale keys, custom store empty-state expectation, skill filter/stats expectations, skill platform sync expectation shape, and a `skill-db-versioning` duplicate `source_url` migration setup. The issue #160 targeted prompt/sidebar tests passed.
