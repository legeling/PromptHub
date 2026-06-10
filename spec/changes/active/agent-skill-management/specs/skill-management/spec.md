# Skill Management Delta

## Added Requirements

### Agent-local Skill browsing

PromptHub SHALL provide an Agent-dimension Skill management view that scans each detected Agent/platform Skill directory and lists both copied Skill folders and symlinked Skill folders.

#### Scenario: Hydrate custom Agent roots safely

- Given current-version renderer settings localStorage contains malformed or duplicate custom Agent records
- When PromptHub hydrates settings
- Then custom Agent entries SHALL be normalized before Agent Skill views consume them
- And empty entries, duplicate roots, non-string config paths, and stale legacy root arrays SHALL NOT create invalid Agent scan targets.

#### Scenario: Browse before opening detail

- Given a detected Agent has one or more Skill folders
- When the Agent Skills view scans that Agent
- Then the view SHALL render the Agent list and scanned Skill cards
- And it SHALL NOT auto-open a detail pane for the first scanned Skill
- When the user clicks a scanned Skill card
- Then the view SHALL open the shared full-width Skill detail surface with a back action
- And the detail surface SHALL reuse the standard Skill header, preview, source, files, markdown rendering, and page transition styles.

#### Scenario: Long Agent inventories remain reachable

- Given PromptHub detects more Agents than can fit vertically in the Agent list
- When the Agent Skills view is open
- Then the Agent list SHALL scroll within its pane
- And the global app shell SHALL remain fixed.

#### Scenario: Refresh feedback

- Given Agent/platform discovery or Agent Skill scanning is in progress
- When the user sees the corresponding refresh control
- Then the refresh icon SHALL animate until the operation completes.

#### Scenario: Agent icons

- Given an Agent/platform has a known platform id
- When the Agent list is rendered
- Then PromptHub SHALL render the shared platform icon asset for that Agent instead of a text initial placeholder.

#### Scenario: Agent-local actions

- Given a scanned Agent-local Skill is open in the detail surface
- Then PromptHub SHALL allow opening the local folder, opening the matching My Skills item when one exists, and uninstalling the Agent-local copy or symlink from that Agent directory.

### Chinese product terminology

PromptHub SHALL use `Skill` as the product term in Simplified Chinese and Traditional Chinese UI strings, instead of translating it as `技能`.

## Verification Requirements

- Renderer tests SHALL prove scan results render without a persistent detail pane.
- Renderer tests SHALL prove clicking a scanned Skill opens the full-width detail surface and back returns to browse mode.
- Renderer tests SHALL prove uninstall still calls the platform uninstall API with the selected Agent id and platform-local Skill path.
- Typecheck and lint SHALL pass after extending the shared Skill detail page for Agent-local Skill contexts.
