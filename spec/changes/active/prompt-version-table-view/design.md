# Design

## Boundary

Owner: `apps/desktop/src/renderer/components/prompt/VersionHistoryModal.tsx`.

Data source: existing `PromptVersion` rows loaded through `getPromptVersions(prompt.id)` plus the current pseudo-version assembled from the open `Prompt`.

No DB, IPC, preload, sync payload, or shared type changes are required.

## UI

Add a local view mode:

- `detail`: existing selected-version preview.
- `diff`: existing two-version Git-style diff.
- `table`: new side-by-side field matrix.

The table uses columns for version, timestamp, system prompt, user prompt, variables, AI response, and note. Cells show clipped summaries, not full content. Changed cells are visually highlighted. Clicking a comparable cell opens a field diff for that version against the next older version.

## Change Detection

Rows are ordered newest to oldest. For each row, compare field values with the next row:

- `unchanged`: normalized field value equals next older version.
- `changed`: normalized values differ.
- `baseline`: oldest row has no older comparison target.

Variables are compared and displayed through stable JSON formatting.

## Verification

Use component tests with real rendered UI and mocked database service:

- Switch to table view and assert versions render side by side.
- Assert changed fields are highlighted.
- Click a changed cell and assert field diff appears.
- Ensure restore/delete target remains tied to the selected version.
