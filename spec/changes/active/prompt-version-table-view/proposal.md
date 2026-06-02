# Proposal

## Why

Prompt history currently supports single-version preview and two-version diff. Users need a faster way to scan several historical versions side by side and identify which prompt fields changed.

## Scope

- In scope:
  - Add a desktop Prompt history table view using existing `PromptVersion` fields.
  - Highlight changed cells by comparing each version with the next older version.
  - Allow opening a field-level diff from the table.
  - Preserve existing restore, delete, detail, and compare workflows.
- Out of scope:
  - No `prompt_versions` schema change.
  - No title, description, tags, source, notes, folder, image, or video versioning because those fields are not currently stored in `PromptVersion`.
  - No web UI implementation in this change.

## Risks

- Large prompt bodies can make table cells too tall or slow if rendered in full.
- Comparing all fields across many versions could introduce unnecessary work on each render.
- Table mode must not make restore/delete target ambiguous.

## Rollback Thinking

Revert the component and test changes. Because no storage or contract changes are introduced, rollback does not require data migration.
