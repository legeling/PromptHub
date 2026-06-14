# Delta Spec

## Added

- Prompt list mode supports direct tree editing through drag-and-drop.
- Prompt list mode supports keyboard hierarchy editing:
- `Tab` moves the selected Prompt under its previous sibling.
- `Shift+Tab` moves the selected Prompt one level up.
- Prompt hierarchy is represented as logical grouping:
- `parentId` points to the Prompt it is grouped under.
- `order` stores sibling order under the same logical parent.
- Existing SQLite databases must be migrated with `prompts.parent_id` and `prompts.sort_order`.

## Modified

- The desktop list view is no longer allowed to render both the old table list and the new tree list at the same time.
- Deleting a parent Prompt must clear children `parentId` values instead of deleting child Prompts.
- Moving a Prompt must reject:
- self-parenting
- moving under one of its descendants
- missing parent Prompt IDs
- negative or non-finite order values

## Relationship Model

PromptHub should treat Prompt relationships as typed logical links. V1 ships only the tree projection:

| Kind | Meaning | V1 status |
| --- | --- | --- |
| `grouped_under` | Logical containment or topic/task grouping | Implemented through `parentId/order` |
| `related_to` | Loose bidirectional association | Design target, not implemented in this PR |
| `variant_of` | Fork, specialization, or adapted version | Design target, not implemented in this PR |
| `depends_on` | Requires another Prompt as prerequisite context | Design target, not implemented in this PR |
| `next_step` | Workflow sequence from one Prompt to another | Design target, not implemented in this PR |

## Scenarios

- When a user drags Prompt B onto the middle area of Prompt A, Prompt B becomes grouped under Prompt A.
- When a user drags Prompt B before or after Prompt A, Prompt B moves to Prompt A's parent level and receives the corresponding sibling order.
- When a user presses `Tab` on a selected Prompt with a previous sibling, the selected Prompt becomes the previous sibling's last child.
- When a user presses `Shift+Tab` on a selected child Prompt, it moves to the level above its current parent.
- When a user deletes a parent Prompt, child Prompts remain in the database and become root-level grouped prompts.
- When a user attempts to create a cycle by dragging a parent under its descendant, the move is rejected and existing hierarchy remains unchanged.
