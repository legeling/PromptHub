# Plugin Management Spec

## Added Requirements

### Requirement: FR-PLUGIN-001 Plugin as a First-Class Distribution Surface

PromptHub MUST model Plugin as a first-class distribution surface beside Skill and MCP.

Plugin is a higher-level installable bundle. It may contain one or more Skills, MCP server definitions, Apps/connectors, commands, hooks, assets, templates, documentation, and marketplace metadata.

#### Scenario: Distinguish plugin from skill

- **GIVEN** a package contains multiple Skills plus MCP configuration
- **WHEN** PromptHub scans the package
- **THEN** PromptHub classifies it as a Plugin package with child assets
- **AND** it does not collapse the whole package into one Skill unless the manifest explicitly declares a single Skill-only package

#### Scenario: HyperFrames-style package

- **GIVEN** a package provides a coordinated feature set rather than one task workflow
- **WHEN** users view it in PromptHub
- **THEN** PromptHub presents it as a Plugin with an inventory of included capabilities

### Requirement: FR-PLUGIN-002 Official Codex Concept Mapping

PromptHub MUST preserve the official Codex concept boundary when naming and explaining plugin features.

#### Scenario: Explain extension surfaces

- **GIVEN** users inspect PromptHub's Plugin feature
- **WHEN** the UI or docs explain Plugin
- **THEN** it says Skill is reusable workflow instruction, MCP server provides external tools/context, App/connector provides service integration, and Plugin is the installable bundle that can package those parts

### Requirement: FR-PLUGIN-003 Plugin Source Intake

PromptHub MUST support plugin intake from marketplace entries, Git repository URLs, SSH repository URLs, HTTP(S) URLs, and local folders.

#### Scenario: Install from SSH git source

- **GIVEN** the user enters an SSH repository URL
- **WHEN** PromptHub scans the plugin source
- **THEN** PromptHub uses local git and local SSH credentials
- **AND** it does not rely on anonymous GitHub API metadata for the primary scan

#### Scenario: HTTP rate limit guidance

- **GIVEN** the user installs from an HTTP GitHub URL and anonymous metadata requests are rate-limited
- **WHEN** PromptHub reports the error
- **THEN** PromptHub explains that SSH or waiting/retrying can avoid anonymous API limits

### Requirement: FR-PLUGIN-004 Manifest and Inventory Preview

PromptHub MUST scan plugin metadata and show a preview before installation.

#### Scenario: Preview plugin inventory

- **GIVEN** a plugin source contains a valid manifest
- **WHEN** PromptHub completes the static scan
- **THEN** the preview shows plugin identity, version, source, trust/provenance, and child inventory grouped by Skills, MCP servers, Apps/connectors, commands, hooks, and assets

#### Scenario: Reject unsafe paths

- **GIVEN** a plugin package contains child paths with `..`, absolute paths, null bytes, or symlink escapes
- **WHEN** PromptHub scans the plugin
- **THEN** PromptHub rejects or quarantines those entries before install
- **AND** it does not write outside the intended plugin workspace

### Requirement: FR-PLUGIN-005 Static Scan Safety

PromptHub MUST NOT execute plugin code during scan or preview.

#### Scenario: No install-time execution during scan

- **GIVEN** a plugin source contains package scripts, postinstall hooks, shell scripts, or MCP server commands
- **WHEN** PromptHub scans the source
- **THEN** PromptHub may read metadata files and static manifests
- **AND** it must not run scripts, install dependencies, start MCP servers, or call plugin tools

### Requirement: FR-PLUGIN-006 Controlled Install and Distribution

PromptHub MUST separate plugin installation from child capability distribution.

#### Scenario: Install plugin without granting child capabilities

- **GIVEN** a plugin contains Skills, MCP servers, and App connectors
- **WHEN** the user installs the plugin into My Plugins
- **THEN** PromptHub records the plugin and child inventory
- **AND** it does not automatically distribute MCP config to agent targets
- **AND** it does not authorize external Apps/connectors without explicit user action

#### Scenario: Distribute selected child assets

- **GIVEN** a plugin is installed
- **WHEN** the user chooses selected target agents
- **THEN** PromptHub lets users distribute compatible child Skills/MCP entries through the existing Skill and MCP distribution flows
- **AND** each target write has preview, conflict detection, backup, and rollback behavior matching the child asset type

### Requirement: FR-PLUGIN-007 Plugin Store

PromptHub MUST provide a Plugin Store model that can represent official, verified, community, Git, and local plugin sources.

#### Scenario: Store source provenance

- **GIVEN** a plugin appears in a store list
- **WHEN** PromptHub renders the entry
- **THEN** the entry shows source/provenance and does not imply community entries are first-party

### Requirement: FR-PLUGIN-008 Agent Assistant Integration Contract

PromptHub SHOULD expose plugin installation and distribution as callable internal capabilities for the future Agent Assistant.

#### Scenario: Natural-language plugin install

- **GIVEN** the user asks the Assistant to install a plugin from a URL and distribute selected child assets
- **WHEN** the Assistant resolves the intent
- **THEN** it calls the same scan, preview, install, and distribution APIs used by the Plugin UI
- **AND** any destructive write, config overwrite, MCP enablement, or App authorization remains confirmation-gated

## Open Decisions

- `[待确认]` Plugin local source of truth: filesystem-backed `config/plugin-library.json`, SQLite tables, or hybrid DB metadata plus repo directory.
- `[待确认]` Whether PromptHub should mirror a curated OpenAI-compatible Plugin Store index or let users add arbitrary official/community store sources first.
- `[待确认]` Whether App/connector entries should be managed as PromptHub-local metadata first, or only as links to Codex/ChatGPT app authorization flows.
- `[待确认]` Whether plugin updates should be versioned independently of child Skill versions.
