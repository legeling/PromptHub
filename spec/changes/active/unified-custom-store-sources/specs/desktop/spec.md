# Desktop Spec Delta

## Added Requirements

### Requirement: Unified Custom Store Source Management

PromptHub MUST expose the same custom store source management pattern for Skill, MCP, and Plugin stores, using the Skill Store behavior as the baseline.

#### Scenario: Add custom store source

- **GIVEN** the user is browsing Skill Store, MCP Store, or Plugin Store
- **WHEN** the user chooses to add a custom store source
- **THEN** PromptHub shows the shared source form with source name, source type, URL/path, and optional git metadata where supported
- **AND** saving the source selects it in that store's source list.

#### Scenario: Edit custom store source

- **GIVEN** a custom store source exists
- **WHEN** the user edits the source
- **THEN** PromptHub uses the shared edit modal behavior and preserves product-specific source mapping.

#### Scenario: Delete custom store source

- **GIVEN** a custom store source exists
- **WHEN** the user clicks delete from the source list or edit modal
- **THEN** PromptHub MUST show a secondary confirmation dialog
- **AND** the source is removed only after confirmation
- **AND** canceling the confirmation leaves the source unchanged.

### Requirement: Product Source Adapters

PromptHub MUST keep product-specific marketplace loading behind adapters rather than duplicating UI behavior.

#### Scenario: MCP source adapter

- **GIVEN** a custom MCP store source is enabled
- **WHEN** the MCP Store loads that source
- **THEN** PromptHub maps the shared custom source to an MCP market source and uses the existing MCP remote store loader.

#### Scenario: Plugin source adapter

- **GIVEN** a custom Plugin store source is enabled
- **WHEN** the Plugin Store loads entries, previews, or installs from that source
- **THEN** PromptHub maps the shared custom source to a Plugin market source and uses the existing Plugin library service.
