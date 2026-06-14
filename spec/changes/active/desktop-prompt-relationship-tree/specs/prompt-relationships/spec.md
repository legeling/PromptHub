# Delta Spec

## Added

- Prompt list mode supports direct tree editing through drag-and-drop.
- Prompt list mode supports keyboard hierarchy editing:
- `Tab` moves the selected Prompt under its previous sibling.
- `Shift+Tab` moves the selected Prompt one level up.
- Prompt hierarchy is represented as logical grouping:
- `parentId` points to the Prompt it is grouped under.
- `order` stores sibling order under the same logical parent.
- Prompt graph relationships are represented as typed links:
- `related_to` stores a loose bidirectional association.
- `variant_of` stores a directed fork/specialization relationship.
- `depends_on` stores a directed prerequisite-context relationship.
- `next_step` stores a directed workflow-sequence relationship.
- Existing SQLite databases must be migrated with `prompts.parent_id` and `prompts.sort_order`.
- Desktop backups must export and restore graph relationships without requiring a separate relationship editor page.

## Modified

- The desktop list view is no longer allowed to render both the old table list and the new tree list at the same time.
- Deleting a parent Prompt must clear children `parentId` values instead of deleting child Prompts.
- Moving a Prompt must reject:
- self-parenting
- moving under one of its descendants
- missing parent Prompt IDs
- negative or non-finite order values

## Relationship Model

PromptHub treats Prompt relationships as typed logical links:

| Kind | Meaning | V1 status |
| --- | --- | --- |
| `grouped_under` | Logical containment or topic/task grouping | Implemented through `parentId/order` |
| `related_to` | Loose bidirectional association | Implemented through `prompt_relations` |
| `variant_of` | Fork, specialization, or adapted version | Implemented through `prompt_relations` |
| `depends_on` | Requires another Prompt as prerequisite context | Implemented through `prompt_relations` |
| `next_step` | Workflow sequence from one Prompt to another | Implemented through `prompt_relations` |

## Scenarios

- When a user drags Prompt B onto the middle area of Prompt A, the list opens a compact relation chooser.
- When the user chooses `grouped_under`, Prompt B becomes grouped under Prompt A.
- When the user chooses `related_to`, `variant_of`, `depends_on`, or `next_step`, PromptHub creates that typed relationship without moving Prompt B in the tree.
- When a user drags Prompt B before or after Prompt A, Prompt B moves to Prompt A's parent level and receives the corresponding sibling order.
- When a user presses `Tab` on a selected Prompt with a previous sibling, the selected Prompt becomes the previous sibling's last child.
- When a user presses `Shift+Tab` on a selected child Prompt, it moves to the level above its current parent.
- When a user deletes a parent Prompt, child Prompts remain in the database and become root-level grouped prompts.
- When a user deletes either endpoint of a graph relationship, that graph relationship is deleted.
- When a user attempts to create a cycle by dragging a parent under its descendant, the move is rejected and existing hierarchy remains unchanged.
- When a user exports a desktop backup, graph relationships are included with the prompt payload and restored after prompts are restored.
