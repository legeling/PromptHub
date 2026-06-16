# Plugin Management Spec

## Added Requirements

### Requirement: FR-PLUGIN-001 Plugin as a First-Class Distribution Surface

PromptHub MUST model Plugin as a first-class distribution surface beside Skill and MCP.

Plugin is a higher-level installable bundle. It may contain one or more Skills, MCP server definitions, Apps/connectors, commands, hooks, assets, templates, documentation, and marketplace metadata.

#### Scenario: Distinguish plugin from skill

- **GIVEN** a package contains multiple Skills plus MCP configuration
- **WHEN** PromptHub scans the package
- **THEN** PromptHub classifies it as a Plugin package with child assets
- **AND** it does not collapse the whole package into one Skill

#### Scenario: HyperFrames-style package

- **GIVEN** a package provides a coordinated feature set rather than one task workflow
- **WHEN** users view it in PromptHub
- **THEN** PromptHub presents it as a Plugin with an inventory of included capabilities

#### Scenario: Single-skill package is not a plugin bundle

- **GIVEN** a source contains only one `SKILL.md` and no package-level inventory, scripts, MCP config, commands, hooks, app/connectors, assets, or other child capability groups
- **WHEN** PromptHub scans the source
- **THEN** PromptHub classifies it as a Skill package rather than a Plugin bundle
- **AND** Plugin Store does not present it as a full Plugin

#### Scenario: Runtime hook module is not a plugin bundle

- **GIVEN** a target calls a single JS/TS function, hook module, or entrypoint a plugin
- **WHEN** the target format cannot declare or carry multiple child capability groups as one installable bundle
- **THEN** PromptHub marks that target as runtime-only instead of an enabled Plugin adapter

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

#### Scenario: Inspect installed plugin as a full detail page

- **GIVEN** a plugin is installed in My Plugins
- **WHEN** the user opens the installed plugin from the My Plugins list
- **THEN** PromptHub renders a full Plugin detail page instead of a modal dialog
- **AND** the detail page shows Plugin identity, description, child inventory, source metadata, local package path, and source/manifest content
- **AND** the detail page exposes a Files tab that reuses the existing Skill file browser/editor against the installed Plugin local package path
- **AND** the detail page includes an Agent Plugin distribution panel for supported targets, but does not write target Agent config until an adapter-backed confirmation-gated distribution flow is executed

#### Scenario: Distribute selected child assets

- **GIVEN** a plugin is installed
- **WHEN** the user chooses selected target agents
- **THEN** PromptHub lets users distribute compatible child Skills/MCP entries through the existing Skill and MCP distribution flows
- **AND** each target write has preview, conflict detection, backup, and rollback behavior matching the child asset type

### Requirement: FR-PLUGIN-007 Plugin Store

PromptHub MUST provide a Plugin Store model that can represent official, verified, community, Git, and local plugin sources.

#### Scenario: Built-in OpenAI curated source

- **GIVEN** PromptHub initializes Plugin Store sources
- **WHEN** the user opens Plugin Store
- **THEN** PromptHub includes the public OpenAI curated marketplace source named `openai-curated`
- **AND** the source points to `https://github.com/openai/plugins` with marketplace file `.agents/plugins/marketplace.json`
- **AND** the Plugin Store defaults to the Codex official source when it is available

#### Scenario: Built-in PromptHub official source

- **GIVEN** PromptHub initializes Plugin Store sources
- **WHEN** the user opens Plugin Store
- **THEN** PromptHub includes the PromptHub official marketplace source named `prompthub-official`
- **AND** the source points to `https://github.com/legeling/PromptHub` with marketplace file `.agents/plugins/marketplace.json`

#### Scenario: Store source provenance

- **GIVEN** a plugin appears in a store list
- **WHEN** PromptHub renders the entry
- **THEN** the entry shows source/provenance and does not imply community entries are first-party
- **AND** official-source cards do not render a second standalone official trust badge when the source label already communicates the official source
- **AND** the store page title uses the Plugin surface name, such as `Plugins Store` or `Plugins 商店`, while individual sources use provenance labels such as `Codex Official Store` or `Codex 官方商店`
- **AND** card-level child inventory chips use human-readable user-facing capability counts instead of raw inventory key/count notation
- **AND** card-level inventory does not surface connector/auth implementation details such as `Apps` as a primary card chip; the full inventory remains visible in detail

#### Scenario: Plugin Store uses app-shell search and card-level detail

- **GIVEN** the user opens the Plugins module
- **WHEN** PromptHub renders My Plugins or Official Store
- **THEN** Plugin search appears in the global app top bar, not inside the Plugin Store content area
- **AND** the Plugin Store content area does not render category chips above the list
- **AND** store source selection is driven by the Plugin navigation/sidebar state rather than duplicated above the list
- **AND** the first-level `Plugins Store` sidebar entry follows the Skill Store sidebar pattern and does not show marketplace item-count pills
- **AND** list cards use the whole card as the detail entry point without separate right-side view/install/delete buttons
- **AND** store install actions remain available from the store detail modal or batch action toolbar
- **AND** installed Plugin delete actions remain available from the full installed Plugin detail page or batch action toolbar

#### Scenario: Plugin Store cards use manifest presentation metadata

- **GIVEN** a marketplace entry has a `.codex-plugin/plugin.json` with `interface.displayName`, `interface.shortDescription`, `interface.longDescription`, `interface.composerIcon`, `interface.logo`, or `interface.brandColor`
- **WHEN** PromptHub previews the store entry or background-enriches the visible Official Store list
- **THEN** the card uses the manifest display name, richer description, official icon/logo, brand color, inventory, and semantic classification when available
- **AND** the card falls back to the marketplace entry only when manifest preview metadata is not available yet
- **AND** invalid, unsafe, non-HTTP, or package-escaping icon/logo paths are not rendered
- **AND** when an official GitHub manifest declares `skills` as a directory path, PromptHub expands the repository tree and counts nested `SKILL.md` files instead of treating the directory string as one Skill

#### Scenario: Plugin Store reuses cached manifest presentation metadata

- **GIVEN** PromptHub has previously previewed or background-enriched a marketplace Plugin manifest
- **WHEN** the user reopens the Plugin Store or reloads marketplace entries
- **THEN** PromptHub reads cached manifest presentation metadata from local config and shows the official icon, description, inventory, and semantic classification immediately
- **AND** PromptHub does not refetch that manifest only because the user reopened the store
- **AND** missing cache entries are background-enriched with bounded concurrency and persisted for later sessions

#### Scenario: Preview Codex marketplace manifest

- **GIVEN** a plugin appears in the Codex official marketplace
- **WHEN** the user previews the store entry
- **THEN** PromptHub reads the entry's `.codex-plugin/plugin.json` without executing plugin code
- **AND** it shows manifest display name, short description, long overview/introduction, official icon/logo, brand color, version, author, category, package path, manifest URL, policy metadata, child inventory, semantic classification, and Codex detail link
- **AND** unsupported single-skill or runtime-module packages are labeled before install

#### Scenario: Install Codex marketplace package

- **GIVEN** a Codex official marketplace entry passes the Plugin semantic gate
- **WHEN** the user installs it in the desktop app
- **THEN** PromptHub downloads the package into its managed plugin workspace using Git transport
- **AND** it records managed path, local repository path, local package path, source identity, inventory, and version in the Plugin library
- **AND** it does not require Codex CLI, GitHub REST API metadata, child asset distribution, MCP startup, dependency install, or App authorization

### Requirement: FR-PLUGIN-008 Agent Assistant Integration Contract

PromptHub SHOULD expose plugin installation and distribution as callable internal capabilities for the future Agent Assistant.

#### Scenario: Natural-language plugin install

- **GIVEN** the user asks the Assistant to install a plugin from a URL and distribute selected child assets
- **WHEN** the Assistant resolves the intent
- **THEN** it calls the same scan, preview, install, and distribution APIs used by the Plugin UI
- **AND** any destructive write, config overwrite, MCP enablement, or App authorization remains confirmation-gated

### Requirement: FR-PLUGIN-009 Agent Plugin Adapter Support

PromptHub MUST model Plugin support as an adapter matrix across agent-native bundle formats.

#### Scenario: Codex is a native package target

- **GIVEN** PromptHub renders Plugin target compatibility
- **WHEN** Codex CLI or Codex app is available
- **THEN** PromptHub marks Codex as a native package target
- **AND** it may use Codex marketplace and plugin commands where available

#### Scenario: Agents with bundle concepts are adapter targets

- **GIVEN** an agent has its own bundle package concept such as Claude Code plugins, Cursor plugins, Gemini CLI extensions, Kiro powers, or GitHub Copilot / VS Code Agent Plugins
- **WHEN** PromptHub renders Plugin target compatibility
- **THEN** PromptHub marks the agent as an adapter target, not as a Codex-native target
- **AND** the install flow explains that PromptHub will generate or install the target-native package format

#### Scenario: Runtime-only plugin mechanisms are disabled

- **GIVEN** an agent has a plugin mechanism that primarily loads hook modules, function entrypoints, or runtime tools rather than a bundle inventory
- **WHEN** PromptHub renders Plugin target compatibility
- **THEN** PromptHub marks the agent as runtime-only
- **AND** the target remains visible but disabled/greyed out in the first implementation
- **AND** OpenCode and Cline SDK / CLI / Kanban are runtime-only until PromptHub designs a separate wrapper installer

#### Scenario: Agents without a bundle concept use composite installation

- **GIVEN** an agent only exposes separate customization surfaces
- **WHEN** PromptHub adapts a Plugin to that agent
- **THEN** PromptHub labels the target as composite
- **AND** first implementation keeps the target disabled/greyed out
- **AND** any future enabled composite install must show which target-native surfaces will be written before applying changes

#### Scenario: Agent Plugin uses the Agent Skill workspace pattern

- **GIVEN** the user opens the Agent Plugin page
- **WHEN** PromptHub renders Plugin target compatibility
- **THEN** the page uses the same workbench pattern as Agent Skill: a left agent target list, a right selected-target detail header, target status chips, and a scrollable My Plugins inventory list
- **AND** it does not render the target matrix as detached compatibility cards
- **AND** disabled targets remain visible and greyed out with the unsupported reason available in the detail pane

## Open Decisions

- First implementation source of truth is decided: filesystem-backed `config/plugin-library.json`, matching MCP's current local-library pattern. `[待确认]` remains only for a later migration to SQLite or hybrid metadata if child bindings, sync, and update history require it.
- `[待确认]` Whether PromptHub should mirror a curated OpenAI-compatible Plugin Store index or let users add arbitrary official/community store sources first.
- `[待确认]` Whether App/connector entries should be managed as PromptHub-local metadata first, or only as links to Codex/ChatGPT app authorization flows.
- `[待确认]` Whether plugin updates should be versioned independently of child Skill versions.
- `[待确认]` First adapter implementation order after Codex: Claude Code, Cursor, Gemini CLI, GitHub Copilot, or Kiro.
