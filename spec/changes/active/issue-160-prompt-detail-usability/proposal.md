# Proposal

## Why

GitHub issue #160 reports Prompt editing usability gaps in the desktop app. The attached screenshots request clearer folder counts and lower-friction metadata editing in the Prompt detail page.

## Scope

- Show each folder row's direct Prompt count in the left folder tree.
- Let users save title and description edits with Enter from the detail header.
- Keep description directly under the title and make empty descriptions editable from the detail header.
- Keep Prompt type and folder selection on the same detail metadata row.
- Let users change the selected Prompt's folder directly from the detail page.

## Non-Goals

- No redesign of the whole Prompt editor.
- No changes to Prompt storage schema.
- No changes to AI testing, version history, or table/gallery/kanban behavior.

## Risks

- `MainContent.tsx` is already above the 2,000-line guideline before this change. This follow-up keeps edits localized but does not solve that existing file-size debt.
