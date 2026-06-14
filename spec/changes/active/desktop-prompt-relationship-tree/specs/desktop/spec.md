# Desktop Prompt Relationship Tree Spec

## Added Requirements

### Requirement: Existing UI Drag Grouping

The desktop app MUST allow users to group prompts by dragging within the
existing prompt list/table surfaces without opening a separate relationship
workbench.

#### Scenario: Drop Prompt Into Another Prompt

- GIVEN two prompts are visible in the prompt list or table
- WHEN the user drags prompt A onto the middle area of prompt B
- THEN prompt A is saved with `parentId` equal to prompt B's id
- AND prompt A is ordered after any existing children of prompt B

#### Scenario: Drop Prompt Before Or After A Sibling

- GIVEN prompt A and prompt B are visible
- WHEN the user drops prompt A on the top third of prompt B
- THEN prompt A is saved before prompt B within B's parent
- WHEN the user drops prompt A on the bottom third of prompt B
- THEN prompt A is saved after prompt B within B's parent

### Requirement: Hierarchy Safety

The persistence layer MUST reject invalid prompt hierarchy mutations.

#### Scenario: Reject Invalid Moves

- WHEN a move attempts to parent a prompt under itself
- OR parent a prompt under one of its descendants
- OR use a missing parent id
- OR use a negative order
- THEN the move is rejected and the existing hierarchy is preserved.

### Requirement: Durable Relationship Data

Prompt hierarchy MUST survive database reload, workspace sync, and backup
import.

#### Scenario: Preserve Hierarchy Fields

- GIVEN a prompt has `parentId` and `order`
- WHEN PromptHub writes workspace prompt files
- THEN the prompt frontmatter includes `parentId` and `order`
- WHEN PromptHub parses those files again
- THEN the same hierarchy fields are restored.

### Requirement: Collapsible Prompt Tree

Prompt hierarchy controls MUST allow users to hide and reveal child prompts
without leaving the existing list or table surface.

#### Scenario: Collapse And Expand Prompt Children

- GIVEN prompt A has child prompt B
- WHEN the user clicks A's collapse control
- THEN B is hidden from the visible prompt list/table
- WHEN the user clicks A's expand control
- THEN B is visible again under A.

### Requirement: Separate Tree Parent From Graph Relations

PromptHub MUST treat the tree parent as a single primary hierarchy and graph
relations as many-to-many semantic links.

#### Scenario: Preserve Deterministic Tree Ownership

- GIVEN prompt A is related to multiple prompts through graph relations
- THEN A still has at most one `parentId`
- AND non-tree relations are represented through `prompt_relations`, not by
  assigning multiple tree parents.
