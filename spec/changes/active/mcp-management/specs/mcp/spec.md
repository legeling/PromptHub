# MCP Management Spec

## Added Requirements

### Requirement: Local MCP Library

PromptHub MUST maintain a local MCP library containing normalized server definitions. The library is the source of truth for the MCP management UI.

#### Scenario: Create a stdio MCP server

- **GIVEN** the user enters a name and command
- **WHEN** the server is saved
- **THEN** PromptHub stores a normalized stdio MCP server with string args/env values and generated timestamps

#### Scenario: Read MCP library without mutation

- **GIVEN** the local MCP library already contains server timestamps
- **WHEN** PromptHub reads or normalizes the library
- **THEN** existing `createdAt` and `updatedAt` values remain unchanged unless the user performs a real mutation

#### Scenario: Save personal MCP notes

- **GIVEN** the user edits personal notes from a My MCP detail page
- **WHEN** PromptHub saves the notes
- **THEN** PromptHub persists `notes` on the local MCP library server record
- **AND** the notes are not projected into external agent target config files

### Requirement: Target-Specific Projection

PromptHub MUST project normalized MCP servers into the target agent's config shape.

#### Scenario: Project to Codex

- **GIVEN** a stdio MCP server named `playwright`
- **WHEN** the user previews Codex config
- **THEN** PromptHub returns TOML under `[mcp_servers.playwright]`

#### Scenario: Project to mcpServers JSON

- **GIVEN** enabled MCP servers
- **WHEN** the user previews Claude, Cursor, Cline, Gemini, Windsurf, Kiro, or custom JSON config
- **THEN** PromptHub returns a JSON object with `mcpServers`

#### Scenario: Omit unsupported Roo Code target

- **GIVEN** PromptHub builds the built-in MCP target preset list
- **WHEN** the preset list is returned to desktop UI, IPC, or CLI flows
- **THEN** it MUST NOT include `Roo Code` / `roo`
- **AND** legacy `roo` target bindings in the local MCP library are ignored on read

#### Scenario: Project to VS Code

- **GIVEN** enabled MCP servers
- **WHEN** the user previews VS Code config
- **THEN** PromptHub returns a JSON object with `servers`

### Requirement: Safe Apply

PromptHub MUST apply MCP config by merging only the managed server entries into the selected target file and preserving unrelated settings.

#### Scenario: Existing user config

- **GIVEN** a target config file already contains unrelated keys
- **WHEN** the user applies one MCP server
- **THEN** unrelated keys remain and a backup file is created before the write

#### Scenario: Same-name external target config conflict

- **GIVEN** a target config file already contains a same-name MCP entry that PromptHub has not recorded as distributed to that target
- **WHEN** the user applies a PromptHub MCP server with that name
- **THEN** PromptHub rejects the write by default and leaves the target file unchanged

#### Scenario: Confirmed overwrite

- **GIVEN** the user explicitly confirms overwrite in the UI or passes `--force` in the CLI
- **WHEN** PromptHub applies a same-name MCP server
- **THEN** PromptHub creates a backup, atomically replaces the target file, and reports which server names were overwritten

#### Scenario: Reapply managed entry

- **GIVEN** PromptHub previously recorded a server binding for the same target path
- **WHEN** the user reapplies the same MCP server to that target
- **THEN** PromptHub may replace the managed entry without requiring force

#### Scenario: Disabled server apply guard

- **GIVEN** the selected MCP servers are all disabled
- **WHEN** the user or API attempts to apply them to an agent target
- **THEN** PromptHub rejects the write, leaves the target file unchanged, and does not record a target binding

#### Scenario: Invalid target config parse failure

- **GIVEN** an existing target config file cannot be parsed
- **WHEN** PromptHub attempts to apply MCP servers to that target
- **THEN** PromptHub rejects the write before creating a backup or modifying any target file or binding

### Requirement: MCP Environment Scope

PromptHub MUST treat MCP environment variables as server-level configuration values stored on the local MCP server record.

#### Scenario: Reuse across agent targets

- **GIVEN** one PromptHub MCP server has env values configured
- **WHEN** the user distributes it to multiple agent targets
- **THEN** the same server-level env values are projected into each selected target config

#### Scenario: No global process mutation

- **GIVEN** the user edits or imports MCP env values in PromptHub
- **WHEN** PromptHub saves those values
- **THEN** PromptHub must update only the MCP library record and must not mutate the operating system environment

### Requirement: Static MCP Health Checks

PromptHub MUST report static configuration issues without pretending to perform live MCP or provider authentication checks.

#### Scenario: Known environment value format warning

- **GIVEN** a saved MCP server has known provider environment variables such as `SLACK_BOT_TOKEN` or `SLACK_TEAM_ID`
- **WHEN** those values are filled with strings that do not match the expected token or id shape
- **THEN** the MCP health check status is `warning`
- **AND** the issues include `INVALID_ENV_VALUE` for the invalid fields
- **AND** the UI must not label those values as healthy only because they are non-empty

#### Scenario: Static check wording

- **GIVEN** the user runs an MCP health check
- **WHEN** PromptHub reports the result
- **THEN** the result copy must describe a static configuration check rather than a live provider connectivity check

### Requirement: My MCP Library Management

PromptHub MUST expose My MCP as a Skill-style manageable library, not only a passive card gallery.

#### Scenario: Switch library density

- **GIVEN** the user is viewing My MCP
- **WHEN** the user switches between Gallery View and List View
- **THEN** PromptHub renders the same filtered MCP servers in the selected view mode with card or row detail entry actions
- **AND** List View uses the same row-first layout as My Skill List View instead of wrapping rows inside a separate card container

#### Scenario: Quick sync one MCP server

- **GIVEN** a saved MCP server is visible on a My MCP card or list row
- **WHEN** the user clicks the quick sync action
- **THEN** PromptHub opens the MCP batch sync dialog scoped to that single MCP server
- **AND** applying the dialog writes only that MCP server ID through the existing safe MCP apply flow

#### Scenario: Wrap crowded gallery-card distribution indicators

- **GIVEN** a My MCP or My Skill gallery card is distributed to many agent platforms
- **WHEN** PromptHub renders the card header
- **THEN** platform indicators wrap within the card instead of overflowing past the card boundary
- **AND** card action buttons render on a separate right-aligned row so download, favorite, and delete actions remain visible

#### Scenario: Paginate large MCP libraries

- **GIVEN** the filtered My MCP result has more entries than the current page size
- **WHEN** the My MCP page renders
- **THEN** PromptHub shows the current item range, total count, page-size selector, and previous/next pagination controls
- **AND** only the current page entries are rendered in the gallery or list body

#### Scenario: Favorite MCP servers

- **GIVEN** a saved MCP server is visible in My MCP
- **WHEN** the user toggles its favorite action from the card, list row, or batch toolbar
- **THEN** PromptHub persists `isFavorite` on that MCP server in the local MCP library
- **AND** the Favorites filter reflects the persisted value after reload

#### Scenario: Batch manage MCP tags

- **GIVEN** the user selects one or more MCP servers in My MCP batch mode
- **WHEN** the user adds or removes a tag through the batch tag dialog
- **THEN** PromptHub updates each selected MCP server's `tags` through the local MCP library update flow
- **AND** the batch toolbar, dialog, and result copy are localized for every supported desktop locale

#### Scenario: Batch sync MCP servers to agent platforms

- **GIVEN** the user selects enabled MCP servers in My MCP batch mode
- **WHEN** the user opens batch sync and applies the selected agent targets
- **THEN** PromptHub applies the selected MCP server IDs to every selected target through the existing safe MCP apply flow
- **AND** disabled selected MCP servers are skipped instead of being written to target config files

#### Scenario: Add saved MCP servers to an Agent

- **GIVEN** the user opens Add from My MCP inside Agent MCP
- **WHEN** PromptHub renders saved MCP servers for the selected Agent target
- **THEN** the dialog uses the same selectable card-grid layout as the existing Skill install dialog
- **AND** clicking a card toggles selection while disabled or already-distributed servers remain unavailable
- **AND** the confirm action remains a footer action below the card grid

#### Scenario: Select detail distribution targets from whole cards

- **GIVEN** the user is viewing the My MCP full detail distribution sidebar
- **WHEN** the user clicks a non-distributed agent platform card body
- **THEN** PromptHub toggles that target selection without requiring the user to hit only the small checkbox icon
- **AND** the selected targets are applied through the existing safe MCP apply flow

#### Scenario: Hide redundant custom target form in detail distribution

- **GIVEN** the user is viewing the My MCP full detail distribution sidebar
- **WHEN** PromptHub renders the platform integration panel
- **THEN** the panel shows built-in agent target cards and the single selected-target apply action
- **AND** it does not show a separate custom target path form or a second apply button below the platform cards

#### Scenario: Show list distribution progress

- **GIVEN** the user switches My MCP to List View
- **WHEN** MCP rows render
- **THEN** each row shows detected target platform indicators and a distributed-count / total-target-count summary matching the My Skill list pattern

#### Scenario: Delete MCP servers from cards or batches

- **GIVEN** one or more MCP servers are selected or visible on a card/list row
- **WHEN** the user requests deletion
- **THEN** PromptHub shows an in-app destructive confirmation dialog
- **AND** confirming deletes the selected MCP servers through the same local library delete flow used by MCP detail pages

### Requirement: Marketplace Templates

PromptHub MUST provide a curated MCP template list that can install into the local MCP library.

#### Scenario: Install a market template

- **GIVEN** the user chooses a marketplace template
- **WHEN** the template is installed
- **THEN** the library contains an editable MCP server copied from the template

#### Scenario: Inspect a market template before install

- **GIVEN** the user opens an MCP Store template detail modal
- **WHEN** the template is not yet installed
- **THEN** the install action is rendered in the modal footer like the existing Skill install flow
- **AND** the detail content is rendered as a single-column flow
- **AND** source, documentation, repository, and trust metadata are shown inline as a normal detail section rather than a separate right-side column
- **AND** installed-state labels use localized shared copy in every supported desktop locale

#### Scenario: Browse preconfigured usable MCP stores

- **GIVEN** PromptHub ships built-in MCP Store sources
- **WHEN** the user expands MCP Store in the left sidebar source navigation
- **THEN** every preconfigured source represents an installable template store with at least one visible MCP template
- **AND** PromptHub does not show zero-template external directory links as default MCP Store sources

#### Scenario: Select an MCP Store source from the left sidebar

- **GIVEN** PromptHub has preconfigured Official MCP Registry, Smithery, and Glama MCP Directory stores
- **WHEN** the user opens MCP Store
- **THEN** the top-level MCP Store menu does not show a template count badge
- **AND** the left sidebar shows each preconfigured store channel directly without an `All Sources` pseudo-channel
- **AND** each preconfigured source count is greater than zero
- **AND** the right content area title, description, and cards are scoped to the selected store channel
- **AND** the right content area does not render a duplicate market-source chip/button filter bar

#### Scenario: Load real remote MCP store catalogs

- **GIVEN** the user opens a preconfigured MCP Store source
- **WHEN** PromptHub loads the source catalog
- **THEN** PromptHub fetches and parses the selected source's remote catalog instead of relying only on the built-in fallback templates
- **AND** Official MCP Registry entries are loaded from the registry JSON API and mapped from `packages` or `remotes` into installable MCP templates
- **AND** Glama and Smithery entries can be parsed from page HTML, embedded JSON, or Next/RSC-style serialized data
- **AND** search queries are applied to the selected source catalog
- **AND** built-in templates are used only as an offline/error fallback when the remote catalog has no usable results

#### Scenario: Install a remote MCP store result

- **GIVEN** an MCP Store card came from a remote catalog response rather than the built-in template list
- **WHEN** the user installs that card from the detail modal
- **THEN** PromptHub installs the full template payload into the local MCP library
- **AND** the install flow does not require the remote result id to exist in the built-in static template registry

### Requirement: Custom MCP Source Creation

PromptHub MUST let users add custom MCP servers from commands, remote URLs, GitHub repositories, local source folders, existing MCP config files, and pasted MCP config content.

#### Scenario: Choose MCP creation method first

- **GIVEN** the user opens the New MCP modal
- **WHEN** the modal first renders
- **THEN** PromptHub shows Skill-style method cards for source import, pasted config import, and manual setup
- **AND** PromptHub does not show source import controls or manual setup fields until the user chooses that method

#### Scenario: Add from a command line

- **GIVEN** the user pastes a command such as `npx -y @modelcontextprotocol/server-memory`
- **WHEN** PromptHub creates an MCP from that source
- **THEN** PromptHub stores a stdio MCP server with the command and args split into editable fields

#### Scenario: Add from a GitHub repository URL

- **GIVEN** the user pastes a GitHub repository URL
- **WHEN** PromptHub creates an MCP from that source
- **THEN** PromptHub stores an editable stdio MCP server with GitHub source metadata and warns that the generated command may need adjustment for non-Node projects

#### Scenario: Add from a remote MCP URL

- **GIVEN** the user pastes a non-repository HTTP URL
- **WHEN** PromptHub creates an MCP from that source
- **THEN** PromptHub stores a streamable HTTP MCP server with the URL

#### Scenario: Add from local source folder

- **GIVEN** the user selects or drops a local source folder
- **WHEN** the folder contains `package.json`, `pyproject.toml`, or `Dockerfile`
- **THEN** PromptHub infers an editable stdio MCP command without installing dependencies or executing project code

#### Scenario: Add by dropping config file

- **GIVEN** the user drops an MCP JSON or Codex TOML config file into the New MCP modal
- **WHEN** PromptHub reads the dropped path
- **THEN** PromptHub imports the MCP server entries from that file into the local MCP library

#### Scenario: Add by pasted config content

- **GIVEN** the user chooses Paste config from the New MCP modal
- **WHEN** the user pastes MCP JSON or Codex TOML config content and imports it
- **THEN** PromptHub parses the server entries through the shared MCP library import logic
- **AND** PromptHub stores only new server names while reporting duplicates as skipped

### Requirement: Agent MCP Entry Actions

PromptHub MUST make MCP entries discovered in agent target configs actionable from the Agent MCP view.

#### Scenario: Inspect external target entry before import

- **GIVEN** an agent target config contains an MCP server name that is not in the PromptHub MCP library
- **WHEN** the user clicks the entry card or card body outside the explicit action buttons
- **THEN** PromptHub opens an Agent MCP detail page showing the target config entry without importing it

#### Scenario: Show runtime information on Agent MCP cards

- **GIVEN** an agent target config contains MCP server entries
- **WHEN** PromptHub renders the Agent MCP entry cards
- **THEN** each card shows MCP-specific runtime information such as command line, URL, transport, canonical server name when distinct, and enabled state
- **AND** the selected agent config path remains in the agent header and detail/source panels instead of being repeated as the primary card content
- **AND** status badges are rendered with metadata, not between card action buttons

#### Scenario: Import external target entry from detail or shortcut

- **GIVEN** the user is viewing an external Agent MCP entry
- **WHEN** the user clicks the entry's import action from the detail page or card action area
- **THEN** PromptHub imports only that selected target entry into My MCP and opens the imported MCP detail
- **AND** PromptHub must not import every MCP entry from the selected agent config file
- **AND** the imported MCP source records the selected Agent target, such as `Codex CLI`, instead of generic config-file import metadata

#### Scenario: Inspect managed target entry before opening My MCP

- **GIVEN** an agent target config contains an MCP server that already exists in the PromptHub MCP library
- **WHEN** the user clicks the entry card or card body outside the explicit action buttons
- **THEN** PromptHub opens an Agent MCP detail page for that target config entry without re-importing the target config

#### Scenario: Open managed target entry from detail or shortcut

- **GIVEN** the user is viewing a managed Agent MCP entry
- **WHEN** the user clicks the entry's open action from the detail page or card action area
- **THEN** PromptHub opens that MCP in the My MCP full detail view without re-importing the target config

#### Scenario: Detail actions match Skill agent action layout

- **GIVEN** the user is viewing an Agent MCP detail page
- **WHEN** the page renders its action strip
- **THEN** PromptHub shows the same pill-style action group pattern used by the Skill agent detail view, including explicit import/open/config/uninstall controls as applicable

#### Scenario: Agent overview bottom action adds from My MCP

- **GIVEN** the user is browsing Agent MCP target entries
- **WHEN** the Agent MCP detail pane footer is shown
- **THEN** PromptHub shows one primary Add MCP action that opens a My MCP selection dialog for the currently selected Agent target
- **AND** selecting saved My MCP servers writes only those selected server IDs into the selected Agent target config through the safe MCP apply flow
- **AND** the Agent MCP footer must not open the New MCP/source/manual creation flow
- **AND** the footer does not expose preview or bulk-apply actions that can write every enabled MCP server into the selected agent config

#### Scenario: Agent overview card action icons stay consistent

- **GIVEN** an Agent MCP target entry card is rendered
- **WHEN** the card shows config, import/open, and uninstall shortcut icons
- **THEN** the shortcuts use one consistent icon-button size, radius, border treatment, and hover behavior, with only semantic color variants for primary and destructive actions

#### Scenario: Open selected agent config from card action

- **GIVEN** an Agent MCP target entry card is rendered
- **WHEN** the user clicks the config-file shortcut
- **THEN** PromptHub opens or reveals the selected agent config file path through the desktop shell bridge
- **AND** PromptHub shows visible success or error feedback for the action

#### Scenario: Remove target entry with explicit confirmation

- **GIVEN** the user is viewing an Agent MCP entry from a target config
- **WHEN** the user clicks the uninstall action
- **THEN** PromptHub shows an in-app confirmation dialog before removing the entry from the selected agent config

#### Scenario: Cancel target entry removal

- **GIVEN** the uninstall confirmation dialog is open for an Agent MCP entry
- **WHEN** the user cancels the dialog
- **THEN** PromptHub leaves the selected agent config unchanged

## Modified Requirements

### Desktop Home Modules

The desktop home module set MUST include MCP beside prompt, skill, and rules, and persisted module visibility/order MUST normalize legacy settings safely.

### Skill Library Cards

My Skill gallery cards SHOULD expose quick distribution indicators for the agent platforms where each Skill is already installed, matching the My MCP card pattern.

#### Scenario: Show distributed agents on Skill cards

- **GIVEN** a Skill is installed into one or more detected agent platforms
- **WHEN** PromptHub renders that Skill in the My Skill gallery
- **THEN** the card shows the installed agent platform icons in the card header

#### Scenario: Show pending distribution on Skill cards

- **GIVEN** a Skill is not installed into any detected agent platform
- **WHEN** PromptHub renders that Skill in the My Skill gallery
- **THEN** the card shows a compact not-distributed state instead of leaving the distribution area ambiguous
