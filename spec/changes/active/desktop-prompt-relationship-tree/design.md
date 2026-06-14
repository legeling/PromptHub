# Design

## Boundary

Owner modules:

- `packages/shared`: Prompt contract adds optional `parentId` and `order`.
- `packages/db`: SQLite schema, migration, prompt row mapping, move validation, sibling order rewrite.
- `apps/desktop/src/main`: IPC bridge for `prompt:move`.
- `apps/desktop/src/preload` and renderer services/store: desktop API exposure and fallback implementation.
- `apps/desktop/src/renderer/components/prompt/PromptListView.tsx`: tree display, drag/drop, Tab / Shift+Tab editing.

Source of truth:

- SQLite `prompts.parent_id` and `prompts.sort_order` are V1 durable state for `grouped_under`.
- React state only renders and requests moves. It must not be the durable authority for relationship validity.

## Relationship Semantics

The hierarchy is logical grouping, not ownership:

- Parent Prompt does not own child Prompt content.
- Parent Prompt deletion does not delete child Prompts.
- Child Prompt does not inherit system/user prompt content, variables, tags, model settings, or folder membership.
- Folder hierarchy remains separate from Prompt hierarchy. Folders organize storage/navigation; Prompt hierarchy expresses Prompt-to-Prompt logic.

The broader relationship vocabulary is intentionally typed:

- `grouped_under`: tree browsing and topic/task grouping.
- `related_to`: loose graph edge.
- `variant_of`: fork or specialization.
- `depends_on`: prerequisite context.
- `next_step`: workflow order.

V1 only implements `grouped_under` because it matches the contributor branch and the user's preferred direct drag interaction.

## Data and Migration

Fresh schema:

- Add `prompts.parent_id TEXT REFERENCES prompts(id) ON DELETE SET NULL`.
- Add `prompts.sort_order INTEGER DEFAULT 0`.
- Add indexes for parent and sort order.

Existing databases:

- `initDatabase` must add both columns if missing.
- `databaseAppearsCurrent` must include these columns so pre-migration backup behavior still triggers for older user DBs.

Move behavior:

- Reject self-parenting.
- Reject missing parent IDs.
- Walk the target parent ancestor chain and reject cycles.
- Rewrite sibling order as contiguous `0..n` values for the old and new parent groups.

## UI Interaction

List mode becomes the hierarchy editor:

- Drag into the center of a row: group under that Prompt.
- Drag above or below a row: reorder at that row's parent level.
- `Tab`: indent under previous sibling.
- `Shift+Tab`: outdent to the parent level.

The tree list defensively renders missing-parent prompts at root level and avoids infinite recursion if corrupted data already contains a cycle.

## Tradeoffs

- Keeping `parentId/order` minimizes churn and preserves contributor credit, but it is only a V1 projection of `grouped_under`.
- A future graph model should likely introduce `prompt_relations` rather than overloading `parentId` for all relation kinds.
- Replacing the old table list means some table-specific batch affordances are not present in list mode. Existing card/gallery/kanban/context menu actions still cover the main single-item workflows.
