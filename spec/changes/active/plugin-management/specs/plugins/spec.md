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

#### Scenario: Import local plugin package from My Plugins

- **GIVEN** the user has a local folder containing a valid Plugin package manifest
- **WHEN** the user opens the My Plugins `New Plugin` menu, chooses Import local Plugin, and selects that folder
- **THEN** PromptHub imports the package through the same local Plugin package scanner used for Agent Plugin imports
- **AND** PromptHub copies the package into managed Plugin storage before writing My Plugins metadata
- **AND** PromptHub rejects sources that fail the Plugin bundle semantic gate

#### Scenario: My Plugins add actions use a single Skill-style entry

- **GIVEN** the user is viewing My Plugins
- **WHEN** the header is rendered
- **THEN** PromptHub shows one top app bar `New` action instead of permanently showing URL import, local import, and batch-management buttons in the page chrome or content header
- **AND** opening `New Plugin` presents the available add/manage methods in a modal chooser that matches the Skill add flow pattern
- **AND** choosing a method reuses the existing URL import, local folder import, or batch-management flow

#### Scenario: Install from SSH git source

- **GIVEN** the user enters an SSH repository URL
- **WHEN** PromptHub scans the plugin source
- **THEN** PromptHub uses local git and local SSH credentials
- **AND** it does not rely on anonymous GitHub API metadata for the primary scan

#### Scenario: Preview URL source before import

- **GIVEN** the user enters a Git, SSH, or HTTPS Plugin source URL
- **WHEN** PromptHub scans the source
- **THEN** PromptHub shows a confirmation preview with manifest identity, source, semantic classification, child inventory, and unsupported reasons before writing My Plugins metadata
- **AND** cancelling or editing the source leaves My Plugins unchanged

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

#### Scenario: Batch manage installed store plugins

- **GIVEN** the user selects Plugin Store entries in batch mode
- **WHEN** some selected entries are not installed in My Plugins
- **THEN** the batch install action installs only those not-yet-installed entries
- **WHEN** some selected entries are already installed in My Plugins
- **THEN** the batch update action updates those installed Plugins through the same source-update flow as installed Plugin detail
- **AND** the batch remove action removes those installed Plugin records from My Plugins after confirmation
- **AND** removing from the Store surface does not remove imported child Skills/MCP entries or distributed Agent Plugin packages

#### Scenario: Inspect installed plugin as a full detail page

- **GIVEN** a plugin is installed in My Plugins
- **WHEN** the user opens the installed plugin from the My Plugins list
- **THEN** PromptHub renders a full Plugin detail page instead of a modal dialog
- **AND** the detail page shows Plugin identity, description, child inventory, source metadata, local package path, and source/manifest content
- **AND** render failures inside the installed Plugin detail page are contained with a recoverable error state, Back action, and retry action so the Plugin module remains usable
- **AND** the detail page exposes a Files tab that reuses the existing Skill file browser/editor against the installed Plugin local package path
- **AND** the detail page exposes a static package check that validates local package existence, manifest paths, and symlink boundaries without executing plugin code
- **AND** the detail page exposes an AI safety assessment that scans a static Plugin summary containing identity, source provenance, inventory, local package path, and non-execution scope
- **AND** the safety assessment must not execute Plugin code, install dependencies, start MCP servers, run commands/hooks, or authorize Apps/connectors
- **AND** the safety report is stored as PromptHub Plugin metadata and preserved across source refresh or source-update operations
- **AND** the detail page includes an Agent Plugin distribution panel for supported targets, but does not write target Agent config until an adapter-backed confirmation-gated distribution flow is executed
- **AND** long non-files detail tabs show the same Back to Top action as My Skills after scrolling, while the Files tab hides that floating action

#### Scenario: Distribute selected child assets

- **GIVEN** a plugin is installed
- **WHEN** the user imports compatible child Skills or MCP entries from the installed Plugin detail page
- **THEN** PromptHub records the imported child asset IDs as a one-time handoff request for the owning My Skills or My MCP surface
- **AND** PromptHub navigates to that owning surface and opens the existing Skill or MCP batch distribution flow with the imported child assets selected
- **AND** each target write has preview, conflict detection, backup, and rollback behavior matching the child asset type
- **AND** Plugin installation itself still does not automatically distribute child assets to Agent targets

#### Scenario: Delete installed plugin with optional Agent package cleanup

- **GIVEN** a Plugin has been distributed to Agent Plugin targets as copied packages or symlinks
- **WHEN** the user deletes the Plugin from My Plugins
- **THEN** PromptHub removes the My Plugins library entry and PromptHub-managed source package
- **AND** PromptHub preserves distributed Agent Plugin packages by default
- **AND** the delete confirmation offers an explicit option to remove those distributed Agent Plugin packages
- **AND** when the user selects that option, PromptHub deletes only the resolved Agent Plugin package paths for the distributed target IDs
- **AND** it does not remove imported child Skills, MCP entries, App authorizations, user-owned external package sources, or unrelated Agent folders

#### Scenario: Batch distribute installed plugins

- **GIVEN** the user selects multiple Plugins in My Plugins batch mode
- **WHEN** the user chooses the paper-plane distribute action
- **THEN** PromptHub opens one Agent target picker for the selected Plugin packages
- **AND** confirming the picker distributes each selected Plugin package to the chosen Agent Plugin targets through the same copy/symlink distribution contract as single-Plugin distribution
- **AND** the batch action does not import or auto-enable child Skills, MCP servers, Apps/connectors, commands, hooks, or scripts

#### Scenario: Reject unsafe Agent Plugin target paths

- **GIVEN** Agent Plugin distribution resolves a target path
- **WHEN** the resolved path already points to a normal Agent config file, a non-Plugin directory, the Agent root, or another unrelated user-owned path
- **THEN** PromptHub rejects the distribution before deleting, overwriting, copying, or linking files
- **AND** PromptHub leaves the existing config file or directory unchanged
- **AND** PromptHub does not add the target ID to the Plugin's `distributedTargetIds`

#### Scenario: Remove a distributed plugin package from one Agent target

- **GIVEN** a Plugin in My Plugins has already been distributed to a supported Agent Plugin target
- **WHEN** the user chooses the remove action either from the installed Plugin detail page Platform Integration panel or from Agent Plugin for that target
- **THEN** PromptHub asks for confirmation before removing the target package
- **AND** confirming deletes only that target Agent Plugin package path
- **AND** if the resolved path no longer points to a recognizable Plugin package or PromptHub-managed Plugin symlink, PromptHub rejects removal instead of deleting the path
- **AND** PromptHub removes that target ID from the Plugin's recorded `distributedTargetIds`
- **AND** PromptHub keeps the My Plugins entry, managed source package, and other distributed target packages unchanged

#### Scenario: Surface checked source update state on installed cards

- **GIVEN** PromptHub has checked an installed Plugin source from its detail page
- **WHEN** the check reports an available source update, local package changes, or a source/local conflict
- **THEN** the My Plugins card for that Plugin shows the checked update state
- **AND** the card indicator reuses the existing detail-page source update status instead of triggering a new source scan from the card grid

#### Scenario: Manage installed plugins with Skill-style personal controls

- **GIVEN** a Plugin is installed in My Plugins
- **WHEN** PromptHub renders the My Plugins list and detail page
- **THEN** users can favorite or unfavorite the Plugin from both surfaces
- **AND** batch mode lets users favorite or unfavorite selected Plugins with the same all-selected-favorite toggle rule as My Skills
- **AND** favorite state is persisted as PromptHub user metadata and preserved across source refresh or source-update operations
- **AND** My Plugins supports All, Favorites, Distributed, and Pending distribution filters
- **AND** My Plugins supports source filtering in the My Plugins header
- **AND** My Plugins supports combined manifest/source tag and user tag filtering from the shared left-bottom sidebar tag section, matching My Skills instead of rendering a tag selector in the page-top filter row
- **AND** My Plugins supports the same gallery/list view toggle pattern as My Skills
- **AND** gallery view supports persisted card column preferences, including auto and fixed column counts
- **AND** My Plugins paginates large installed libraries with the shared page-size selector and previous/next page controls
- **AND** right-clicking an installed Plugin card or list row opens a context menu for details, favorite, tags, Agent target selection, opening the package folder, and delete
- **AND** Plugin card search matches manifest/source tags and user tags
- **AND** manifest/source tags are displayed as read-only source metadata
- **AND** user-managed tags are persisted separately as `userTags` and preserved across source refresh or source-update operations
- **AND** user-managed personal notes are persisted separately as PromptHub metadata and preserved across source refresh or source-update operations
- **AND** clicking the installed Plugin title copies the title while keeping the cursor style non-editing

#### Scenario: Manage installed plugin package snapshots

- **GIVEN** a Plugin is installed in My Plugins with a readable local package folder
- **WHEN** the user creates a snapshot from the installed Plugin detail page
- **THEN** PromptHub creates an independent Plugin package version starting at `v1`
- **AND** the version stores Plugin metadata plus a static package file snapshot without executing Plugin code
- **AND** the Version History view lets the user inspect snapshot notes, package file names, text file previews, and binary file placeholders
- **AND** restoring a Plugin version restores the Plugin metadata and package files while first preserving the current state as a new safety snapshot
- **AND** deleting a Plugin version removes only that history entry and does not mutate the current Plugin library entry or package files

#### Scenario: Preserve plugin state before source update

- **GIVEN** an installed Plugin has a source update available
- **WHEN** the user confirms a source update that will overwrite the installed Plugin package
- **THEN** PromptHub creates a Plugin package snapshot before applying the update
- **AND** the snapshot starts at the next version number, beginning with `v1` when no prior snapshot exists
- **AND** the snapshot contains the old Plugin metadata and old static package files
- **AND** source checks that are up-to-date or blocked by local-change conflicts do not create new snapshots

### Requirement: FR-PLUGIN-007 Plugin Store

PromptHub MUST provide a Plugin Store model that can represent official, verified, community, Git, and local plugin sources.

#### Scenario: Built-in OpenAI curated source

- **GIVEN** PromptHub initializes Plugin Store sources
- **WHEN** the user opens Plugin Store
- **THEN** PromptHub includes the public OpenAI curated marketplace source named `openai-curated`
- **AND** the source points to `https://github.com/openai/plugins` with marketplace file `.agents/plugins/marketplace.json`
- **AND** users can select it as the Codex Official Store source

#### Scenario: Built-in PromptHub official source

- **GIVEN** PromptHub initializes Plugin Store sources
- **WHEN** the user opens Plugin Store
- **THEN** PromptHub includes the PromptHub official marketplace source named `prompthub-official`
- **AND** the source points to `https://github.com/legeling/PromptHub` with marketplace file `.agents/plugins/marketplace.json`
- **AND** the Plugin Store defaults to this Official Store source when it is available

#### Scenario: Store source provenance

- **GIVEN** a plugin appears in a store list
- **WHEN** PromptHub renders the entry
- **THEN** the entry shows source/provenance and does not imply community entries are first-party
- **AND** official-source cards do not render a second standalone official trust badge when the source label already communicates the official source
- **AND** the store page title uses the Plugin surface name, such as `Plugins Store` or `Plugins 商店`, while individual sources use provenance labels such as `Codex Official Store` or `Codex 官方商店`
- **AND** store cards do not render child inventory count chips such as `1 Skill`, `2 Hooks`, `1 个 Skill`, `Includes` / `包含`, or `Skills · 1`
- **AND** complete child inventory remains visible in the Plugin detail or preview surfaces

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
- **AND** visible cached or partially loaded store cards start manifest presentation prefetch even while slower marketplace source refreshes are still in flight

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
- **AND** clicking a PromptHub-managed My Plugins entry from the Agent Plugin workbench opens the same full installed Plugin detail page used by My Plugins
- **AND** disabled targets remain visible and greyed out with the unsupported reason available in the detail pane

#### Scenario: Agent Plugin shows target-native installed plugins

- **GIVEN** a supported Agent already has Plugin packages installed outside PromptHub, such as Codex cache packages, Claude Code packages recorded in `~/.claude/plugins/installed_plugins.json`, Cursor plugin packages, Gemini CLI extensions, Kiro powers, or GitHub Copilot / VS Code Agent Plugin packages
- **WHEN** the user opens that Agent in Agent Plugin
- **THEN** PromptHub reads the target-native installed package metadata and static capability folders without executing plugin code
- **AND** the selected Agent detail shows those Agent-installed Plugin packages and their inventory counts
- **AND** Agent-installed Plugin cards use direct inventory counts, are clickable as the detail entry point, and do not require import before inspection
- **AND** opening an Agent-installed Plugin card shows a read-only detail page with Agent source, description, inventory, local source path, a Files tab for read-only local package inspection, import-to-My-Plugins, and open-folder actions
- **AND** the Agent-installed Plugin Files tab must not expose file edit, create, rename, delete, or save actions against the external Agent package
- **AND** the Agent-installed packages are not silently added to PromptHub's My Plugins library or treated as PromptHub-managed packages
- **AND** unsupported runtime-only, composite, or pending targets remain greyed out and are not scanned as if separate skill/MCP folders were Plugin packages

#### Scenario: Agent Plugin localizes target support copy

- **GIVEN** the user opens Agent Plugin in any supported desktop locale
- **WHEN** PromptHub renders native, adapter, runtime-only, composite, or pending Plugin targets
- **THEN** target descriptions and disabled-state reasons come from localized UI copy instead of raw adapter metadata
- **AND** disabled runtime-only or composite targets clearly say the Agent does not support PromptHub Plugin bundles instead of only showing internal labels such as `RuntimeOnly` or `Composite`

#### Scenario: Import target-native installed plugins into My Plugins

- **GIVEN** Agent Plugin shows a supported Agent-installed Plugin package with a local package path
- **WHEN** the user chooses to import it
- **THEN** PromptHub performs a static manifest and inventory scan without executing plugin code
- **AND** PromptHub copies the package into its managed `data/plugins` workspace
- **AND** PromptHub records it in My Plugins with source provenance pointing back to the Agent target
- **AND** the original Agent-installed package remains in place
- **AND** packages that do not satisfy the Plugin bundle semantic gate are rejected instead of being silently imported

#### Scenario: Distribute My Plugins to adapter targets

- **GIVEN** My Plugins contains a valid PromptHub Plugin package
- **WHEN** the user distributes it to Claude Code, Cursor, Gemini CLI, Kiro, or GitHub Copilot / VS Code Agent Plugin targets
- **THEN** PromptHub copies the package into the configured Agent Plugin directory
- **AND** PromptHub writes the target-native package marker for that Agent, such as `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `gemini-extension.json`, `POWER.md`, or root `plugin.json`
- **AND** copied child folders and files remain available in the generated target package
- **AND** requesting symlink mode for adapter targets still materializes a generated copy package and reports the actual copy result
- **AND** Codex targets can still preserve Codex native package copy or symlink behavior when the source package already contains `.codex-plugin/plugin.json`

## Open Decisions

- First implementation source of truth is decided: filesystem-backed `data/plugins/library.json`, with first-read migration from legacy `config/plugin-library.json`. `[待确认]` remains only for a later migration to SQLite or hybrid metadata if child bindings, sync, and update history require it.
- `[待确认]` Whether PromptHub should mirror a curated OpenAI-compatible Plugin Store index or let users add arbitrary official/community store sources first.
- `[待确认]` Whether App/connector entries should be managed as PromptHub-local metadata first, or only as links to Codex/ChatGPT app authorization flows.
- Plugin package history now has a first implementation as My Plugins snapshots independent of child Skill versions. Manual snapshots, rollback safety snapshots, and automatic pre-source-update snapshots are implemented. `[待确认]` remains only for future sync/SQLite history migration.
- First adapter package marker generation is implemented for Claude Code, Cursor, Gemini CLI, Kiro, and GitHub Copilot / VS Code. `[待确认]` remains for deeper target-specific installer semantics beyond static marker generation.
