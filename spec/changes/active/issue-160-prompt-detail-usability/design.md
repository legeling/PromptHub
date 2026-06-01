# Design

## Approach

- Reuse the existing inline-edit state in `MainContent.tsx` and extend its draft with `description`.
- Keep the existing full-edit modal and content inline editor behavior intact.
- Add Enter-to-save only for single-line header inputs. Textarea fields keep the existing Ctrl/Cmd+Enter save behavior to avoid breaking normal newline entry.
- Reuse existing `handleMovePrompt` for detail-page folder changes so toast and update semantics stay consistent with context-menu folder moves.
- Pass a `folderPromptCounts` map from `Sidebar` into `SortableTree` and then into `SortableTreeItem`, keeping count rendering at the row component boundary.

## Data

No schema changes. The implementation updates existing `Prompt` fields:

- `title`
- `description`
- `folderId`

## Testing

- Extend `main-content-inline-edit.integration.test.tsx` for Enter-save and detail folder changes.
- Add count rendering coverage where the folder tree row can be exercised without changing DnD behavior.
