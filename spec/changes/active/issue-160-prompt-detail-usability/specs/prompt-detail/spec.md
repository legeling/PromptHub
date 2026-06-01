# Prompt Detail Usability Delta

## Requirements

### REQ-160-1 Folder Count Visibility

The Prompt folder tree SHALL display the direct Prompt count for each folder row when the sidebar panel is expanded.

### REQ-160-2 Header Inline Save

The Prompt detail header SHALL allow title and description edits to be saved with Enter.

### REQ-160-3 Empty Description Editing

When a Prompt has no description, the detail header SHALL show an editable placeholder area so users can add a description without opening the full edit modal.

### REQ-160-4 Metadata Row

The Prompt detail metadata row SHALL place Prompt type and folder controls together.

### REQ-160-5 Folder Change

The Prompt detail page SHALL allow changing a Prompt's folder directly and persist the change through the existing Prompt update flow.

## Scenarios

- Given a folder contains one direct Prompt, when the folder tree is visible, then the row shows `1`.
- Given a Prompt detail title is being edited, when the user presses Enter, then the title is saved.
- Given a Prompt detail description is empty, when the user activates the placeholder, types a value, and presses Enter, then the description is saved.
- Given folders exist, when the user changes the folder select in the detail metadata row, then the Prompt `folderId` is updated.
