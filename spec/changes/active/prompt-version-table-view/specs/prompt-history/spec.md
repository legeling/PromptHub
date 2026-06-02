# Prompt History Table View Spec

## ADDED Requirements

### Requirement: Prompt history offers a table view

The desktop Prompt history modal SHALL provide a table view that lists multiple prompt versions side by side using fields already stored in `PromptVersion`.

#### Scenario: User scans multiple versions

- Given a prompt has current and historical versions
- When the user selects the table view
- Then the modal shows version rows with system prompt, user prompt, variables, AI response, and change note columns
- And the table does not require selecting exactly two versions before it can render

### Requirement: Changed fields are visually identifiable

The table view SHALL mark cells whose value differs from the next older version.

#### Scenario: User identifies a changed prompt field

- Given v3 and v2 have different user prompts
- When the table view is shown
- Then the v3 user prompt cell is marked as changed
- And unchanged fields remain visually quiet

### Requirement: Field cells can open a focused diff

The table view SHALL let users open a focused field diff between a version and the next older version.

#### Scenario: User clicks a changed field

- Given a table row has a changed user prompt cell
- When the user clicks that cell
- Then the modal shows a diff for that field from the older version to the selected version
