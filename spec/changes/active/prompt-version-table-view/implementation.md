# Implementation

## Shipped

- Added a `detail | diff | table` view mode to the desktop Prompt version history modal.
- Added a table/matrix view that renders current and historical `PromptVersion` rows side by side.
- Table columns cover only fields already stored in `PromptVersion`: system prompt, user prompt, variables, AI response, and note.
- Changed cells are highlighted by comparing each row with the next older version.
- Clicking a comparable field cell opens a focused Git-style diff for that field.
- Fixed variable display compatibility: the variables column now prefers the version's stored variable snapshot, but when that snapshot is empty it derives variables from that same version's `{{name}}` / `{{name:default}}` placeholders in system and user prompt text.
- Legacy string-array variable snapshots are normalized for display so older restored/exported data does not render as blank.
- Existing restore/delete behavior remains tied to the selected version.
- Added i18n keys for all 7 desktop locales.

## Boundaries

No database, IPC/preload, shared type, sync payload, or migration changes were made.

The first version intentionally does not compare title, description, tags, folder, source, notes, images, or videos because those values are not stored in `PromptVersion`.

## Verification

- `pnpm --filter @prompthub/desktop test:run tests/unit/components/prompt-version-history-modal.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`

Both passed.

Latest focused verification:

- `pnpm --filter @prompthub/desktop test:run tests/unit/components/prompt-version-history-modal.test.tsx`
  - Passed: 1 file, 3 tests.
- `pnpm --filter @prompthub/desktop typecheck`
  - Passed.
