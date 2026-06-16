# Desktop Prompt Relationship Tree

## Why

Users need a direct way to express logical relationships between prompts without
leaving the existing prompt list. A separate relationship workbench made the
workflow harder to understand and did not match the desktop app's current UI.

## Scope

- Add durable prompt hierarchy fields (`parentId`, `order`) so dragging can
  group prompts and preserve sibling order.
- Add a graph relation table for non-tree related prompt links. The current UI
  creates `related_to` links only; legacy directional kinds remain a storage
  compatibility concern, not a primary product relationship model.
- Wire drag-and-drop into the existing card-list and table prompt surfaces.
- Keep the first interaction simple: dropping into the middle of a prompt groups
  the dragged prompt under it; dropping near the top or bottom reorders among
  siblings.

## Non-Goals

- Do not add a new full-screen relationship workbench.
- Do not replace the current prompt card/table visual system.
- Do not require users to open a modal before basic drag grouping works.

## Risks

- Existing databases need migration columns and the relation table.
- Prompt workspace export/import must preserve hierarchy fields.
- Dragging must reject self-parent and descendant-parent cycles.
