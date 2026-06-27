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

### Requirement: Separate Tree Parent From Related Prompt Links

PromptHub MUST treat the tree parent as a single primary hierarchy and related
prompt links as many-to-many lightweight associations.

#### Scenario: Preserve Deterministic Tree Ownership

- GIVEN prompt A is related to multiple prompts through related prompt links
- THEN A still has at most one `parentId`
- AND non-tree links are represented as `related_to` rows through
  `prompt_relations`, not by assigning multiple tree parents.

### Requirement: Inline Related Prompt Editing

The desktop app MUST allow users to manage non-tree related prompt links from
the existing prompt detail surfaces without making the relationship editor a
dominant action.

#### Scenario: Add A Related Prompt Link

- GIVEN prompt A is selected in the existing prompt detail area
- WHEN the user opens the quiet related-prompts action
- AND chooses a target prompt
- THEN PromptHub creates a `related_to` `prompt_relations` row from prompt A to
  the target
- AND the link appears in the related prompts editor.

#### Scenario: Navigate And Remove A Related Prompt Link

- GIVEN prompt A has a related prompt link
- WHEN the user clicks the related prompt chip
- THEN PromptHub selects that related prompt in the current prompt UI
- WHEN the user removes the related prompt chip
- THEN PromptHub deletes only that related prompt link
- AND prompt A's tree `parentId` and child ordering are unchanged.

### Requirement: All-Prompt Relationship Graph

The desktop prompt sidebar MUST expose a relationship graph entry near the
existing prompt collection filters, and the graph MUST show all prompts by
default.

#### Scenario: Open Relationship Graph From Sidebar

- GIVEN the desktop prompt sidebar is visible
- WHEN the user clicks Relationship Graph under Favorites
- THEN PromptHub switches the prompt view mode to graph
- AND clears folder ownership for the view
- AND uses the all-prompt type filter
- AND the graph view receives the full prompt collection, not the currently
  filtered prompt list.

#### Scenario: Return To Ordinary Prompt Collections

- GIVEN the relationship graph is active
- WHEN the user opens Favorites, a folder, a tag, or a prompt type collection
- THEN PromptHub switches back to the ordinary card prompt view
- AND applies the selected collection.

### Requirement: Stable Hierarchy Card Alignment

Prompt cards MUST keep hierarchy controls in a fixed rail so titles remain
scannable as collapse controls, drag handles, type icons, favorite icons, and
child counts appear or disappear.

#### Scenario: Render Nested Prompt Card

- GIVEN a nested prompt has children and optional metadata icons
- WHEN PromptHub renders the prompt card
- THEN the card title starts after a fixed control rail and bounded depth indent
- AND optional controls do not add extra leading offset before the title
- AND the collapse affordance is attached to the child-count control rather than
  occupying hidden space before the title.

#### Scenario: Render Leaf Child Prompt Card

- GIVEN a nested prompt has a tree parent but no children
- WHEN PromptHub renders the prompt card
- THEN PromptHub does not render an empty collapse affordance before the title
- AND hierarchy decoration does not draw over the parent prompt label or prompt
  content.

### Requirement: Child Count Sorting

The desktop prompt sort menu MUST include child-count sort options for users
who want to surface grouping hubs or leaf prompts.

#### Scenario: Sort By Direct Child Count

- GIVEN the current prompt collection contains parent-child prompt hierarchy
- WHEN the user chooses child count descending
- THEN prompts with more direct visible child prompts sort before prompts with
  fewer direct visible child prompts
- WHEN the user chooses child count ascending
- THEN prompts with fewer direct visible child prompts sort before prompts with
  more direct visible child prompts
- AND pinned prompts only sort before unpinned prompts when their direct child
  counts are equal.
- AND the card and table tree display preserves that sort order after
  flattening parent-child hierarchy for rendering.

### Requirement: Create Child From Selected Prompt Node

When users create a prompt while a prompt node is selected, PromptHub MUST
default the new prompt to that selected node's child instead of creating a
same-level sibling.

#### Scenario: Create Prompt Under Selected Prompt Node

- GIVEN the desktop prompt module has prompt A selected
- WHEN the user creates a new prompt from the top-bar create action
- THEN the created prompt payload uses prompt A's id as `parentId`
- AND the created prompt inherits prompt A's folder when the create form does
  not explicitly provide another folder
- AND callers can still explicitly pass `parentId: null` to create a root
  prompt.

### Requirement: Stronger Child Indentation

Prompt tree rows/cards MUST use enough indentation for users to visually
distinguish children from parents.

#### Scenario: Render Child Prompt Indentation

- GIVEN a nested prompt is displayed in the compact card tree
- WHEN PromptHub renders that prompt at depth N
- THEN the title row is indented by the configured per-level tree indent
- AND parent chips stay aligned with the title content instead of collapsing
  back toward the parent row.
