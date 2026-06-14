# Design

## Boundary

Owner modules:

- `packages/shared`: Prompt contract adds optional `parentId` and `order`.
- `packages/shared`: Prompt relation contracts add typed relation kinds and DTO/query shapes.
- `packages/db`: SQLite schema, migration, prompt row mapping, move validation, sibling order rewrite, and `PromptRelationDB`.
- `apps/desktop/src/main`: IPC bridge for `prompt:move` and prompt relation CRUD.
- `apps/desktop/src/preload` and renderer services/store: desktop API exposure and fallback implementation.
- `apps/desktop/src/renderer/components/prompt/PromptListView.tsx`: tree display, drag/drop, Tab / Shift+Tab editing, relation badges, and compact relation chooser.
- `apps/desktop/src/renderer/services/database-backup*.ts`: prompt relation export/import validation and restore.

Source of truth:

- SQLite `prompts.parent_id` and `prompts.sort_order` are V1 durable state for `grouped_under`.
- SQLite `prompt_relations` is durable state for non-tree graph relationships.
- React state only renders and requests moves. It must not be the durable authority for relationship validity.

## Relationship Semantics

The hierarchy is logical grouping, not ownership:

- Parent Prompt does not own child Prompt content.
- Parent Prompt deletion does not delete child Prompts.
- Child Prompt does not inherit system/user prompt content, variables, tags, model settings, or folder membership.
- Folder hierarchy remains separate from Prompt hierarchy. Folders organize storage/navigation; Prompt hierarchy expresses Prompt-to-Prompt logic.

The relationship vocabulary is intentionally typed:

- `grouped_under`: tree browsing and topic/task grouping.
- `related_to`: loose graph edge.
- `variant_of`: fork or specialization.
- `depends_on`: prerequisite context.
- `next_step`: workflow order.

`grouped_under` remains the tree projection on `prompts.parent_id`. The four non-tree kinds are stored in `prompt_relations`; `related_to` is canonicalized as an undirected edge, while `variant_of`, `depends_on`, and `next_step` keep source-to-target direction.

## Data and Migration

Fresh schema:

- Add `prompts.parent_id TEXT REFERENCES prompts(id) ON DELETE SET NULL`.
- Add `prompts.sort_order INTEGER DEFAULT 0`.
- Add indexes for parent and sort order.
- Add `prompt_relations`:
- `source_prompt_id` and `target_prompt_id` reference `prompts(id)` with `ON DELETE CASCADE`.
- `kind` is constrained to `related_to`, `variant_of`, `depends_on`, or `next_step`.
- self-relations are rejected with `CHECK(source_prompt_id != target_prompt_id)`.
- duplicate `(source_prompt_id, target_prompt_id, kind)` rows are prevented.
- indexes cover source, target, and kind lookup.

Existing databases:

- `initDatabase` must add both columns if missing.
- `databaseAppearsCurrent` must include these columns so pre-migration backup behavior still triggers for older user DBs.

Move behavior:

- Reject self-parenting.
- Reject missing parent IDs.
- Walk the target parent ancestor chain and reject cycles.
- Rewrite sibling order as contiguous `0..n` values for the old and new parent groups.

Relation behavior:

- Reject empty prompt IDs, missing prompts, unsupported relation kinds, and self-relations.
- Treat duplicate creates as idempotent; if a duplicate includes a new note, update the existing relation note.
- Canonicalize `related_to` endpoint order so users can create the same loose association from either direction without duplicates.
- Delete Prompt rows cascade-delete graph relations, while tree children are detached through `parent_id ON DELETE SET NULL`.

## UI Interaction

List mode becomes the hierarchy editor:

- Drag into the center of a row: open a compact relationship chooser.
- Choosing `grouped_under`: group under that Prompt.
- Choosing `related_to`, `variant_of`, `depends_on`, or `next_step`: create a graph relation without moving the Prompt in the tree.
- Drag above or below a row: reorder at that row's parent level.
- `Tab`: indent under previous sibling.
- `Shift+Tab`: outdent to the parent level.

The tree list defensively renders missing-parent prompts at root level and avoids infinite recursion if corrupted data already contains a cycle.

Prompt rows render compact graph relation badges by kind. The badges are read-only in this iteration; editing/deleting relation metadata can be added later without changing the storage contract.

## Backup and Restore

- `promptRelations` are exported with desktop backups.
- Selective prompt export includes only relations whose source and target prompts are both included in the exported prompt set.
- File import sanitization drops malformed relations and relations pointing to dropped/missing prompts before restore.
- Main-process restore recreates graph relations after prompts and prompt versions have been restored.
- IndexedDB fallback refuses relation-bearing backups instead of silently discarding graph data.

## Tradeoffs

- Keeping `parentId/order` minimizes churn and preserves contributor credit, but it is only a V1 projection of `grouped_under`.
- Keeping tree grouping as `parentId/order` preserves contributor history and list performance, while `prompt_relations` avoids overloading that field for graph semantics.
- A graph view can be built later from `prompt_relations` without replacing the direct drag interaction.
- Replacing the old table list means some table-specific batch affordances are not present in list mode. Existing card/gallery/kanban/context menu actions still cover the main single-item workflows.
