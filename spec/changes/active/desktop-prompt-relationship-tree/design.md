# Design

## Data

`prompts.parent_id` and `prompts.sort_order` own the tree-style relationship.
This is the primary interaction users get through drag-and-drop. A prompt has
at most one tree parent so ordering, indentation, and collapse state stay
deterministic.

`prompt_relations` stores graph-style relationships:

- `related_to`
- `variant_of`
- `depends_on`
- `next_step`

The tree relation `grouped_under` is intentionally not duplicated in
`prompt_relations`; it is represented by `parent_id` and `sort_order`.

## UI

The relationship editor is not a separate page. It is embedded in existing
surfaces:

- Card mode: drag a prompt card in the left prompt list.
- List mode: drag a prompt table row.

Drop behavior:

- Top third: place before the target within the target's parent.
- Middle third: group under the target prompt.
- Bottom third: place after the target within the target's parent.

Rows/cards show the existing UI styling plus a small drag handle and drop
highlight. Parent rows/cards expose an inline expand/collapse control. No new
workbench or graph canvas is introduced.

The tree is not the whole relationship model. Graph-style relationships can
point to many prompts and should be surfaced as lightweight relation chips or
detail-header affordances rather than as extra parents in the tree.

## Contracts

- Shared prompt type gains `parentId` and `order`.
- Shared relation types define graph relation DTOs and queries.
- Desktop preload exposes `prompt.move` and relation CRUD.
- Main-process IPC validates move inputs before calling `PromptDB.movePrompt`.
- `PromptDB.movePrompt` is the source of truth for self-parent, missing-parent,
  invalid-order, and descendant-cycle rejection.

## Persistence

- Fresh SQLite schema includes `parent_id`, `sort_order`, and
  `prompt_relations`.
- Existing databases add missing prompt columns during startup migration.
- Prompt workspace frontmatter stores `parentId` and `order`.
- Backup import sanitizes missing/self parent references.
