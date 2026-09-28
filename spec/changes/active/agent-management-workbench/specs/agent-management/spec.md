# Agent Management Workbench Delta Specification

## Added Requirements

### `FR-AGENT-138`: One Current Contract Per Agent Capability

Confirmed by the user on 2026-09-28; implementation pending. Each Agent capability
MUST have one current input/data contract, resolved target and execution path.
Platform-native differences belong to the owning adapter. Historical PromptHub
settings, paths, identities and installation records MUST be converted only at
versioned startup/import/restore boundaries; normal repositories, IPC, renderer
and CLI MUST NOT read old aliases, dual-write old fields or select an older path
because the current target is missing. Structured Agent settings and installation
ownership belong to SQLite; package bytes and native files remain on the filesystem,
under the accepted foundation ownership contract.

An explicit copy or symlink request MUST retain its mode. Failure MUST NOT switch
mode, product, account or credential source. A valid current default is distinct
from malformed configuration, which MUST report an error. Installation success
requires observable package availability and required native registration; a dangling
link or historical receipt alone MUST NOT imply installed. Removal requires verified
ownership and MUST preserve unrelated packages and external source directories.

Current upstream format precedence, project/user scopes and supported native
protocols may be handled inside one adapter; they are not permission to guess
historical formats. PromptHub MUST NOT migrate third-party databases or credentials
to conceal an unsupported native version. Unknown native support is reported with
its actual capability state and does not remove otherwise supported capabilities.

#### Scenario: Upgrade and clear an old Agent configuration

- Given a recognized old profile with historical path settings and installation data
- When its versioned conversion completes and the user clears a current override
- Then all entrypoints read the same current SQLite configuration after restart
- And no historical alias or device file silently recreates the cleared value
- And conflicts or interrupted publication preserve recoverable source data

#### Scenario: A chosen installation mode or native source fails

- Given a supported Agent and a valid Skill package
- When symlink creation fails or the chosen native capability cannot be read
- Then the existing installation and external source remain intact
- And the result reports the actual error without trying copy or another product
- And a broken link is never displayed as an available installed Skill

The proposed implementation and evidence inventory are in
[current-contract-design.md](../../current-contract-design.md). Existing conflicting
fallback requirements below have been superseded; historical test results remain
records of the old implementation, not acceptance of this requirement.

### `FR-AGENT-136`: Local Plugin Sources Remain Device-Owned

Importing a local Plugin MUST publish the complete package under
`data/plugins/<plugin-id>` as the durable PromptHub-owned copy. The original
absolute source path MUST remain device-local, MUST NOT enter the portable
Plugin resource, and MUST survive canonical reread and application restart so
that update checks can compare and publish later source revisions.

#### Scenario: Update a local Plugin after restart

- Given a local Plugin was imported and its canonical package was published
- And the original source package changed after PromptHub restarted
- When the user checks and applies the source update
- Then PromptHub reads the device-local source locator
- And snapshots the previous canonical package before publishing the revision
- And missing, malformed, or symbolic-link source roots fail without changing
  the canonical package or version history

### `FR-AGENT-135`: Plugin Materialization Must Not Enter The Canonical Bundle Namespace

Installing, updating, or restoring a Plugin while canonical files are
authoritative MUST materialize incoming package bytes outside
`data/plugins/<resource-id>`. Publication MUST return the canonical bundle view,
remove its temporary materialization, and leave malformed or unrelated
directories unable to masquerade as canonical resources.

#### Scenario: Import a local Plugin under canonical authority

- Given a valid local Plugin package has not yet been published
- When the user imports it into My Plugins
- Then the package is validated and published as one canonical Plugin bundle
- And the temporary package copy is removed
- And restart, distribution, removal, and delete use the canonical copy

### `FR-AGENT-134`: Non-Secret MCP Writes Do Not Require Encryption

Creating, updating, deleting, and restarting an MCP server whose direct secret
maps are empty MUST succeed when the device encryption provider is unavailable.
Any non-empty secret value MUST continue to fail before canonical publication
unless device encryption is available.

#### Scenario: Create a non-secret stdio MCP in an unsigned runtime

- Given device encryption is unavailable
- When the user saves an MCP containing only name, command, args, and references
- Then the canonical MCP resource and version are published
- And no plaintext secret is written

### `FR-AGENT-133`: Usage Reads Require A Detected Agent

PromptHub MUST reject an Agent usage read before any credential, process,
network, or helper probe when that Agent's resolved installation root is not
detected. Startup tray refresh MUST NOT create an absent Agent root or make an
undetected Agent appear in the management workspace.

#### Scenario: Tray refresh sees an absent Antigravity root

- Given Antigravity is not detected in the isolated user profile
- When the startup tray refreshes supported usage adapters
- Then no Antigravity usage helper is started
- And no Antigravity or Gemini root is created or reported as installed

### `FR-AGENT-132`: Provider Names Are Display Labels

Provider Profile identity MUST use the stable profile ID. Exact-case and
case-only duplicate display names MUST coexist within one platform, including
after rename, archive, restart, migration from the former unique-name schema,
and canonical SQLite projection rebuild. Name collisions MUST NOT mutate an
existing profile or its secret reference.

#### Scenario: Duplicate labels remain separate

- Given one platform already has an active Provider named `Shared Label`
- When another Provider is created as `Shared Label` or `shared label`
- Then each Provider has a distinct stable ID and independent configuration
- And restart and canonical projection rebuild preserve all records

### `FR-AGENT-131`: Skill Delete Must Describe Source Ownership

Deleting a Skill from My Skills MUST state that its PromptHub record, managed
package, and version history are removed. The same confirmation MUST state that
linked external source folders are preserved. Copy and symlink distribution
cleanup MUST remain an independent choice and MUST NOT imply that unrelated
Agent or project files are deleted.

#### Scenario: Delete a PromptHub-managed Skill

- Given a manually created Skill owns a PromptHub-managed package and versions
- When the user confirms deletion
- Then the managed package, canonical package state, DB row, and versions are
  removed
- And restarting PromptHub does not resurrect the Skill
- And unrelated files in Agent skill roots remain unchanged

#### Scenario: Delete a linked external Skill

- Given a Skill references a linked external source folder
- When the user confirms deletion
- Then PromptHub metadata and managed canonical state are removed
- And the external source folder is preserved

### `FR-AGENT-001`: Preset Agents Are First-Class Managed Objects

The system MUST expose every user-enabled built-in Agent platform and every enabled custom Agent platform as first-class managed Agents. It MUST reuse the existing platform registry and MUST NOT require or silently create a duplicate Agent Profile record. Missing deep-management adapters MUST NOT remove an enabled Agent from the workspace.

#### Scenario: Existing preset platform

- Given Claude Code is present and enabled in the built-in platform registry
- When the Agents workspace is opened
- Then Claude Code appears with its detected and configured state
- And the user can manage it without creating a profile

#### Scenario: Configured path does not exist yet

- Given the user configured a custom root for a built-in or custom Agent
- And the directory has not been created
- When the Agents workspace is opened
- Then the Agent remains visible as configured but not detected
- And the missing directory is not interpreted as deletion of the Agent

#### Scenario: Preset Agent has limited support

- Given a built-in Agent has identity and asset paths but no native provider or session adapter
- When the Agents workspace is opened
- Then the Agent remains searchable and its detail page can be opened
- And unsupported capabilities are labeled individually

#### Scenario: Agent is disabled in settings

- Given the user disabled a built-in or custom Agent in Agent settings
- When the Agents workspace is opened or refreshed
- Then the disabled Agent does not appear in the workspace list or count
- And enabling it again restores it without changing its platform identity or paths

#### Scenario: Prioritize common Agents

- Given the registry contains common and less common Agent platforms
- When the default Agent list is shown
- Then pinned, installed, configured, and curated common Agents are prioritized
- And every remaining enabled preset Agent stays available through the same list and search

#### Scenario: Default desktop navigation placement

- Given the user has not customized the desktop home module order
- When the desktop navigation is initialized or an older default order is hydrated
- Then `Agents` appears second, immediately after `Prompts` and before `Skills`
- And a genuinely customized complete module order remains unchanged

### `FR-AGENT-002`: Installation And Capability Status

Each managed Agent MUST expose installation detection, executable version where available, resolved roots, config paths, supported capabilities, configuration health, and actionable diagnostics. Detection state and capability support MUST be distinct. Every capability MUST report `supported`, `partial`, `planned`, or `unsupported` independently.

#### Scenario: Adapter is unavailable

- Given an Agent platform is detected
- And no provider adapter exists for that platform
- When its detail page is opened
- Then installation and asset information remains available
- And provider switching is shown as unsupported rather than failed or enabled

#### Scenario: Unified capability controls

- Given two Agents support different management capabilities
- When either Agent detail page is opened
- Then both use the same information architecture and control positions
- And supported capability controls are enabled and actionable
- And unsupported capability controls are visibly disabled with a concise reason
- And the Agent row and detail page themselves remain clickable

#### Scenario: A current Kimi Code root is absent

- Given current Kimi Code uses its declared environment variable or default root
- When that root does not exist
- Then detection reports the current root as absent
- And configuration, credentials and sessions are not read from an older root
- And recognized historical PromptHub configuration is converted only by the
  versioned migration boundary defined in FR-AGENT-138

### `FR-AGENT-003`: Per-Agent Provider Profiles And Model Mapping

The user MUST be able to create, edit, rename, duplicate, import, copy a text export, test, activate, and delete Provider Profiles for supported Agents. The Provider Profile detail action bar MUST expose the focused actions Rename, Create copy, Copy text, and Delete; it MUST NOT expose archive as a parallel lifecycle action. A Provider Profile MUST support platform-specific provider protocol, endpoint, model mappings, environment values, and validated non-secret configuration.

#### Scenario: Focused Provider Profile actions

- Given a custom Provider Profile is selected
- When the user opens its detail actions
- Then rename changes only the profile display name
- And create copy produces a separately identified profile
- And copy text writes the credential-free portable representation to the clipboard
- And delete retains the existing destructive confirmation
- And no archive action is shown

#### Scenario: Duplicate display names

- Given two Provider Profiles share a display name
- When either profile is activated, exported, or edited
- Then the system identifies it by stable id
- And never merges profiles by name

#### Scenario: Platform-specific model routes

- Given Claude Code and Codex expose different model keys
- When one logical provider is configured for both Agents
- Then each Agent retains its own explicit model mapping
- And unsupported routes are reported instead of silently discarded

### `FR-AGENT-004`: Import And Backfill Live Configuration

For supported Agents, the system MUST read the current native configuration, normalize known fields, preserve unknown fields, and let the user explicitly import it as a Provider Profile. External changes MUST be detected before switching or reapplying.

#### Scenario: Native config changed outside PromptHub

- Given PromptHub previously activated a Provider Profile
- And the user or Agent changed the native config afterwards
- When the user previews another switch
- Then the system shows the external change
- And offers backfill, preserve, overwrite with confirmation, or cancel

### `FR-AGENT-005`: Safe Provider Activation

Provider activation MUST provide a redacted preview, preserve unrelated configuration, create a backup, write atomically, re-read the target for verification, and restore the previous state after failure. The active state MUST be derived from verified native configuration rather than an independent UI flag.

#### Scenario: Verification fails after write

- Given a valid backup exists
- When the adapter writes the new provider but post-write verification fails
- Then the prior configuration is restored
- And the profile is not reported as active
- And the diagnostic contains no secret value

### `FR-AGENT-006`: Secret Isolation

API keys, tokens, OAuth artifacts, authentication files, and sensitive environment values MUST be represented by secure secret references where PromptHub owns them. They MUST NOT be stored in ordinary Provider Profile JSON, versions, logs, renderer payloads, or default backups.

#### Scenario: Export a Provider Profile

- Given a profile uses an API key
- When the user exports the profile
- Then the export contains a missing-secret requirement or secret reference metadata
- And contains no literal credential

### `FR-AGENT-007`: Universal Provider Projection

The system SHOULD support a logical Provider Profile being projected to multiple compatible Agents through explicit platform mappings. Projection MUST be per-Agent, previewable, and independently reversible.

#### Scenario: One platform is incompatible

- Given a universal provider targets Claude Code, Codex, and Gemini CLI
- And one required protocol is unsupported by Gemini CLI
- When projection is previewed
- Then Claude Code and Codex can proceed independently
- And Gemini CLI is marked unsupported without a false success

### `FR-AGENT-008`: Agent-Centered Asset Aggregation

Each Agent MUST aggregate Skill, MCP, Rules, and Plugin states from their canonical domains. The Agent domain MUST NOT duplicate canonical asset content or create a conflicting assignment source of truth.

#### Scenario: Skill changes in its owning module

- Given a Skill is installed to Claude Code
- When the Skill is updated or removed through the Skill domain
- Then the Claude Code Agent view reflects the new state after refresh
- And no Agent-owned copy remains stale

#### Scenario: Manage from Agent view

- Given an asset is available but not installed to an Agent
- When the user installs it from the Agent view
- Then the owning asset service performs the operation
- And both the Agent view and owning module report the same result

### `FR-AGENT-009`: Native Config File Management

For each Agent with a resolved user configuration root, the workspace MUST
discover and expose the editable user-level text configuration surface in the
shared Config Files tab. Discovery MUST include existing safe text files below
the root plus declared configuration files that have not been created yet; it
MUST NOT be restricted to one hard-coded primary file. The user MUST be able to
open the Agent root in the system file manager and directly edit discovered
configuration files through the existing in-app file editor.

Authentication artifacts, secret-only files, session data, logs, caches,
databases, generated media, installed Skills/Plugins, backups, and other
runtime state MUST be excluded. Secret values embedded in an otherwise
editable configuration file MUST be redacted before the file crosses IPC and
MUST be preserved, not edited, by the raw editor. Every save MUST check the
revision read by the editor, validate supported structured formats, create an
encrypted device-local backup of the previous bytes, replace the file
atomically, re-read it, and restore the previous bytes after a post-write
failure.

#### Scenario: Agent uses a known config format

- Given Codex CLI resolves to `~/.codex`
- And its verified config path is `config.toml`
- When the user opens Config Files
- Then `config.toml` is available in the shared file editor
- And saving writes only that allowlisted file beneath the resolved Agent root

#### Scenario: Agent has multiple user configuration files

- Given Claude Code resolves to `~/.claude`
- And the root contains `settings.json`, `CLAUDE.md`, and user definition files
- When the user opens Config Files
- Then every safe user-level text configuration file is shown in one tree
- And transcript, credential, cache, log, backup, Skill, and Plugin paths are absent

#### Scenario: Editable configuration contains a secret

- Given a user settings file contains an authentication token
- When PromptHub reads the file for the renderer
- Then the token is replaced with an opaque placeholder before IPC
- And saving unrelated changes preserves the original token without returning it to the renderer

#### Scenario: Configuration changes outside PromptHub

- Given the editor loaded a configuration revision
- And the Agent modifies that file before the user saves
- When PromptHub receives the stale save
- Then the save is rejected as an external modification
- And neither version is silently overwritten

#### Scenario: Open the native Agent directory

- Given an Agent has a resolved root directory
- When the user chooses Open Agent folder
- Then the operating system file manager opens that root
- And PromptHub does not create a duplicate managed directory

#### Scenario: Open the native Agent application

- Given a desktop Agent declares an allowlisted application path for the current operating system
- When the user chooses Open Agent from its detail header or the Antigravity quota guidance
- Then PromptHub opens or focuses the installed application through the main process
- And the renderer cannot provide an arbitrary executable or filesystem path

#### Scenario: User configuration root is empty

- Given a preset Agent has a resolved user configuration root
- And no safe text configuration file exists yet
- When its detail shell is opened
- Then Config Files remains available with any declared missing files
- And PromptHub does not expose or create arbitrary runtime files

#### Scenario: Symlink escapes Agent root

- Given an allowlisted config path resolves through a symlink outside approved roots
- When the user attempts to read or write it
- Then the operation is rejected or requires a separately validated user-selected target
- And no external file is modified

### `FR-AGENT-010`: Session Browser And Resume

For platforms with verified session formats, the system MUST support
application-configurable metadata indexing, search, read-only transcript
viewing, project association, and a platform-specific resume command. The
application preference is enabled by default under `FR-AGENT-112`; source
sessions remain platform-owned.

#### Scenario: Source transcript disappears

- Given an indexed session points to an external transcript
- When the source file is removed
- Then the index is marked source-missing
- And PromptHub-owned tags and notes remain
- And no transcript content is fabricated

#### Scenario: Browse current Kimi Code sessions

- Given Kimi Code maintains `session_index.jsonl` and per-session `state.json` and `agents/main/wire.jsonl`
- When the user opens Kimi Sessions
- Then PromptHub reads the bounded index instead of recursively scanning the data root
- And loads state and transcript content only for bounded candidate pages or the selected session
- And excludes default `New Session` shells that have no `lastPrompt`
- And retains the contained `agents/main/wire.jsonl` as the exact transcript source while reporting the full session-directory footprint removed by permanent delete
- And provides `kimi --session <id>` as the resume action
- And never edits session files or exposes credential files

#### Scenario: Open a Qwen session from a deep metadata page

- Given `qwen sessions list --json` returns more than 200 bounded metadata rows
- When the user opens a Qwen session that was returned after the first 200 rows
- Then PromptHub reads that selected session without rescanning every transcript
- And retains only a bounded in-memory metadata window
- And revalidates the selected transcript path beneath `QWEN_RUNTIME_DIR` before reading
- And never persists or copies the transcript body

### `FR-AGENT-011`: Provider Health And Model Test

The system MUST support a redacted provider connectivity test and, where the protocol permits, a real streaming model test that records selected model, result, latency, time to first token, retry count, and structured error category.

#### Scenario: Invalid key

- Given a Provider Profile references an invalid credential
- When a model test is run
- Then the result distinguishes authentication failure from network or model-not-found errors
- And the credential is never included in logs or renderer error details

#### Scenario: Activate a paid Gemini API profile

- Given a Gemini Provider Profile owns a `GEMINI_API_KEY` through PromptHub secure storage
- When the user previews and confirms activation
- Then PromptHub updates only the user-level `model.name`, `security.auth.selectedType`, and managed entries in `~/.gemini/.env`
- And preserves unrelated JSON settings, comments, environment entries, and Gemini-owned OAuth or ADC credentials
- And verifies both files before reporting success
- And restores both files if either write or verification step fails

#### Scenario: Preserve enterprise native authentication

- Given Gemini CLI uses Vertex AI, Google OAuth, compute ADC, Cloud Shell, or a Gemini-owned gateway credential
- When PromptHub imports or activates a platform-native Profile
- Then PromptHub records only the non-secret authentication type and model
- And does not read, copy, overwrite, export, or test the external credential
- And directs ordinary consumer users to Antigravity instead of presenting Gemini as the current consumer CLI

#### Scenario: Activate a Kimi Code direct provider

- Given a Kimi Code Provider Profile declares an official provider type, provider id, model alias, upstream model id, context limit, endpoint, and PromptHub-owned API key
- When the user previews and confirms activation
- Then PromptHub updates only the corresponding `providers`, `models`, and `default_model` entries in the resolved `config.toml`
- And preserves unrelated top-level settings, provider/model fields, services, hooks, permissions, and other provider/model entries
- And creates an encrypted backup before the plaintext native credential projection
- And validates, re-reads, and semantically verifies the complete projection before reporting success
- And restores the exact prior file when writing, native validation, or verification fails

#### Scenario: Preserve Kimi Code managed authentication

- Given the selected Kimi provider is owned by `/login`, contains an `oauth` reference, uses Vertex ADC, or contains custom credential headers
- When PromptHub imports or activates the platform-native Profile
- Then PromptHub exposes only redacted provider/model identity
- And never reads, copies, exports, overwrites, or network-tests the platform-owned credential
- And activation may select only an already valid native model entry rather than inventing authentication or provider metadata

#### Scenario: Activate a Qwen Code direct provider model

- Given a Qwen Code Provider Profile declares a provider id, an official protocol, model id, environment key, endpoint, and PromptHub-owned API key
- When the user previews and confirms activation
- Then PromptHub writes the current bare-array `modelProviders[providerId]` shape in user `settings.json`
- And a custom provider id is mapped through `providerProtocol`
- And `security.auth.selectedType` and `model.name` select the same provider model
- And the credential is projected only to the user `.env` file under the declared environment key
- And unrelated settings, provider entries, model entries, environment variables, and unknown fields remain intact
- And apply uses encrypted backup, digest validation, atomic writes, semantic reread verification, and exact rollback
- And connection and explicit model tests reuse the existing main-only protocol probes

#### Scenario: Preserve Qwen Code platform-owned authentication

- Given the selected Qwen provider uses Vertex ADC, legacy Qwen OAuth, Alibaba automatic Coding Plan ownership, or a provider model whose credential source is not owned by the Profile
- When PromptHub imports or previews that native state
- Then only provider, protocol, model, endpoint, environment-key name, and credential-status metadata may cross IPC
- And inline environment values, `.env` values, custom headers, deprecated auth credentials, OAuth state, and ADC material remain hidden
- And PromptHub may select only an already-valid platform-native entry
- And PromptHub does not test or overwrite the platform-owned credential

#### Scenario: Activate an OpenCode custom direct provider

- Given an OpenCode Provider Profile declares a unique provider id, one of the documented OpenAI-compatible runtime packages, an endpoint, primary and optional small model ids, and a PromptHub-owned API key
- When the user previews and confirms activation
- Then PromptHub updates only the selected user `opencode.jsonc`, `opencode.json`, or legacy-precedence `config.json` provider catalog plus `model` and `small_model`
- And stores the API credential only in the native data-root `auth.json` API entry for the same provider id
- And does not write plaintext API keys or authorization headers into the config file
- And preserves unrelated JSONC comments, providers, models, settings, auth entries, and OAuth or well-known credentials
- And applies one digest, encrypted backup, atomic write, semantic reread, and exact two-file rollback boundary

#### Scenario: Preserve OpenCode native authentication

- Given an existing OpenCode provider uses API, OAuth, well-known, environment, file substitution, cloud identity, or an unsupported runtime package not owned by the Profile
- When PromptHub imports or previews the current native state
- Then only the provider/model/endpoint/package and redacted credential-status metadata may cross IPC
- And PromptHub does not read, copy, export, overwrite, or network-test the native credential
- And native activation may select only an already-valid current provider/model state
- And the experimental v2 plural `providers` contract is not written while the stable schema and installed release still use singular `provider`

### `FR-AGENT-012`: Tray Quick Switching

The system SHOULD expose supported Agents, current verified provider state, and a quick provider switch action in the system tray. Tray actions MUST call the same activation service as the Agent workspace.

#### Scenario: Switch from tray

- Given Claude Code has two valid Provider Profiles
- When the user activates one from the tray
- Then the same preview/backup/verify policy is applied
- And the workspace reflects the verified result without a second state store

### `FR-AGENT-013`: Backup, Restore, And Reconciliation

Full backup and Agent-selective export MUST include Provider Profiles, model mappings, non-secret configuration, snapshots metadata, and user preferences. Restore MUST detect the current device, reconcile platform paths and secure secret availability, and preserve unresolved items for repair.

#### Scenario: Restore an old backup

- Given a backup predates Agent management support
- When it is restored by a supporting version
- Then existing data restores normally
- And the Agent provider collection is empty without an import error

### `FR-AGENT-014`: CLI Lifecycle Management

For evidence-backed Agents, the main process MAY retain bounded CLI executable, version, installation-source and lifecycle services as internal infrastructure. The general Agent workspace MUST NOT expose a generic CLI diagnostics menu, standalone diagnostics modal, or renderer-callable diagnostic/update contract. Any future platform-specific install or update experience requires its own verified requirement, explicit confirmation and rollback contract before it can become user-facing.

#### Scenario: Keep the internal probe out of the Agent workspace

- Given an Agent has a verified CLI descriptor
- When the user opens the Agent overflow menu
- Then no generic CLI diagnostics command or modal is shown
- And the renderer preload does not expose diagnostic, update-plan or update-apply methods
- And the bounded main-process probe remains available for explicitly designed internal or future platform-specific workflows

#### Scenario: Custom executable path

- Given an Agent CLI is installed outside the app process PATH
- When diagnostics run
- Then adapter-specific path resolution can still locate it
- And the UI reports the resolved source rather than only a boolean

#### Scenario: Preserve the dormant OpenCode update safety contract

- Given the installed OpenCode CLI is healthy and its current executable and semantic version are known
- When a future verified platform-specific update flow invokes the internal lifecycle service
- Then PromptHub shows a short-lived review plan containing the fixed official command and detected install source
- And no command runs until the same renderer explicitly confirms that plan
- And apply rechecks the executable and version before running the command without a shell
- And PromptHub verifies the resulting executable after the command
- And a failed verification attempts the official exact-version rollback and verifies the restored executable
- And replayed, expired, foreign-renderer, mutated or stale plans fail without running an update
- And command output, environment values, credentials and raw errors never cross IPC

#### Scenario: Preserve the dormant npm-managed Codex update safety contract

- Given the active Codex executable resolves to an npm or Node version-manager installation
- And the matching `npm` executable is available through the main-process command resolver
- When a future verified platform-specific update flow invokes the internal lifecycle service
- Then PromptHub runs only the canonical `npm install -g @openai/codex@latest` argument array without a shell
- And it rechecks the active Codex executable and version before mutation
- And it verifies that the same active executable reports a new or unchanged semantic version
- And a partial failure uses the captured prior version with `npm install -g @openai/codex@<version>` and verifies restoration
- And Homebrew, standalone, system, unknown or ambiguous installations remain non-updatable because no exact rollback contract is claimed

#### Scenario: Preserve the dormant npm-managed Qwen Code update safety contract

- Given the active Qwen Code executable resolves to an npm or Node version-manager installation
- And the matching `npm` executable is available through the main-process command resolver
- When a future verified platform-specific update flow invokes the internal lifecycle service
- Then PromptHub runs only `npm install -g @qwen-code/qwen-code@latest` without a shell
- And it verifies the same active executable after the command
- And any changed or unhealthy post-state triggers exact-version npm recovery
- And standalone, Homebrew, source, system and ambiguous installations remain diagnostic-only

### `FR-AGENT-120`: Internal CLI Maintenance Boundary

The generic Agent workspace MUST treat CLI probing and lifecycle machinery as
internal infrastructure, not as a standalone user feature. It MUST retain
Refresh and Edit Agent in the overflow menu while omitting CLI Diagnostics, and
it MUST NOT expose generic diagnostic or update operations through renderer
preload or IPC. Retained main-process services MUST preserve their existing
bounded command, timeout, output and rollback controls.

#### Scenario: Open Agent actions for a CLI-backed platform

- Given a detected Agent has a verified CLI descriptor
- When the user opens its overflow menu
- Then Refresh and Edit Agent remain available
- And CLI Diagnostics is absent
- And no hidden renderer-callable diagnostic or update channel remains

### `FR-AGENT-015`: Usage And Quota Visibility

The system SHOULD support local usage summaries from verified session or request logs and provider quota/balance queries through explicit adapters. Estimates, provider-reported values, and proxy-observed values MUST be labeled separately.

#### Scenario: Partial usage evidence

- Given token counts are available but pricing is unknown
- When usage is displayed
- Then request and token totals are shown
- And cost is marked unavailable rather than guessed

### `FR-AGENT-016`: Safe Deep-Link Import

The system MAY support a versioned `prompthub://` import protocol for Provider
Profiles and existing asset domains. Each supported object type MUST have its
own bounded portable contract. A valid non-secret import MUST show a decoded
preview and require explicit confirmation before persistence or native config
changes. Unsupported object types and sensitive launch arguments MUST fail
closed before reaching the renderer.

#### Scenario: Link contains a literal API key

- Given a deep link contains sensitive provider data
- When PromptHub opens it
- Then the import is rejected with a stable public error
- And the sensitive value is not forwarded, previewed, logged, or persisted
- And no Agent Profile or native config is changed

### `FR-AGENT-017`: Proxy And Failover Are Separate Capabilities

Local proxy routing, protocol conversion, failover queues, request logs, and cost accounting MUST be implemented as a separately gated capability rather than a hidden dependency of basic Provider Profile switching.

#### Scenario: Proxy capability is disabled

- Given the product has no proxy module enabled
- When a user activates a direct Provider Profile
- Then native provider switching still works
- And no local listener or traffic interception is started

### `FR-AGENT-018`: Extensible Platform Adapters

The Agent domain MUST expose typed contracts for installation detection, provider config, sessions, CLI lifecycle, quota, and optional proxy integration. A platform without one adapter type MUST still use its supported capabilities.

#### Scenario: Add an OpenCode session adapter

- Given OpenCode already has platform identity and asset distribution support
- When a session adapter is registered
- Then the Agent detail enables Sessions for OpenCode
- And provider, asset, and path behavior does not require modification

### `FR-AGENT-019`: Future Agent Profiles Do Not Replace Platforms

Future Agent Profile or Persona support MAY compose instructions and assets across Agents, but MUST reference existing managed Agents and canonical assets. It MUST NOT replace platform identity or duplicate Agent installation state.

#### Scenario: Add a research persona later

- Given a future persona targets Claude Code and Codex
- When it is deployed
- Then both targets remain the existing managed Agents
- And installation, provider, session, and asset states remain owned by their existing domains

### `FR-AGENT-020`: Extensible Agent Appearance Management

The shared Agent detail shell MUST expose Appearance as a stable top-level
capability. Appearance support is adapter-defined and MUST NOT create
platform-specific page layouts. Codex appearance management MUST cover native
appearance settings, reversible desktop skins, and locally installed Pets as
independent sub-capabilities within the same page.

Desktop skin packages MUST use the Codex Dream Skin schema: declaration-only
`theme.json` metadata plus one contained local image. Packages MUST be validated
before persistence and applied without modifying the Codex application bundle,
`app.asar`, or code signature. Runtime injection MUST use the pinned audited
Dream Skin runtime, a loopback-only CDP endpoint, verified Codex process
ownership, compatible renderer landmarks, and a verified remove/restore path.
Unsupported Agents keep the Appearance tab visible and disabled.

Codex Pets remain filesystem-owned under the resolved Codex home. PromptHub MAY
list, preview, import, export, delete, and open valid Pet packages, but MUST NOT
duplicate Pet content into SQLite or sync Pet files by default.

Pet previews MUST render one cropped animation cell at a time from the declared
Codex spritesheet. The Appearance page MUST play the standard idle frame loop
instead of scaling the complete atlas into the card. A missing
`spriteVersionNumber` is treated as the Codex v1 8x9 contract; version `2` uses
the 8x11 contract. Reduced-motion mode MUST keep the first idle frame static.

#### Scenario: Apply a compatible Codex desktop skin

- Given a validated theme package declares a Codex target
- And the installed Codex renderer passes the adapter compatibility probe
- When the user applies the theme
- Then PromptHub stages the selected image and `theme.json` atomically
- And starts or connects through a loopback-only CDP endpoint
- And verifies the injected theme before recording a successful apply
- And does not claim the skin remains active after Codex later restarts outside PromptHub
- And the Codex application bundle and signature remain unchanged

#### Scenario: Theme fails compatibility verification

- Given a theme or the installed Codex version does not satisfy required landmarks
- When the user attempts to apply it
- Then the operation fails with a bounded diagnostic
- And managed host settings are restored
- And no active-theme state is reported

#### Scenario: Restore the native Codex appearance

- Given a managed Dream Skin watcher or CDP session is active
- When the user restores the native appearance
- Then PromptHub stops only the identity-verified managed injector
- And removes and verifies the injected CSS and decorative DOM
- And closes the managed debugging session by restarting Codex normally when required
- And preserves the Codex application bundle and unrelated configuration

#### Scenario: Manage local Codex Pets

- Given valid Pet directories exist under the resolved Codex Pet root
- When the Appearance page is opened
- Then each valid Pet is shown with its metadata and a cropped idle animation preview
- And the complete spritesheet atlas is never exposed as the card artwork
- And reduced-motion mode shows one stable idle frame
- And malformed, oversized, escaping, or symlinked packages are rejected
- And deleting a Pet requires confirmation and affects only the selected Pet directory

### `FR-AGENT-021`: Google Coding Surface Lifecycle

Gemini and Antigravity identities and their existing data MUST remain explicit;
Gemini MUST NOT act as an Antigravity fallback. Antigravity desktop and CLI
capabilities MUST be attributed to the product that actually consumes their files.
The current desktop global Skill path is `~/.gemini/config/skills`; the current
CLI global path is `~/.gemini/antigravity-cli/skills`, per the
[official Skills contract](https://antigravity.google/docs/skills) checked on
2026-09-28. The former shared-Skill-root requirement is superseded.

#### Scenario: Manage Antigravity Skills and deeper capabilities

- Given a selected Antigravity product with a declared current capability
- When PromptHub resolves its Skill, provider, session or usage operation
- Then the owning adapter uses that product's declared target and source
- And it does not silently substitute a CLI result for desktop behavior
- And unverified capabilities retain an explicit partial/planned status
- And existing Gemini data is not renamed, deleted or used as a fallback

The desktop/CLI identity split is proposed in the current-contract design and
requires its first implementation batch to map existing records before switching.

### `FR-AGENT-022`: Overview As Navigation Hub

The Agent Overview tab MUST aggregate live per-domain summaries from the owning domains (Skills, MCP, Rules, Plugins, Sessions, Provider & Model, Appearance, Usage) and each summary MUST navigate to its corresponding workspace tab. The overview MUST NOT create a second copy of owning-domain state, and cells whose capability is planned or unsupported MUST render a disabled state without invoking IPC.

#### Scenario: Navigate from a live summary

- Given Claude Code has 12 detected Skills
- When the user selects the Skills summary cell on the Overview tab
- Then the Skills tab opens
- And the displayed count matches the Skills domain inventory

#### Scenario: Planned capability stays inert

- Given the Usage capability is planned for an Agent
- When the Overview tab renders
- Then the Usage cell shows the planned state
- And no usage IPC call is made

### `FR-AGENT-023`: Claude Code Subscription Quota Adapter

For Claude Code, the system MUST read the platform's own OAuth credential from its native store (macOS Keychain `Claude Code-credentials`, including the hashed-suffix variant, or `<root>/.credentials.json`), query the Anthropic OAuth usage endpoint, and display provider-reported five-hour and seven-day utilization with reset times, labeled as provider-reported. The credential MUST remain inside the main process: never persisted by PromptHub, never sent over IPC, never written to logs or error payloads. Missing, denied, or expired credentials MUST produce explicit guided states; PromptHub MUST NOT attempt token refresh in this phase.

#### Scenario: Quota display

- Given Claude Code holds a valid OAuth credential
- When the Usage tab or overview usage cell loads
- Then five-hour and seven-day utilization and reset times are shown
- And the values are labeled as provider-reported

#### Scenario: Missing credential

- Given no Keychain item and no credentials file exist
- When usage is requested
- Then a guided no-credentials state is returned
- And no network call is attempted

#### Scenario: Expired credential

- Given the credential is expired or the endpoint answers 401
- When usage is requested
- Then an expired state with a re-authentication hint is returned
- And no retry loop or token refresh is attempted

#### Scenario: Secret isolation

- Given any failure in the quota pipeline
- When errors, IPC payloads, or logs are produced
- Then none of them contain the access token or authorization header

### `FR-AGENT-024`: Codex Third-Party Provider Management

For Codex, the unified Provider Profile database MUST be PromptHub's management
source of truth while `config.toml` remains the Codex runtime projection.
PromptHub MUST support listing, adding, updating, importing and removing
third-party Provider Profiles, then projecting `model_providers.*`,
`profiles.*`, endpoint, protocol, model and credential state through the
verified write pipeline (backup, concurrency digest, atomic write, re-read
verification, rollback), without modifying `auth.json`, the built-in `openai`
provider, or unrelated config keys. Reserved provider ids (`openai`, `ollama`,
`lmstudio`) MUST be rejected. Removing the Provider referenced by the active
`model_provider` MUST be refused unless the default is switched first.
Switching the default `model_provider` MUST use the same verified pipeline and
MUST be reversible to `openai`.

#### Scenario: Add a third-party provider without touching the subscription

- Given Codex uses the built-in `openai` provider with a ChatGPT subscription
- When the user adds provider `deepseek` with a base URL, wire API, and API key
- Then `config.toml` gains `model_providers.deepseek` and an optional `profiles.deepseek`
- And `auth.json`, `model_provider`, and all unrelated keys are unchanged

#### Scenario: Managed key custody

- Given a provider is saved with an API key
- When the write completes
- Then the key is stored in the PromptHub secret store (safeStorage-encrypted, 0600, main-process only) and projected into `experimental_bearer_token`
- And no IPC response, log, error, backup manifest, or sync payload contains the key value

#### Scenario: Explicit credential editing

- Given a saved Provider Profile reports only available, missing, or none
- When the user edits its credential
- Then the user explicitly chooses to keep, replace, or remove it
- And replace requires a newly typed value while keep and remove never request
  the stored value
- And visibility can reveal only the unsaved value typed in the current form
- And the renderer never receives the existing credential or its secret
  reference

#### Scenario: Explicitly migrate legacy PromptHub Providers

- Given existing Codex Providers use legacy
  `codex-provider:<providerId>` custody, an environment variable, or a native
  inline token
- When PromptHub discovers them
- Then it shows a redacted migration review and makes no change before the user
  confirms selected Provider ids
- And confirmation creates unified Profile records and
  `agent-provider:<profileId>` credential ownership without rewriting the
  native file
- And legacy secret ownership is removed only after every selected Provider
  has been copied and verified

#### Scenario: Decline or fail legacy migration

- Given a legacy migration review is open
- When the user declines, the preview becomes stale, or any Profile/secret
  operation fails
- Then native config, legacy Profiles and legacy credentials remain usable
- And partial unified Profiles and new secret refs are removed
- And renderer payloads and diagnostics contain no credential value or secret
  reference

#### Scenario: Refuse to remove the active provider

- Given `model_provider` points at `deepseek`
- When the user removes provider `deepseek`
- Then the removal is rejected with guidance to switch the default first
- And `config.toml` is unchanged

#### Scenario: Connectivity test

- Given a saved provider
- When the user runs a test
- Then the main process resolves the credential, validates the URL against SSRF rules, and reports a redacted result (latency, model count, or categorized error)
- And the credential never reaches the renderer

### `FR-AGENT-025`: Desktop-Native Workspace Layout

Every Agent workspace tab MUST render edge-to-edge within the workspace pane: no outer page margin, no centered max-width canvas, and no floating rounded card as the primary surface. Each tab MUST fix a compact toolbar row (title, counts, primary actions) at the top and scroll only inside its content region. List-plus-detail surfaces MUST use a two-pane master-detail layout. Skills, MCP, Rules, and Plugins MUST remain direct top-level tabs without a generic Assets parent, segmented control, or secondary navigation. The Maintenance tab MUST be retired into the workspace header overflow menu. Overview navigation cells MUST navigate directly to the owning domain tab.

The Overview path-details section MUST be expanded by default so resolved paths
and their open-folder actions are visible without an extra disclosure step.

#### Scenario: Edge-to-edge tab content

- Given any Agent workspace tab is active
- When the workspace renders
- Then the tab content touches the workspace pane dividers with no outer page margin
- And only the content region scrolls while the toolbar stays fixed

#### Scenario: Direct asset-domain navigation

- Given the user opens Skills, MCP, Rules, or Plugins
- Then the selected top-level tab shows that domain's inventory, path, search or domain-specific actions without a secondary menu
- And unavailable domains remain disabled from the same capability/path source
- And selecting Skills on the Overview navigates directly to the Skills tab

### `FR-AGENT-026`: Codex Subscription Quota And Provider-Aware Overview

For Codex, the system MUST read the platform OAuth credential from `~/.codex/auth.json` and query the ChatGPT backend usage endpoint, displaying provider-reported session (≤24h) and weekly window utilization with reset times and plan type. Windows MUST be classified by `limit_window_seconds`, not slot position. Quota MUST only be queried while the built-in `openai` provider is active; when a third-party provider is active, usage surfaces MUST report the custom-provider state instead, and the Overview Provider & Model cell MUST show the custom provider's sanitized base URL and model. The Overview capability grid MUST be removed and each collapsed path row MUST offer an open-folder action. The credential MUST remain inside the main process under the same isolation rules as `FR-AGENT-023`.

#### Scenario: Official subscription quota

- Given Codex uses the built-in `openai` provider with a Plus subscription
- When the Usage tab loads
- Then session and weekly utilization, reset times, and plan type are shown
- And windows are labeled by their actual durations, not by slot position

#### Scenario: Custom provider active

- Given `model_provider` points at a third-party provider
- When the Overview and Usage tab render
- Then the Provider & Model cell shows the provider's sanitized base URL and model
- And usage surfaces show a custom-provider state without calling the quota endpoint

#### Scenario: Expired credential

- Given `auth.json` is missing or the endpoint answers 401/403
- When usage is requested
- Then a guided no-credentials or expired state is returned without a retry loop

### `FR-AGENT-035`: Codex Product Identity Preference

The built-in `codex` platform MUST use `Codex` as its default user-facing name
without a `CLI` suffix. PromptHub MUST let the user independently choose the
Codex or ChatGPT product name and the Codex or ChatGPT icon from settings while
preserving the stable platform id, paths, capabilities, provider configuration,
sessions, assets, and native integration behavior. The preference is
presentation-only, MUST be validated against the supported choices, and MUST be
included in normal settings persistence, backup, and restore.
The ChatGPT icon choice MUST use the bundled ChatGPT application identity asset
that matches PromptHub's active light or dark theme, rather than a generic
OpenAI provider mark.

#### Scenario: Default identity

- Given no Codex identity preference has been saved
- When the Agent list and detail workspace render
- Then the product name is `Codex`
- And no user-facing Agent label contains `Codex CLI`

#### Scenario: Choose name and icon independently

- Given the user opens Agent settings and edits the built-in Codex configuration
- When they choose the ChatGPT name, retain the Codex icon, and save the Agent configuration
- Then every Agent-workbench Codex identity surface shows `ChatGPT` with the Codex icon
- And the underlying platform id remains `codex`
- And changing the icon later does not rewrite the chosen name

#### Scenario: Identity controls belong to the Codex configuration

- Given the built-in Agent configuration list is not editing Codex
- Then no standalone Codex identity settings section is shown
- When the user edits Codex
- Then the name and icon controls appear with the Codex root and asset-path fields
- And Cancel discards the identity draft
- And Reset restores the Codex name and icon without persisting until Save

#### Scenario: Invalid persisted preference

- Given restored or malformed settings contain an unsupported Codex name or icon value
- When settings are hydrated
- Then PromptHub falls back only the invalid field to its Codex default
- And no arbitrary asset path or remote image URL is rendered

### `FR-AGENT-027`: Polymorphic Multi-Agent Quota

The usage contract MUST describe provider quotas as an ordered list of metrics (`kind: "window" | "quota"`) instead of fixed window fields, and the Overview banner MUST render each metric by semantic shape: ring gauges for reset windows, and progress bars only for credit/balance totals that report numeric used and total amounts. Kimi, Antigravity, Gemini CLI, and Copilot MUST be supported through verified native sessions, credentials, and endpoints (Kimi: coding usages API with weekly + rolling windows; Antigravity: the current authenticated desktop language-service session, with explicit not-running/session-unavailable results and no CLI or Gemini credential fallback; Gemini: Cloud Code Assist per-model remaining fractions; Copilot: `copilot_internal/user` premium/chat snapshots). Cursor MUST remain `planned` because no public quota API exists; this is a documented exclusion, not a failure state.

#### Scenario: Kimi dual quota

- Given Kimi Code holds a valid OAuth credential
- When the Overview loads
- Then the banner shows the weekly quota and the rolling five-hour window as separate metrics
- And the membership enum is shown as its public plan name (`Moderato`, `Allegretto`, `Allegro`, or `Vivace`) rather than a raw `LEVEL_*` value

#### Scenario: Refresh an expired Kimi access token

- Given Kimi Code's current credential file contains an expired access token and a usable refresh token
- When PromptHub requests Kimi quota
- Then PromptHub uses Kimi Code's official OAuth refresh contract before querying usage
- And serializes the refresh with Kimi Code's native lock path, re-reads credentials after acquiring the lock, and atomically persists a rotated token with private file permissions
- And invalid refresh credentials remain an explicit expired state while transport or persistence failures remain unavailable
- And no access token, refresh token, provider response body, or raw error enters renderer IPC, native menus, logs, or PromptHub persistence

#### Scenario: Copilot credit quota

- Given a GitHub OAuth token with Copilot access
- When the Overview loads
- Then premium request usage renders as a progress bar with used/total amounts and the reset date

#### Scenario: Antigravity desktop session quota

- Given Antigravity is running with a signed-in desktop session
- When the Overview loads
- Then PromptHub reads the plan identity from `GetUserStatus`
- And reads the Gemini and third-party model groups' weekly and five-hour baseline pools from `RetrieveUserQuotaSummary`
- And each reset pool renders as its own remaining-quota ring
- And legacy `monthlyPromptCredits` or `availablePromptCredits` status fields are not presented as baseline total quota or AI credit balance
- And no OAuth token or CSRF token leaves the main process or appears in logs, IPC, persistence, or errors

#### Scenario: Antigravity signed in but desktop app is not running

- Given the macOS Keychain contains a renewable Antigravity desktop session
- And the Antigravity desktop process is not running
- When the Overview loads
- Then PromptHub starts only the allowlisted native language-service helper from the installed Antigravity application
- And reads the current quota without opening or keeping the desktop window running
- And stops the temporary helper after success, timeout, malformed output, or request failure
- And no OAuth token or temporary CSRF token leaves the main process or appears in logs, IPC, persistence, or errors
- And only when the installed helper is unavailable or cannot start may the UI offer opening Antigravity as a recovery action

#### Scenario: Polymorphic rendering

- Given an adapter returns both window and quota metrics
- When the banner renders
- Then finite 5-hour, daily and weekly reset windows render as rings in semantic period order
- And monthly, billing-cycle, lifetime and provider-defined quotas render as bars

### `FR-AGENT-028`: Skill Asset Cards And Actions In The Agent Workspace

In the Agent workspace Skills tab, skills MUST render as cards with the same badge semantics as the Skills module (In My Skills / symlink install / copy install / unmanaged / built-in) and MUST offer the canonical actions without leaving the workspace: open folder, adopt an unmanaged skill into My Skills, open the managed copy, install library skills into the Agent directory (copy or symlink), and uninstall from the Agent directory with a destructive-confirmation dialog (built-in skills excluded). Selecting a card MUST open the full skill detail page carrying the agent context and its action bar. All state and operations MUST go through the Skills domain's existing stores and services; the workspace MUST NOT duplicate scan results, identity matching, or install logic.

#### Scenario: Adopt an unmanaged skill

- Given the Codex Skills tab shows an unmanaged skill card
- When the user chooses "Import to My Skills"
- Then the skill is imported through the Skills library service
- And the card re-renders with the managed badge after rescan

#### Scenario: Uninstall from the Agent directory

- Given a removable skill card
- When the user confirms uninstall
- Then the platform uninstall handler removes the entry (symlink entries remove only the link)
- And built-in skills never show the destructive action

### `FR-AGENT-029`: Qwen Code Is A First-Class Built-In Agent

PromptHub MUST model Qwen Code as built-in platform `qwen`, separate from
`qoder`, and MUST resolve its user configuration root from `QWEN_HOME` before
falling back to `~/.qwen`. Qwen Code capability support MUST be derived from its
documented user and project asset contracts instead of a generic `skills/`
guess.

#### Scenario: Discover Qwen Code with an overridden home

- Given `QWEN_HOME` resolves to a valid configured directory
- When PromptHub builds the managed-Agent inventory
- Then Qwen Code uses that directory for user settings and user assets
- And project `.qwen/` assets remain project-scoped
- And `QWEN_RUNTIME_DIR` does not replace the user configuration root

#### Scenario: Aggregate canonical Qwen assets

- Given Qwen Code user or project assets exist
- When PromptHub displays the Qwen Code Assets and Config Files surfaces
- Then Skills use complete packages below `skills/<name>/`
- And SubAgents use Markdown definitions below `agents/`
- And MCP projects only the `mcpServers` entries in the relevant `settings.json`
- And Rules distinguish global `~/.qwen/QWEN.md`, project `QWEN.md`, and local `.qwen/QWEN.local.md`
- And Extensions remain parent-owned bundles instead of duplicating their child Skills, SubAgents, MCP servers, or commands into PromptHub ownership

#### Scenario: Inspect user and project definitions without taking ownership

- Given Qwen Code user or project SubAgents and Commands exist
- When the user opens the Qwen-only Definitions surface and selects a known project
- Then PromptHub resolves the project root from the existing project registry instead of accepting a renderer path
- And it displays bounded, validated metadata for SubAgents and nested Command namespaces
- And definition bodies, absolute paths, credential-like metadata, extension-owned children, and unknown frontmatter do not cross the renderer boundary
- And opening a definition revalidates the relative path, file type, symlink, and containment immediately before the OS action

#### Scenario: Preserve Qwen settings and secret boundaries

- Given `settings.json` contains unrelated options or secret-bearing provider, `env`, or MCP fields
- When PromptHub inspects or updates a supported Qwen field
- Then the write plan preserves unrelated JSON fields
- And it creates a backup, replaces atomically, re-reads, verifies, and rolls back on failure
- And renderer payloads, logs, snapshots, exports, and sync results exclude API keys, tokens, headers, MCP environment values, OAuth client secrets, and credential files

#### Scenario: Browse sessions through the native interface

- Given a supported Qwen Code executable and runtime directory
- When the user opens Qwen Code Sessions
- Then PromptHub prefers the bounded native `qwen sessions list --json` interface over recursive filesystem scanning
- And transcript bodies, runtime sidecars, logs, todos, auto-memory, and team memory remain Qwen-owned local state
- And resume/export actions use typed native arguments and explicit user intent

### `FR-AGENT-030`: Verified Read-Only History For Common Agents

The Agent workspace MUST expose read-only local conversation history for every
common Agent whose persisted transcript contract can be verified. The first
breadth batch MUST cover Codex, Claude Code, Gemini, Kimi Code, OpenCode, Grok
Build, OpenClaw, and Qwen Code. Presentation aliases such as `ChatGPT` MUST use
the stable platform id (`codex`) and MUST NOT disable an otherwise available
adapter.

#### Scenario: Browse Codex history under a ChatGPT presentation identity

- Given the user selected the ChatGPT name or icon for platform `codex`
- And Codex has active or archived rollout JSONL files under its resolved root
- When the user opens History
- Then PromptHub lists the newest unique sessions, reads only the selected transcript, and offers `codex resume <id>`
- And developer instructions, reasoning, tool payloads, and malformed records are not rendered as conversation messages

#### Scenario: Browse another verified local format

- Given Grok Build or OpenClaw has a verified local session index and transcript
- When the user opens History
- Then PromptHub returns bounded metadata and a bounded read-only user/assistant transcript
- And paths outside the resolved Agent root, symlink escapes, lock files, caches, and unrelated runtime files are ignored

#### Scenario: An Agent format is not verified

- Given an Agent stores conversations in a proprietary, encrypted, unstable, or undocumented database
- When PromptHub builds its capability projection
- Then History remains disabled with an adapter-unavailable reason
- And PromptHub does not infer support by scanning arbitrary files or displaying raw database records

### `FR-AGENT-032`: Scalable Session Browsing And Explicit Empty State

The Agent workspace MUST page session metadata instead of loading an unbounded
history list, and MUST render long transcripts progressively from an explicitly
bounded read. An installed Agent with zero records in its verified native source
MUST be distinguished from a failed adapter or an unsupported Agent.

#### Scenario: Browse a large history

- Given an Agent has more sessions than the initial page size
- When the user opens History
- Then PromptHub loads only the first metadata page and reports the native total
- And the user can load subsequent pages without re-rendering every off-screen row

#### Scenario: Read a long transcript

- Given the selected transcript contains hundreds of visible entries or exceeds the detail byte cap
- When PromptHub renders the transcript
- Then it initially mounts only a bounded entry batch and allows progressive expansion
- And it clearly reports when the underlying transcript preview was byte-truncated

#### Scenario: Installed Agent has no native sessions

- Given OpenCode is installed but its current database contains zero sessions
- When the user opens History
- Then PromptHub shows an explicit native-source empty state rather than a parse failure
- And it does not fabricate conversations from plugin caches, usage sidecars, or unrelated files

#### Scenario: OpenCode is launched from a different working directory

- Given OpenCode has sessions belonging to projects other than PromptHub's process working directory
- When the user opens OpenCode History in PromptHub
- Then PromptHub pages metadata through OpenCode's global read-only database command
- And the list is not filtered by PromptHub's current working directory

### `FR-AGENT-031`: In-Workspace Agent Editing

The Agent workspace MUST edit the selected Agent in a modal without navigating
to the application Settings page. The modal MUST reuse the existing Agent
settings source of truth and persistence actions rather than introducing a
workspace-only copy of path or identity state.

#### Scenario: Edit a built-in Agent without leaving the workspace

- Given the user opened a built-in Agent detail page
- When the user chooses Edit Agent from the overflow menu
- Then a modal opens with the effective root, asset paths, config paths, and any platform-specific identity controls
- And Save writes through the existing built-in Agent override actions, closes the modal, and keeps the current Agent workspace visible
- And Reset restores the platform defaults in the draft without persisting until Save
- And the header keeps only Agent-level actions rather than duplicating Skills or other asset-domain management

#### Scenario: Edit a custom Agent through the same interaction

- Given the user opened an enabled custom Agent
- When the user chooses Edit Agent
- Then the same modal also exposes its name, enabled state, root, and relative asset paths
- And Save validates and persists through the existing custom Agent action
- And validation failure leaves the modal open and reports the error without partial state

### `FR-AGENT-033`: Oh My Pi Native Agent Boundary

The Agent workspace MUST expose Oh My Pi as the built-in `oh-my-pi` platform
without a `CLI` suffix. Its default user root MUST be `~/.omp/agent` and the
`PI_CODING_AGENT_DIR` environment variable MUST override that root when it is
an absolute path. PromptHub MUST derive Oh My Pi Skills, Rules, MCP, Plugin and
allowlisted config paths from that root and MUST preserve project MCP at
`.omp/mcp.json` as a separate workspace target.

When the Oh My Pi session contract is available, the workspace MUST provide a
bounded, read-only JSONL history adapter under `<root>/sessions/`. It MUST
ignore nested subagent transcripts and symlink escapes, cap metadata and
transcript reads, isolate malformed rows, and expose `omp --resume <id>` rather
than executing a command or writing platform state. Provider switching, usage,
credential management and plugin package installation MUST remain independently
planned until their native contracts have dedicated adapters and tests.

When the official version 2 `<root>/../plugins/installed_plugins.json` registry
exists, the workspace MUST project its user-scoped installed packages into the
shared Plugin inventory as read-only assets. It MUST bound registry reads,
resolve package real paths below the plugin data root, deduplicate packages,
and exclude project-scoped, missing, malformed, oversized, or escaping entries.
It MUST NOT read or write `agent.db`, credentials, or native lifecycle state.

#### Scenario: Manage Oh My Pi assets

- Given Oh My Pi is enabled in the built-in registry
- When the Agent workspace resolves its root
- Then it shows the native root, `skills/`, `RULES.md`, `mcp.json`, sibling
  `../plugins`, and the allowlisted config files
- And the user can target the global MCP file or project `.omp/mcp.json`
- And a valid user-scoped native plugin registry is shown as read-only Plugin
  inventory without installation or update controls
- And the UI does not invent provider, usage, or plugin-install support

#### Scenario: Browse Oh My Pi history safely

- Given `<root>/sessions/` contains direct project JSONL files with valid
  session headers
- When the user opens Oh My Pi History
- Then PromptHub returns bounded metadata and visible user/assistant/tool rows
  on demand, with malformed rows counted but not rendered
- And nested subagent files, symlinks, unsafe ids, and transcript writes are
  excluded
- And the selected session exposes `omp --resume <id>` metadata only

### `FR-AGENT-034`: Oh My Pi Non-Secret Model Projection

The Agent workspace MUST inspect the Oh My Pi global `config.yml` (or the
documented `config.yaml` fallback) and the optional `models.yml` under the
resolved agent root. It MUST expose only the selected `modelRoles.default`,
provider/model selectors declared in `models.yml`, sanitized provider endpoint,
and credential readiness. API keys, headers, OAuth records, and arbitrary model
metadata MUST NOT cross the main/renderer boundary.

When the user changes the Oh My Pi default model, PromptHub MUST update only
`modelRoles.default` through the existing backup, atomic-write, re-read and
rollback pipeline. It MUST preserve unrelated YAML values and comments as far
as the parser allows, refuse malformed or oversized input, and leave native
provider authentication and usage ownership to Oh My Pi.

#### Scenario: Inspect Oh My Pi model routing without exposing secrets

- Given `models.yml` declares providers and model ids and `config.yml` selects
  `modelRoles.default`
- When the Agent workspace opens Provider & Model
- Then it shows the selected provider/model, available provider/model selectors,
  and a sanitized endpoint when present
- And `apiKey`, headers, OAuth data, and unrelated provider fields are absent
  from the returned model configuration

#### Scenario: Update and verify the Oh My Pi default model

- Given a valid Oh My Pi `config.yml`
- When the user saves a new model selector
- Then only `modelRoles.default` changes, a local backup is created, the file is
  atomically replaced and re-read, and the verified model configuration is
  returned
- And a parse, concurrent-change, or verification failure restores the exact
  previous file and returns an update error

### `FR-AGENT-036`: GitHub Copilot CLI Native Boundary

PromptHub MUST resolve the current Copilot CLI root from `COPILOT_HOME` or
`~/.copilot` and MUST use only GitHub's documented user-editable paths for
Skills, MCP, personal instructions, custom agents, settings, and installed
Plugin discovery. Automatically managed `config.json`, native authentication,
session state, permission decisions, OAuth fallback stores, and Plugin metadata
MUST remain Copilot-owned.

The Provider & Model surface MAY inspect and update only the documented
top-level `model` in `settings.json` through the shared backup, atomic-write,
re-read, and rollback pipeline. Copilot BYOK Provider configuration is
environment-only; PromptHub MUST NOT claim endpoint or credential activation
without a separately approved launch/runtime environment design.

#### Scenario: Change only the Copilot CLI model preference

- Given a valid JSONC `settings.json` with unrelated user settings and comments
- When the user activates a platform-native Profile with a different model
- Then PromptHub changes only the top-level `model`, preserves the other
  settings and comments, and verifies the re-read value
- And endpoint/secret Profiles remain blocked because no durable native
  Provider projection contract exists

### `FR-AGENT-037`: Copilot Plugin Installation Must Be Native

PromptHub MAY discover valid Copilot packages under documented installed
locations, but MUST NOT treat direct filesystem projection into
`installed-plugins/` as an installation. Until PromptHub has a bounded native
`copilot plugin install` adapter with preview, confirmation, verification, and
rollback, the Copilot Plugin distribution target MUST remain visible but
disabled with an explicit reason.

#### Scenario: Reject an unregistered Copilot Plugin distribution

- Given a valid PromptHub Plugin bundle and a Copilot installation
- When the user inspects Agent Plugin targets
- Then GitHub Copilot is visible as an adapter target but disabled
- And a direct distribution request fails before resolving or writing a target
  path
- And already installed Copilot packages remain available to read-only
  discovery

### `FR-AGENT-038`: Cursor Current Asset And Native Plugin Truth Boundary

PromptHub MUST resolve Cursor from `~/.cursor` and expose only evidence-backed
user-owned asset paths: `skills/`, `agents/`, `mcp.json`, and read-only Plugin
discovery below `plugins/`. It MUST NOT invent a global rule file or generic
config path for settings-owned user rules, and MUST NOT expose private
authentication, transcript, checkpoint, snapshot, cache, log, or Electron /
VS Code database state.

PromptHub MAY discover valid Cursor packages from Marketplace cache and local
Plugin roots, but MUST NOT treat generated package output or a copied directory
as an installed or loaded Plugin. Until a native Marketplace or local-plugin
adapter provides preview, confirmation, activation verification, and rollback,
the Cursor distribution target MUST remain visible but disabled.

#### Scenario: Project verified Cursor assets without private runtime state

- Given the built-in Cursor Agent is listed
- When PromptHub projects its paths and capabilities
- Then Skills, SubAgents, MCP, and the Plugin root derive from `~/.cursor`
- And no global rule file or generic config file is claimed
- And Provider, Sessions, Usage, and Maintenance remain planned

#### Scenario: Reject an unverified Cursor Plugin distribution

- Given a valid PromptHub Plugin bundle and a Cursor installation
- When the user inspects Agent Plugin targets
- Then Cursor is visible as an adapter target but disabled
- And a direct distribution request fails before target resolution or writes
- And installed Marketplace-cache and local packages remain read-only

### `FR-AGENT-039`: Cherry Studio Current Data And Skill Boundary

PromptHub MUST project the Cherry Studio default user-data root and
`Data/Skills` path without treating its SQLite, IndexedDB, Local Storage,
memory, credential, cache, or runtime files as generic Agent assets. For the
existing database-backed Skill adapter, `Data/cherrystudio.sqlite` MUST take
precedence over compatible `Data/agent.db`, `Data/agents.db`, and root-level
legacy databases.

Cherry Studio Provider, MCP, Sessions, Usage, Config Files, Rules, and
Maintenance MUST remain planned until separately verified adapters exist. The
composite Plugin target MUST remain disabled because current Cherry Studio
Skills do not establish a general Plugin bundle contract.

#### Scenario: Prefer the current Cherry Studio v2 database

- Given `Data/cherrystudio.sqlite` and a compatible legacy database both exist
- When PromptHub installs or reconciles a Cherry Studio Skill
- Then it updates only the current v2 Skill registry
- And the legacy registry remains unchanged
- And the complete Skill package remains under `Data/Skills`

#### Scenario: Project only evidence-backed Agent capabilities

- Given the built-in Cherry Studio Agent is listed on macOS
- When PromptHub builds its paths and capabilities
- Then the default root, `Data/Skills`, and installed application launch path
  are available
- And no MCP, Rules, Plugin directory, Config, Provider, Session, Usage, or
  Maintenance support is claimed

### `FR-AGENT-040`: Windsurf Public Transcript History

PromptHub MUST read only explicit Cascade transcript exports from
`~/.windsurf/transcripts/*.jsonl`. It MUST NOT parse proprietary Cascade
protobuf/runtime state below `~/.codeium/windsurf/cascade`, memories, code
tracker data, databases, credentials, or caches.

The adapter MUST be local-only, read-only, paginated, size bounded, symlink
safe, and resilient to malformed or future JSONL step types. It MUST expose
only visible user input and planner response text; code actions, file content,
command output, tool arguments, and other tool payloads MUST remain hidden.
Because the public transcript contract provides no native resume command,
session metadata MUST use `resume: null` and the capability MUST be `partial`.

#### Scenario: Browse an opt-in Windsurf transcript

- Given Cascade Hooks wrote a valid transcript JSONL with `user_input`,
  `planner_response`, and tool/code steps
- When PromptHub lists and reads Windsurf history
- Then the trajectory id, first user prompt, update time, source path, and
  visible user/assistant messages are available
- And tool/code payloads are absent
- And no resume command is offered

#### Scenario: Reject unsafe or unbounded transcript input

- Given a symlinked transcript, path traversal id, oversized file, malformed
  JSONL line, or unknown step type
- When PromptHub scans or reads Windsurf history
- Then symlinks and traversal are rejected
- And reads remain within the file, entry, page, and scan limits
- And malformed lines are counted without exposing hidden payloads
- And no source file is modified

#### Scenario: Preserve Windsurf capability boundaries

- Given the built-in Windsurf Agent
- When PromptHub projects its current capabilities
- Then Skills, MCP, global Rules, launch, and partial transcript history use
  their documented paths
- And Provider, Usage, generic Config Files, Maintenance, and native Plugin
  installation remain unavailable until separately verified

### `FR-AGENT-041`: Kiro Current CLI Boundary

PromptHub MUST use Kiro's documented `KIRO_HOME` / `~/.kiro` root and MUST
limit model mutation to `settings/cli.json` field `chat.defaultModel`.
Credentials, account state, endpoints, and provider selection remain
platform-managed and MUST NOT enter renderer payloads, ordinary backup, or
PromptHub-owned secret storage.

Kiro's global `steering/` directory MUST NOT be exposed as a single editable
Rules file. It remains unavailable until the Rules owner supports bounded
multi-file directories with explicit selection and write semantics.

PromptHub MAY expose locally verified Kiro CLI session files as a partial,
read-only capability. It MUST expose only visible prompt and assistant text,
hide thinking/tool/result/unknown payloads, enforce bounded and symlink-safe
reads, and set `resume: null` because no documented per-session resume
contract has been verified.

PromptHub MUST NOT claim that direct filesystem copying installs a Kiro Power.
Kiro Plugin distribution remains disabled until an official import or
registration workflow can be previewed, explicitly confirmed, verified, and
rolled back.

#### Scenario: Inspect and change the Kiro default model

- Given a valid Kiro `settings/cli.json` with comments or unrelated fields
- When PromptHub inspects or changes the default model
- Then only `chat.defaultModel` is projected or changed
- And comments and unrelated fields are preserved
- And backup, atomic replacement, digest race detection, reread verification,
  and rollback protect the write
- And no credential, endpoint, account, or provider value is exposed

#### Scenario: Browse visible Kiro CLI session content

- Given matching Kiro CLI metadata and JSONL files
- When PromptHub lists and reads a session
- Then metadata and visible Prompt/Assistant text are available
- And ToolResults, thinking, tool-use, malformed, and unknown payloads are not
  exposed
- And pagination, entry/file/scan limits, safe ids, root containment, and
  symlink rejection remain enforced
- And the session has no synthetic resume command

#### Scenario: Reject fake Kiro Power installation

- Given a valid PromptHub Plugin package and the Kiro target
- When direct distribution is requested
- Then the operation fails before resolving a package or writing files
- And the UI explains that native Kiro import/registration is required
- And existing Power package structures may remain available for bounded,
  read-only inventory without being reported as PromptHub-installed

### `FR-AGENT-042`: Grok Build Provider And Model Boundary

PromptHub MUST resolve Grok Build from `GROK_HOME` or `~/.grok` and MAY manage
the documented user `config.toml` Provider and default-model projection.
Provider Profiles MUST use Grok's public `[model.<alias>]` and
`[models].default` contract and MUST preserve unrelated TOML data.

PromptHub MUST NOT copy or vendor Grok Build or CC Switch source. It MAY reuse
their documented protocol shapes and workflow concepts through an independent
PromptHub adapter.

Grok-native session/OIDC credentials and `XAI_API_KEY` remain
platform/environment owned. Custom Providers MAY reference an environment
variable through `env_key`, but PromptHub MUST NOT project a managed secret,
inline `api_key`, sensitive header, session token, or auth file into
`config.toml`. Native entries containing inline credentials or sensitive
headers MUST be redacted and read-only. Connection and model tests MAY resolve
an `env_key` only inside the main process.

#### Scenario: Activate an environment-owned custom Provider

- Given a valid Grok Provider Profile with alias, protocol, upstream model,
  endpoint, context window, and environment-key name
- When the user previews and confirms activation
- Then PromptHub updates only `[model.<alias>]` and `[models].default`
- And creates an encrypted backup before an atomic write
- And detects concurrent changes, rereads the file, verifies the intended
  projection, and restores the backup on failure
- And no credential value crosses IPC or enters ordinary backup/export

#### Scenario: Keep Grok-owned authentication read-only

- Given the active Grok model uses the native session, `XAI_API_KEY`, an
  inline `api_key`, or sensitive custom headers
- When PromptHub inspects or imports the current Provider
- Then only redacted Provider, protocol, endpoint, model, context, environment
  key name, and credential readiness metadata may cross IPC
- And PromptHub does not copy, export, overwrite, or persist the credential
- And an inline-secret or sensitive-header Provider cannot be taken over by a
  mutable PromptHub Profile

#### Scenario: Reject unsafe Grok configuration input

- Given a malformed, oversized, symlinked, out-of-root, duplicate, or
  concurrently modified Grok configuration
- When PromptHub inspects, imports, previews, applies, verifies, or rolls back
- Then the operation fails with a stable redacted error
- And no partial Provider state or plaintext backup remains

### `FR-AGENT-043`: Amp Current Public Asset And MCP Boundary

PromptHub MUST model Amp from the current public Owner's Manual rather than the
previous evidence-limited placeholder. The user root is `~/.config/amp` on
macOS/Linux and `%USERPROFILE%\.config\amp` on Windows. PromptHub MAY retain
the former Windows `%APPDATA%\amp` path as a read-only compatibility fallback.

Amp Skills, `AGENTS.md`, Plugins and MCP settings MUST continue through their
existing owning domains. Global MCP lives in `settings.json` or
`settings.jsonc` below the user root; project MCP lives in the nearest
`.amp/settings.json` or `.amp/settings.jsonc`; server entries use the literal
top-level key `amp.mcpServers`. PromptHub MUST preserve all unrelated dotted
settings and MUST NOT flatten this key into a nested `amp` object.

Amp's hosted account, models, threads, OAuth cache and workspace-managed global
Plugins remain platform-owned. PromptHub MUST NOT claim a Provider adapter,
local transcript adapter, usage adapter, native Plugin installer, or writable
raw-config surface without a separate verified contract.

#### Scenario: Synchronize global and project Amp MCP settings

- Given a user or project Amp settings file with unrelated dotted settings
- When the user previews and confirms an MCP synchronization through the MCP
  owning domain
- Then PromptHub reads and writes only the literal `amp.mcpServers` entry map
- And preserves unrelated JSON/JSONC settings
- And uses the canonical user or project settings path for the selected scope

#### Scenario: Keep unsupported Amp depth capabilities explicit

- Given Amp is enabled in Agent Management
- When PromptHub builds its capability inventory
- Then Skills, MCP and Rules reflect their documented path-level support
- And Provider is unsupported because Amp does not expose a user-managed
  provider projection
- And Sessions, Usage, Config Files, Launch, Maintenance and Plugin
  distribution remain planned until dedicated adapters satisfy their gates

### `FR-AGENT-044`: Provider Credential Replacement Compensation

PromptHub MUST treat Provider Profile metadata, model mappings and the
main-process secret store as one recoverable credential-management operation.
When replacing a legacy or current secret reference, a failure after the
database points at the new reference MUST restore the prior database record,
model mappings and secret state before reporting failure.

The operation MUST distinguish an ordinary rejected update from a failed
compensation. It MUST NOT clear the new secret while the database still points
at it, and it MUST NOT leave the database pointing at a cleared or missing
secret reference. Renderer results, logs and stable errors MUST remain
secret-free.

#### Scenario: Legacy secret cleanup fails after database update

- Given a Provider Profile references a legacy secret and both prior metadata
  and model mappings are readable
- And the replacement secret is written and the database update succeeds
- When deleting the legacy secret fails
- Then PromptHub restores the prior profile and model mappings using the
  updated optimistic timestamp
- And restores the exact prior secret state only after the database rollback
- And reports `AGENT_PROVIDER_PROFILE_UPDATE_FAILED` when compensation
  succeeds

#### Scenario: Database compensation fails

- Given the database already points at the replacement secret
- When legacy secret cleanup and database compensation both fail
- Then PromptHub preserves the replacement secret required by the current
  database record
- And reports `AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED`
- And no credential value appears in the error

### `FR-AGENT-045`: Provider Endpoint Credential Exclusion

Provider Profile endpoints are public metadata and MUST NOT contain embedded
credentials. PromptHub MUST accept only bounded HTTP(S) endpoints without URL
userinfo or fragments, and MUST reject malformed URLs, unsupported schemes,
control characters and oversized values before persistence or IPC projection.

The same validation MUST protect renderer submission, SQLite create/update and
SQLite reads. Stable errors MUST NOT echo the rejected endpoint. Existing
unsafe rows MUST fail closed when read; this change MUST NOT silently rewrite
legacy data without a separately reviewed migration and recovery plan.

#### Scenario: A user pastes a credential-bearing endpoint

- Given the Provider form contains all other required fields
- When the endpoint contains a username or password component
- Then the form shows a localized validation error
- And no Profile create/update request is sent
- And a direct storage call rejects the endpoint before SQLite changes

#### Scenario: A legacy row contains endpoint credentials

- Given a pre-existing SQLite row contains URL userinfo
- When PromptHub loads the Provider Profile
- Then the public projection fails with `AGENT_PROVIDER_ENDPOINT_INVALID`
- And the stable error does not include the credential
- And PromptHub does not silently mutate the row

### `FR-AGENT-046`: Provider Public JSON Credential Exclusion

Provider Profile config, model mappings, audit snapshots and recovered
activation baselines MUST contain only bounded public JSON metadata. The
storage boundary MUST reject sensitive key families and non-JSON values before
write, MUST validate the same records again on read, and MUST use the same
policy for baseline recovery.

Errors MUST be stable and MUST NOT contain a rejected value. Existing unsafe
rows MUST fail closed without silent mutation or automatic credential
migration. A rejected create or update MUST leave the database unchanged.

#### Scenario: An adapter tries to persist a credential in an audit snapshot

- Given an activation result contains an API token, private key or
  authorization header in `redactedSnapshot`
- When the audit repository records the result
- Then SQLite rejects the snapshot before insertion
- And no credential value appears in the error
- And the activation workflow reports an audit-write failure rather than
  treating the unsafe snapshot as verified

#### Scenario: An older database contains unsafe public JSON

- Given a Profile config, model mapping or verified snapshot contains a
  credential-bearing key
- When PromptHub projects that row or restores the baseline
- Then it fails with a stable public-config or baseline error
- And it neither returns the record nor mutates the stored value

### `FR-AGENT-047`: Session Index Cancellation And Scale Boundary

A persistent session-index refresh MUST treat cancellation as a commit
barrier. If cancellation is already requested, or arrives after the adapter
finishes scanning but before SQLite commit, PromptHub MUST write no session
rows, cursor, scan timestamp or failure state. Cancellation reasons from
renderer or platform code MUST NOT become stored or user-visible diagnostics.

The metadata index MUST accept the documented 10,000-session hard limit in one
transaction and expose it only through bounded pages of at most 200 records.
The persisted schema and ordinary backup/export flow MUST exclude transcript
bodies; details continue to be read from the external source on demand.

#### Scenario: Cancellation races with scan completion

- Given an enabled source has finished producing a valid scan result
- When its abort signal becomes cancelled before commit
- Then refresh rejects with the stable `AGENT_SESSION_SCAN_CANCELLED` error
- And the source cursor, status and indexed rows remain unchanged
- And no scan failure is recorded

#### Scenario: A source contains 10,000 sessions

- Given a verified adapter produces exactly 10,000 bounded metadata records
- When PromptHub commits and lists the index
- Then all records are committed atomically and reachable through 200-row
  pages
- And search remains literal and Unicode-safe
- And no transcript body column or ordinary backup payload is introduced

### `FR-AGENT-051`: Agent-Scoped Rule Editing

When an Agent exposes one resolved global rule-file path, its `Rules` tab MUST
open that exact file in the existing Rules workspace editor rather than a
read-only generic asset list. The Agent surface and the standalone Rules
surface MUST share the same descriptor, draft, save, conflict and version
state; the Agent tab MUST NOT introduce a second rule store or a second file
write path.

Selection MUST prefer the normalized resolved file path over platform identity
so root overrides, shared platform roots and custom Agents select the intended
file. Entering or switching the Agent MUST NOT briefly expose another Agent's
rule content. A missing cached descriptor MAY trigger one bounded rescan, after
which the UI MUST show a scoped retry or unavailable state rather than scanning
indefinitely.

Directory-based, project-scoped and multi-file rule systems remain outside this
single global-file editor unless they are separately registered in the Rules
workspace.

#### Scenario: An Agent rule is edited from the Agent workspace

- Given Claude Code resolves to one tracked `CLAUDE.md` descriptor
- When the user opens its `Rules` tab, changes the draft and saves
- Then the existing Rules workspace save operation writes that descriptor
- And the same draft, snapshot and conflict state is visible from the
  standalone Rules module
- And no Agent-specific persistence record is created

#### Scenario: The selected Agent changes while another rule is loaded

- Given the Rules store currently contains a different Agent's file
- When the user selects an Agent with another resolved global rule path
- Then the previous file content is not rendered in the new Agent tab
- And the matching descriptor is loaded by path before its editor is shown
- And at most one forced rescan is attempted if the descriptor was not cached

### `FR-AGENT-052`: Compact Rule Editing Actions

The shared Rules editor MUST keep the editable draft as its primary workspace.
AI rewriting and version history MUST open from compact header actions in
focused dialogs rather than occupying a permanent auxiliary column. The editor
MUST use the established card/background tokens instead of broad muted-gray
panels, and the same interaction MUST be available from both the standalone
Rules module and the Agent Rules tab.

#### Scenario: The user requests an AI rewrite

- Given a rule draft is open
- When the user selects `Improve with AI`
- Then a focused dialog collects the rewrite instruction
- And a successful rewrite closes the dialog and updates only the draft
- And a failed rewrite leaves the dialog open with an error
- And no source file is written until the existing save action is confirmed

#### Scenario: The user reviews version history

- Given a rule file has zero or more snapshots
- When the user selects `Version Snapshots`
- Then a dialog shows the empty state or the bounded snapshot list
- And selecting a snapshot keeps the dialog open and shows its line-level
  comparison with the current draft inside the same dialog
- And the user can switch snapshots without losing the current draft
- And restore/delete continue through the existing Rules store workflows

### `FR-AGENT-053`: Compact Agent Detail Header

The Agent detail header MUST derive its height from the visible identity,
actions and tab strip. It MUST NOT reserve a fixed empty band between the
identity row and the tabs. Header actions MAY wrap at narrow desktop widths
without overlapping the identity or making tabs inaccessible.

#### Scenario: A standard Agent detail opens

- Given the selected Agent has no lifecycle guidance below its identity
- When the detail workspace renders
- Then the identity and actions occupy only their natural content height
- And the tab strip follows immediately without a fixed-height spacer
- And all existing header actions and tabs remain available

### `FR-AGENT-054`: Edge-To-Edge Rule Editing Canvas

The shared Rules editor MUST use the available workspace below its file toolbar
without nesting the draft or snapshot diff inside a floating card with
decorative outer margins, rounded corners or a shadow. The draft status row
MUST remain visually separated from editable content.

#### Scenario: A rule draft is open

- Given a rule file has been loaded in the standalone or Agent Rules workspace
- When the editable draft is shown
- Then its status row and content fill the remaining workspace
- And no decorative inset exposes unused edges around the editor
- And editing, focus, scrolling, AI rewrite and version preview behavior remain
  unchanged

### `FR-AGENT-055`: Markdown-Aware Rule Editing

The shared Rules editor MUST provide a Markdown-aware editing surface rather
than a plain textarea. It MUST preserve the current draft as the only editable
state while adding syntax highlighting, line numbers, undo/redo, search,
bracket handling, indentation and Markdown list/quote continuation. Parent
draft refreshes MUST NOT create a second user edit or corrupt the undo history.
The same surface MUST offer Edit, Preview and Split modes without changing the
draft owner. Preview navigation MUST stay inside the application, Split mode
MUST keep source and rendered content aligned by Markdown source position, and
long previews MUST provide a reduced-motion-aware return-to-top action. The
compact mode selector MUST sit at the toolbar's far right after the line and
character counts, use familiar editor, book and split-layout
icons, and MUST NOT use an eye icon for document preview.

#### Scenario: Continue a Markdown list

- Given a rule draft contains a Markdown list item
- When the user presses Enter at the end of that item
- Then the editor continues the appropriate Markdown marker
- And the Rules store receives the resulting draft once
- And the source file remains unchanged until Save is selected

#### Scenario: Review a long rule without leaving the application

- Given a long Markdown rule is open with an unsaved draft
- When the user switches between Edit, Preview and Split
- Then the same draft is rendered without persistence or a second draft state
- And scrolling either Split pane aligns the other pane by source section
- And an internal table-of-contents link scrolls the preview instead of opening
  a browser
- And the preview offers a return-to-top action after meaningful scrolling

### `FR-AGENT-056`: Explicit AI Rewrite Model Selection

The AI rewrite dialog MUST let the user select a configured provider and one of
that provider's chat models before generating a draft. The current default chat
model SHOULD be selected initially. Image-only models MUST NOT be offered.
Legacy single-model settings MAY appear as one compatible fallback choice.
Changing this selection MUST affect only the current rewrite request and MUST
NOT mutate global model defaults.

#### Scenario: Rewrite with a non-default configured model

- Given two configured providers each expose a chat model
- When the user selects the second provider and model and starts a rewrite
- Then the existing Rules rewrite request uses exactly that model's endpoint,
  protocol and credential configuration
- And no provider or model default is changed
- And a missing credential or unavailable model keeps the dialog open with an
  actionable error

### `FR-AGENT-057`: In-Dialog Rule Version Comparison

Version history MUST use one focused dialog that combines the bounded snapshot
list and the existing line-level diff presentation. Selecting a snapshot MUST
not replace the editor canvas or add temporary actions to the file header.
Opening the dialog MUST immediately select the newest non-current snapshot
when one exists, otherwise the current snapshot, so comparison never opens as
an unexplained blank panel.
Restore MUST copy the selected snapshot into the current draft only; delete
MUST continue through the existing confirmation and Rules store workflow.
Snapshot origins MUST use neutral text with a familiar icon; only the current
snapshot may use the semantic success color.

#### Scenario: Compare and restore a snapshot

- Given a rule draft differs from a historical snapshot
- When the user selects that snapshot in Version History
- Then the dialog shows additions, removals, line numbers and snapshot metadata
- And the editor draft remains unchanged while comparison is open
- When the user selects Restore to Draft
- Then the snapshot content becomes the draft and the dialog closes
- And the real rule file is still unchanged until Save is selected

### `FR-AGENT-058`: Reveal The Active Rule File

The open-location action MUST ask the existing main-process shell boundary to
reveal the exact active rule file. It MUST NOT derive and submit a less specific
parent path in the renderer. A missing preload bridge, rejected invocation or
shell failure MUST produce a visible error rather than silently doing nothing.

#### Scenario: Reveal a tracked rule

- Given an active rule has an absolute file path
- When the user selects Open Location
- Then the renderer passes that exact file path to the existing shell boundary
- And the platform file manager reveals the file
- And any failure is reported without changing the draft or filesystem

### `FR-AGENT-059`: Cohesive Agent Asset Navigation And Cards

Skills, MCP and Plugins MUST remain adjacent top-level tabs in that order.
Rules and platform-specific Definitions MUST follow the three distributable
asset domains rather than splitting them. MCP and Plugin inventories MUST use
the same bounded responsive card-grid language as Skills instead of reverting
to a dense table or row list. Domain identity MUST use the existing semantic
icons: the server icon for MCP and the plug icon for Plugins.

The card presentation MUST continue to read owning-domain state through the
existing Agent asset aggregation boundary. It MUST NOT create another asset
store, duplicate durable records or imply inline actions that the owning domain
does not yet support.

#### Scenario: Move between distributable Agent assets

- Given an Agent exposes Skills, MCP, Plugins and Rules
- When its detail workspace is shown
- Then Skills, MCP and Plugins are adjacent tabs before Rules
- And MCP and Plugin inventories render as bounded responsive cards
- And Plugin identity uses a plug icon rather than a package or cube icon

### `FR-AGENT-060`: Agent Asset Management Workspaces

The Agent detail Skills, MCP and Plugins tabs MUST provide the same actionable
management experience as their owning top-level domains, scoped to the
selected Agent. Asset entries MUST be selectable and open a detail view or
domain-owned action surface. Quick actions MUST call the canonical Skill, MCP
or Plugin stores/services, show progress and failure states, and require
confirmation before destructive changes. The Agent workspace MUST NOT create a
second asset store, invent mutations for unsupported platforms, or silently
navigate away before an operation is complete.

The shared inventory toolbar MUST localize every counter and filter in all
supported locales. It MUST NOT display a raw Agent asset path beside the
filters; filesystem paths remain available on the relevant asset card, detail
view, or explicit open-folder action where they provide actionable context.
Each Skills, MCP and Plugins toolbar MUST expose one right-aligned, plus-icon
primary action using the same component anatomy. The labels MUST be localized
as Add Skill, Add MCP and Add Plugin, while each action continues into its
owning workflow rather than introducing a generic mutation path. Chinese and
Traditional Chinese Plugin surfaces MUST retain `Plugin` as the stable product
term instead of mixing it with a translated alias.

The search field, filter strip, refresh control and Add action MUST remain on
one toolbar row. A long localized filter strip MUST use bounded horizontal
overflow instead of wrapping the Add action onto a second row; refresh and Add
MUST remain fixed at the toolbar's right edge in every asset domain.

#### Scenario: Manage MCP from an Agent

- Given an Agent has configured MCP entries and PromptHub-managed MCP servers
- When the user opens the Agent MCP tab and selects an entry
- Then a detail view shows the target path, transport and sanitized config
- And the user can open the native config, open the managed server, import an
  external entry or remove it through owning MCP operations
- And a failed action leaves the entry and selection state unchanged

#### Scenario: Manage Plugins from an Agent

- Given an Agent has installed or distributable Plugin packages
- When the user opens the Agent Plugins tab
- Then target and library Plugin entries are selectable and show their detail
- And the user can import a target package, distribute a library package,
  open its folder or remove a distribution through owning Plugin operations
- And removing an Agent distribution or deleting a My Plugins package requires
  an explicit destructive confirmation before the canonical mutation runs
- And an externally installed target package without PromptHub distribution
  ownership offers import/open actions but no unsafe filesystem delete action
- And the view refreshes from the canonical Plugin store after a successful
  operation

#### Scenario: Scope actions to the selected Agent

- Given multiple Agent targets exist in the global MCP or Plugin stores
- When one Agent detail workspace is active
- Then only that Agent's targets and installed entries are shown in the shared
  card grid
- And an action cannot mutate another Agent target unless the user explicitly
  chooses it in the owning domain's target picker

#### Scenario: Localized compact asset toolbar

- Given the user opens Skills, MCP, or Plugins in a non-English locale
- When the shared asset toolbar renders its counts and filters
- Then every label uses the active locale instead of an English fallback
- And the toolbar does not expose the selected Agent's raw filesystem path
- And its right edge contains the domain's localized Add action with the same
  plus-icon button anatomy used by the other two asset domains
- And long localized filters scroll within their own bounded strip instead of
  moving Refresh or Add onto another row
- And Add Skill, Add MCP, and Add Plugin open Agent-scoped library pickers over
  the current workspace instead of navigating to a standalone manager
- And Add MCP remains visible when the current Agent has no verified target,
  but reports that boundary without creating or guessing a target
- And cards and detail views may still show a relevant source path for an
  explicit inspect or open-folder workflow

### `FR-AGENT-061`: Explicit Claw Family Taxonomy

The Agent Management display-order surface MUST classify the built-in
`openclaw`, `qclaw`, and `hermes` platforms under the Claw family and keep all
other platforms in their existing Code / Work family unless they are added to
the explicit Claw registry. This family is a PromptHub presentation taxonomy;
it MUST NOT alias platform ids, roots, capabilities, adapters, or native
configuration contracts.

#### Scenario: Move Hermes with the Claw platforms

- Given the Agent display-order settings show the Code / Work and Claw groups
- When the user opens the display-order list
- Then Hermes appears in the Claw group beside OpenClaw and QClaw
- And Hermes keeps its own `hermes` identity, `~/.hermes` root, and capability
  declarations
- And rule ordering uses the same family classification without changing rule
  file paths or ownership

### `FR-AGENT-062`: Independent Local Claw Platform Identities

The Agent registry MUST expose `openclaw`, `copaw`, `autoclaw`, `nanoclaw`,
and `qclaw` as independent built-in platform identities. The Claw family is a
display taxonomy only: platform ids, roots, asset paths, capability states,
icons and adapters MUST NOT be aliased without evidence. A platform whose
native local path or protocol is not publicly verified MUST remain visible with
an explicit `partial` or `planned` capability state rather than being hidden or
silently mapped to OpenClaw.

#### Scenario: Local Claw platforms are visible independently

- Given the built-in registry contains the requested local Claw platforms
- When the Agent Management or platform-order view is opened
- Then each platform appears with its own name, icon, id and resolved root
- And all five platforms are grouped under Claw for display ordering
- And unsupported Provider, Session, Usage, MCP, Rules or CLI capabilities are
  labeled individually instead of being reported as supported

#### Scenario: Project-root NanoClaw installation

- Given NanoClaw is checked out under a user-selected project directory
- When the user overrides the NanoClaw Agent root to that directory
- Then PromptHub uses the override for path previews without creating a new
  global NanoClaw directory
- And the default compatibility candidates are not treated as proof of a
  native NanoClaw global root

### `FR-AGENT-063`: Evidence-Backed Copilot History

For the built-in `copilot` Agent, PromptHub MUST expose a read-only History
surface when the local native session store is available. The adapter MUST
resolve `COPILOT_HOME` before `~/.copilot`, read only
`<root>/session-store.db`, and preserve the capability as `partial` because
the schema and lifecycle are Copilot-owned. Missing stores MUST produce an
explicit empty state rather than an invented session or a filesystem scan.
History listing MUST support bounded pagination and search over session
metadata and visible turn text; detail reads MUST expose only user/assistant
text with row, field, byte, parse-error, and unsafe-source bounds. PromptHub
MUST NOT write, index, back up, synchronize, or migrate Copilot's native
session state.

#### Scenario: Browse and search Copilot history

- Given `<root>/session-store.db` contains valid Copilot `sessions` and
  `turns` rows
- When the user opens the Copilot History tab or searches a visible turn
- Then PromptHub returns bounded session metadata and visible user/assistant
  entries, preserves the native `copilot --resume=<id>` command, and reports
  the store-backed adapter as `partial`

#### Scenario: Missing or unsafe Copilot history store

- Given the resolved store is missing, malformed, or a symlink/non-file
- When the Copilot History tab is loaded
- Then PromptHub returns an explicit empty/unavailable result without creating
  files, recursively scanning the root, or exposing native runtime tables

### `FR-AGENT-064`: Evidence-Backed Cline History

For the built-in `cline` Agent, PromptHub MUST expose a read-only History
surface for the documented local session stores. The adapter MUST resolve the
configured Cline root (including `CLINE_DATA_DIR` when it is an absolute
override), prefer the authoritative JSON snapshots under
`data/sessions/`, and support the documented task history under
`data/tasks/<taskId>/api_conversation_history.json` as a compatibility source.
The optional `data/sessions/sessions.db` file MAY be used as a read-only
metadata index, but it MUST NOT become a second transcript source or be
mutated. Listing MUST be bounded, paginated, searchable across visible
metadata and user/assistant text, and preserve `cline --id <session-id>` as
the native resume command. Detail reads MUST hide tool payloads and enforce
row, field, body, malformed-input, and unsafe-path bounds. PromptHub MUST NOT
write, index, back up, synchronize, or migrate Cline's native session state.

#### Scenario: Browse Cline hub snapshots

- Given `data/sessions/sessions.db` and matching `<session-id>.json` snapshots
  contain valid Cline metadata and messages
- When the user opens or searches Cline History
- Then PromptHub returns bounded metadata and visible user/assistant entries,
  uses the indexed order without opening every full transcript for an
  unfiltered page, and preserves `cline --id <session-id>` for resume

#### Scenario: Read legacy Cline task history

- Given a Cline task directory contains
  `api_conversation_history.json` and optional `task_metadata.json`
- When the task is listed or opened
- Then PromptHub exposes it through the same History surface with the task
  metadata and visible user/assistant messages, without exposing tool inputs,
  tool results, credentials, or provider settings

#### Scenario: Missing or unsafe Cline history source

- Given a Cline session index, snapshot, or task file is missing, malformed,
  oversized, or symlinked outside the configured root
- When Cline History is loaded
- Then PromptHub skips or reports that source explicitly, never follows an
  unsafe transcript path, and never creates or repairs Cline files

### `FR-AGENT-065`: Evidence-Backed Cursor Transcript History

For the built-in `cursor` Agent, PromptHub MUST expose a read-only History
surface from Cursor's local per-project `agent-transcripts` JSONL exports.
The adapter MUST resolve the configured Cursor root, scan only
`projects/<project>/agent-transcripts/<session-id>/<session-id>.jsonl`, and
keep the capability `partial` because Cursor owns the history index, retention,
and application lifecycle. Listing MUST be bounded, paginated, and searchable
across visible metadata and user/assistant text. Detail reads MUST hide system
and tool records, enforce byte/row/field/parse-error limits, reject symlinks and
paths outside the configured root, and preserve Cursor's
`cursor-agent --resume <chat-id>` command. PromptHub MUST NOT write, index,
back up, synchronize, or migrate Cursor's native history, settings database,
checkpoints, or snapshots.

#### Scenario: Browse and search Cursor transcripts

- Given a Cursor project contains a valid local agent transcript JSONL file
- When the user opens or searches Cursor History
- Then PromptHub returns bounded metadata and visible user/assistant entries,
  matches text that appears only in a visible turn, and exposes the native
  `cursor-agent --resume <chat-id>` metadata

#### Scenario: Missing or unsafe Cursor transcript source

- Given a Cursor transcript is missing, malformed, oversized, symlinked, or
  outside the configured root
- When Cursor History is loaded
- Then PromptHub skips or reports that source without creating the Cursor root,
  following the link, exposing hidden payloads, or mutating Cursor state

### `FR-AGENT-066`: Project-Centered Conversation History

PromptHub MUST expose one project-centered conversation catalog across all
verified Agent session adapters. The History tab under a selected Agent MUST be
a filtered view of that catalog rather than a separate inventory. A
conversation MUST have a registered project association before continuation;
unresolved sessions MUST remain visible in a `needs-project` queue and MUST NOT
be silently associated by directory basename or fuzzy path matching.

#### Scenario: Browse one project's Agent conversations

- Given one registered project has native sessions from Claude Code and Codex
- When the user opens Conversation History and selects that project
- Then both Agents' conversations appear in one bounded list
- And selecting a source Agent filters the same catalog without duplicating it

#### Scenario: Associate an unresolved conversation

- Given a native session has no exact registered-project root match
- When the user selects a project for it
- Then PromptHub stores the project association as local metadata
- And subsequent rescans retain that association without rewriting the native transcript

### `FR-AGENT-067`: Conversation Management CRUD

PromptHub MUST support create/discover, read, update and delete for the managed
conversation projection. Creation occurs through verified native
discovery or a completed cross-Agent continuation; blank synthetic histories
MUST NOT be created. Updates MAY change only PromptHub-owned title, project,
tags, note, favorite and archive metadata. Archive is the reversible
non-destructive state. Conversation metadata MUST NOT expose soft-delete or
restore state. The visible delete action follows `FR-AGENT-100`: it is an
adapter-owned permanent native delete, followed by hard deletion of the
PromptHub metadata row, and MUST NOT use a generic file delete. Conversation
History MUST NOT expose a generic metadata-edit dialog or present PromptHub
annotations as native Agent rename controls.

#### Scenario: Keep metadata editing out of History actions

- Given an indexed native conversation is available
- When the user opens its toolbar or row context menu
- Then no generic metadata-edit action is shown
- And the external transcript bytes remain unchanged

#### Scenario: Gate native deletion

- Given the source Agent has no verified native delete contract
- When the conversation action menu is opened
- Then PromptHub does not offer native deletion
- And it never falls back to unlinking a discovered transcript file

### `FR-AGENT-068`: Resume In Original Agent

When a source adapter exposes a verified resume contract, PromptHub MUST offer
**Resume in original Agent** as the primary same-Agent action. Main process MUST
re-resolve the session, executable, typed arguments and project working
directory at execution time and launch without a shell. Copying the native
command MAY remain a secondary action. Unsupported, missing or unsafe state
MUST produce a stable actionable error and MUST NOT launch a fallback command.

#### Scenario: Resume the native conversation

- Given a Codex conversation still exists and its registered project is available
- When the user selects Resume in original Agent
- Then PromptHub executes the adapter-owned native resume arguments in that project
- And it does not create a synthetic PromptHub transcript or target session id

### `FR-AGENT-069`: Continue In Another Agent

PromptHub MUST offer **Continue in another Agent** with a target-Agent dropdown.
The dropdown MUST show only enabled Agents using their icon and full display
name without exposing transport implementation labels. Selecting an Agent MUST open a
preview of the exact bounded handoff context before any launch. Applying the
plan MUST start a new target conversation in the same project when direct
injection is supported, or open the target Agent without mutating the clipboard.

#### Scenario: Directly continue in a different Agent

- Given a Claude Code conversation is associated with a project
- And Codex is installed with a verified direct handoff adapter
- When the user selects Codex, reviews the context and confirms
- Then PromptHub launches Codex in that project with the reviewed context
- And the Claude Code conversation remains unchanged

#### Scenario: Confirm the reviewed snapshot after a live transcript update

- Given the source Agent receives another message while the handoff preview is open
- When the user confirms the already reviewed preview
- Then PromptHub launches the exact bounded payload shown in that preview
- And it does not silently rebuild the payload from the newer live transcript

#### Scenario: Degrade to launch only

- Given a selected Agent can open the project but cannot safely receive context
- When the user confirms continuation
- Then PromptHub opens that Agent directly without copying the reviewed payload
- And clearly reports that automatic context injection was unavailable without claiming that a new conversation was created

### `FR-AGENT-070`: Handoff Context Control And Privacy

The handoff preview MUST support full visible context, recent turns and
summary-only modes plus an optional user continuation instruction. The default
payload MUST be deterministic and MUST NOT require an AI call. Hidden reasoning,
system prompts, tool payloads, credentials, environment values and unrestricted
absolute paths MUST NOT enter the handoff. Optional AI summarization MUST be an
explicit action and MUST preserve access to the selected source messages.

#### Scenario: Review a bounded handoff

- Given a long conversation exceeds the target context budget
- When the user prepares a cross-Agent continuation
- Then the preview shows which content is included or omitted and why
- And no target process starts until the user confirms the exact payload

### `FR-AGENT-071`: Conversation Export

PromptHub MUST export one or multiple conversations as versioned JSON or
human-readable Markdown. Output MUST preserve ordered visible messages and
non-secret source/project metadata. Hidden records, credentials, native source
paths and absolute project paths MUST be excluded by default. Partial,
truncated, malformed or unavailable source state MUST be shown before export
and recorded in the output when the user explicitly accepts a partial export.
Cancellation or failure MUST leave no final or staging file.

#### Scenario: Export JSON and Markdown

- Given a readable project conversation
- When the user exports it as JSON and then Markdown
- Then both files contain the same ordered visible user/assistant messages
- And JSON declares its schema version while Markdown uses readable role sections
- And neither file contains source paths, credentials or hidden tool payloads

### `FR-AGENT-072`: Continuation Lineage And Recovery

Every applied cross-Agent continuation MUST record a device-local lineage edge
from source conversation to target Agent and, when known, target session. The
edge MUST store identity, status and payload digest rather than transcript
content. Failure MUST remain retryable without claiming success. Missing or
deleted endpoints MUST NOT cascade-delete the other conversation, and time
proximity alone MUST NOT silently link a target session.

#### Scenario: Follow a conversation across Agents

- Given a Claude Code conversation was continued in Codex
- When either conversation detail is opened
- Then PromptHub shows the source/target relationship and its status
- And losing the source file does not delete or corrupt the Codex conversation

### `FR-AGENT-073`: Stable Desktop Development Lifecycle

The desktop development command MUST keep exactly one owner for starting and
stopping Electron. When the Vite Electron plugin owns startup, package scripts
MUST NOT launch a second Electron process or terminate the renderer dev server
after the single-instance lock rejects that duplicate. A lazy module load
MUST remain available for the lifetime of the development window. Bootstrap,
lazy-render and hot-update failures MUST be contained by a renderer-level
recovery boundary instead of clearing the application root. Development MAY
attempt one automatic reload, but MUST enforce a cooldown to prevent loops.

#### Scenario: Keep the development window usable

- Given the desktop development command starts Vite and Electron
- When the main and preload bundles complete and the window remains open
- Then the renderer dev server continues serving lazy modules
- And the Agents workspace opens without a blank page or a failed dynamic import

#### Scenario: Recover from a renderer hot-update failure

- Given a renderer hot update temporarily invalidates a provider or lazy module
- When React throws while rendering the application root
- Then PromptHub attempts at most one automatic development reload per cooldown
- And otherwise displays a localized reload action without changing local data

### `FR-AGENT-074`: Evidence-Backed Agent Path Editing

The built-in Agent editor MUST derive editable asset fields from the canonical
platform registry. Skills, Rules, MCP, Plugins, Agents, Commands and declared
Config fields MUST appear only when that platform declares the corresponding
user-level surface, except that an existing explicit user override remains
visible and recoverable. PromptHub MUST NOT invent generic `agents/` or
`commands/` defaults for an undeclared platform. Custom Agents MAY expose the
complete path schema because the user owns that definition. Every edit entry
point MUST use the same field adapter and save only the fields it exposes.

#### Scenario: Edit a built-in Agent

- Given Tencent WorkBuddy declares Skills, MCP and Config but no Rules, Plugins, Agents or Commands path
- When its Agent editor opens
- Then only the root, Skills, MCP and Config path controls are shown
- And saving cannot create undeclared generic path overrides

#### Scenario: Preserve a prior explicit override

- Given a built-in Agent has an explicit path override for a surface no longer declared by the registry
- When its Agent editor opens
- Then that non-empty override remains visible and editable
- And clearing it removes the stale override instead of silently retaining it

#### Scenario: Edit a custom Agent

- Given a user-defined Agent is opened from either Agent management entry point
- When its paths are edited
- Then Skills, Rules, MCP, Plugins, Agents, Commands and Config paths are available
- And the selected root directory and every edited path survive reload

### `FR-AGENT-075`: Installed-Only Agent Management

The Agents workspace MUST project only locally detected Agent installations
into its sidebar, count, search results and normal selection state. Registry
entries, configured templates and pinned ids MUST NOT make an undetected Agent
manageable. If persisted or transient state still resolves an undetected Agent,
only Overview MAY remain enabled; every other tab and editing action MUST be
disabled, and PromptHub MUST NOT read its config files, assets, sessions,
provider, appearance or usage data.

#### Scenario: Hide an Agent that is not installed

- Given CodeBuddy exists in the canonical registry but is not detected locally
- When the Agents workspace refreshes
- Then CodeBuddy is absent from the list, count and search results
- And an old CodeBuddy selection falls back to an installed Agent or the empty state

#### Scenario: Contain a stale undetected detail

- Given stale renderer state still contains an undetected Agent detail
- When that detail renders
- Then Overview is the only enabled tab
- And no config, asset, session, provider, appearance or usage reader is called

### `FR-AGENT-076`: Antigravity CLI Conversation History

PromptHub MUST expose current Antigravity CLI conversations from the documented
device-local `~/.gemini/antigravity-cli` runtime without parsing or mutating the
legacy Antigravity desktop protobuf store. The adapter MUST discover bounded
SQLite conversation identities, associate projects only from the CLI-owned
cache, read visible user/assistant/system messages only from the CLI-generated
`brain/<conversation-id>/.system_generated/logs/transcript.jsonl` projection,
and expose `agy --conversation <id>` as the native resume contract. A valid
conversation without a readable transcript projection MUST remain listable and
resumable while its detail reports no fabricated body. Malformed, oversized,
symlinked, traversal or unsupported legacy input MUST fail closed.

#### Scenario: Browse and resume an Antigravity CLI conversation

- Given the current Antigravity CLI stores a conversation database and a safe
  generated transcript projection for the same UUID
- When the user opens Antigravity History
- Then PromptHub shows the project, bounded title and ordered visible messages
- And Resume in original Agent launches `agy --conversation <uuid>` without a
  renderer-built shell command

#### Scenario: Keep a database-only conversation honest

- Given a valid Antigravity CLI conversation database has no generated
  transcript projection
- When PromptHub lists and opens that conversation
- Then the conversation remains visible and natively resumable
- And the detail returns no inferred or protobuf-decoded messages
- And the adapter reports the partial source without reading legacy desktop
  `~/.gemini/antigravity/conversations/*.pb` files

### `FR-AGENT-077`: Unified Agent Asset Card Anatomy

The Agent Skills, MCP and Plugins inventories MUST render through one shared
icon-led card anatomy. Every card MUST reserve the same regions for identity,
status, description, source, metadata chips and a bottom action footer. Skills
MUST show the existing Skill identity fallback, MCP MUST show the server icon,
and Plugins MUST retain package artwork when available with the plug fallback.
Domain-owned actions and state MUST remain unchanged; visual unification MUST
NOT invent unsupported actions or create another asset state source.

Card height and footer position MUST remain identical when titles, descriptions,
source labels, statuses or metadata counts differ. Each text region MUST be
bounded by the shared anatomy: long values are truncated or clamped inside
their own slot instead of increasing card height, while the complete asset
remains available through the card detail or explicit open action.

The Agent workspace product term MUST render as `Plugins` in every locale,
matching the adjacent `Skills` and `MCP` taxonomy. Other descriptive Plugin
copy may remain localized.

#### Scenario: Compare distributable asset cards

- Given an installed Agent exposes Skills, MCP and Plugins
- When the user moves across the three inventory tabs
- Then every asset card has an icon, title/status row, bounded description,
  source row, metadata chips and an aligned icon-action footer
- And the shared regions use the same dimensions and spacing across domains
- And additional text or metadata cannot move the card footer or change the
  card's outer height
- And each action still invokes only its owning Skill, MCP or Plugin workflow

#### Scenario: Keep Plugins as a stable product term

- Given the application locale is Simplified Chinese, Traditional Chinese or
  Japanese
- When the Agent workspace tabs are rendered
- Then the Plugin tab label is `Plugins`
- And domain-specific explanatory text remains localized

### `FR-AGENT-078`: Align Agent Workspace Leading Edges

The Agent identity header and its primary tabs MUST use the same leading edge
as the asset toolbar and inventory content. Skill, MCP and Plugin asset
toolbars MUST NOT repeat their section name immediately before the search
field because the selected top-level tab already provides that context.

#### Scenario: Open an asset workspace

- Given an installed Agent is selected
- When the user opens its Skills, MCP or Plugins tab
- Then the Agent identity, tabs, asset controls and cards share a consistent
  left alignment
- And the search field is the first asset toolbar control
- And no second domain heading is rendered beside it

### `FR-AGENT-079`: Lossless Paginated Conversation Bodies

PromptHub MUST NOT treat a large native transcript as an unreadable or empty
conversation merely because visible messages occur after an initial byte
preview. Session detail reads MUST support bounded cursor pagination owned by
the main process. Each page MUST scan native records until it collects the
requested number of visible messages, reaches the true end of the source or
reaches a bounded per-request scan budget. A continuation cursor MUST allow the
renderer to request the next page without duplicating prior messages. Native
tool/runtime records MAY remain hidden, but they MUST NOT consume the visible
message page size.

#### Scenario: Read visible messages after a large runtime prefix

- Given a Codex rollout contains more than 2 MiB of hidden runtime records
  before its first user message
- When the user opens the conversation
- Then PromptHub scans beyond the old prefix and renders the first visible page
- And a main-owned cursor loads subsequent visible pages until the true end
- And the UI does not present the conversation as empty or permanently
  truncated

#### Scenario: Read current Codex response-item messages

- Given a current Codex rollout stores visible user and assistant messages as
  top-level `response_item` records with `payload.type = message`
- When the user opens that conversation in History
- Then PromptHub renders its bounded text content and derives the list title
  from the first visible user message
- And developer, reasoning, tool and image payloads remain excluded
- And the compatible legacy `event_msg` format remains readable

#### Scenario: Continue through a large Pi transcript

- Given a Pi or Oh My Pi JSONL transcript extends beyond the initial bounded read
- When the user advances beyond the currently loaded message pages
- Then PromptHub requests source-bound cursor pages on demand until the native file ends
- And the viewer does not show a permanent limited-preview notice for content that remains loadable

#### Scenario: Keep paginated reads bounded and stable

- Given the renderer requests a transcript page
- When the cursor or limit is malformed, oversized or stale for the source
- Then the main process rejects the request without reading an arbitrary path
- And valid pages contain no duplicate visible entries
- And changing the selected Agent or conversation discards stale page results

#### Scenario: Browse and resume Augment CLI history

- Given Auggie has saved native JSON sessions under `~/.augment/sessions`
- When the user opens Augment History, searches a conversation or loads its
  next body page
- Then PromptHub projects only user and assistant text with native project,
  model and timestamp metadata
- And the original session resumes through `auggie --resume <id>` in its
  workspace
- And authentication state, user identity, tool payloads and task storage do
  not enter the renderer, index, export or sync surfaces

### `FR-AGENT-080`: Full-Workspace Agent Asset Details

Within the Agent management workspace, `Agent assets` is the shared product
term for the Skills, MCP and Plugins card domains. Rules remains a dedicated
editor workspace and is not part of this card-detail navigation contract.

Opening any Agent asset card MUST replace the entire detail area to the right
of the Agent list. The Agent identity header and primary tabs MUST NOT remain
above an open asset detail. Returning from the detail MUST restore the same
Agent and asset tab without losing the domain list state.

#### Scenario: Open and close an Agent asset

- Given an installed Agent has a Skill, MCP server or Plugin card
- When the user opens that card
- Then the corresponding owning-domain full detail page fills the complete
  workspace to the right of the Agent list
- And the Agent identity header and primary tabs are not rendered above it
- When the user chooses Back
- Then the prior Agent asset tab, filters and list are restored

#### Scenario: Keep all three Agent asset domains consistent

- Given the user moves between Skills, MCP and Plugins
- When any card opens or closes
- Then every domain reports the same detail-navigation state to the Agent
  workspace shell
- And no domain embeds its detail only below the Agent tabs

### `FR-AGENT-081`: Evidence-Backed Read-Only Session Breadth

PromptHub MUST expose readable native history for every built-in Agent whose
local session contract can be verified without guessing private formats. A
read-only adapter MUST support bounded list, search and cursor-paginated detail
reads. Native resume and editing are optional capabilities and MUST NOT block
read-only delivery.

Cherry Studio support is limited to Agent sessions stored in the current
official `Data/cherrystudio.sqlite` `agent_session` /
`agent_session_message` schema, with the locally verified older
`Data/agents.db` `sessions` / `session_messages` schema retained as a read-only
fallback. Normal chats, memory databases, credentials and private runtime
state remain outside this contract. Kilo support reads its verified
`storage/session`, `storage/message` and `storage/part` JSON trees and projects
only user/assistant text parts; reasoning, tools, snapshots and step records
remain hidden.

#### Scenario: Browse Cherry Studio Agent sessions without mutating the store

- Given Cherry Studio has a regular, non-symlink current Agent database or the
  verified older Agent database
- When the user lists, searches or pages an Agent session
- Then PromptHub opens the database read-only and returns only user/assistant
  visible text content
- And the current database is preferred when both versions exist
- And reasoning, tool payloads, memory and authentication state are not
  returned, written or exported

#### Scenario: Browse and resume Kilo sessions

- Given Kilo has valid local session, message and text-part JSON records
- When the user lists, searches or pages a session
- Then PromptHub returns every requested visible page without a silent list or
  body omission
- And reasoning, tool, snapshot and step parts are excluded
- And original-Agent continuation uses the typed `kilo --session <id>` command
  when the session project directory is valid

#### Scenario: Fail closed on unverified or unsafe sources

- Given a source is missing, malformed, symlinked, outside its verified root or
  exceeds an explicit scan boundary
- When PromptHub reads the source
- Then a missing root returns an honest empty list and unsafe/invalid sources
  return a stable local error
- And PromptHub does not infer a private format or report unsupported Agents as
  adapted

### `FR-AGENT-082`: Shared Agent MCP Detail Composition

An Agent MCP entry MUST use the same full detail composition whether it is
opened from the MCP management workspace or from an Agent's MCP asset tab. The
composition MUST include source status, transport-specific fields, copyable
configuration, the owning Agent source sidebar and the applicable import,
open-config, open-managed-entry and removal actions.

Each entry point MAY provide a different Back destination and action labels,
but MUST NOT maintain a reduced or independently styled MCP detail page.

#### Scenario: Open the same Agent MCP from either workspace

- Given an Agent MCP entry is visible in MCP management and Agent management
- When the user opens the entry from either location
- Then both locations render the shared split content and Agent source sidebar
- And managed versus external state is derived from the same entry data
- And returning preserves the workspace from which the entry was opened

### `FR-AGENT-083`: Shared Skill And Plugin Agent Detail Adapters

Agent-owned Skill and Plugin assets MUST use their owning domain's canonical
full detail page and one shared Agent-context adapter per asset domain,
regardless of whether the asset is opened from the owning management workspace
or from an Agent asset tab.

The Skill adapter MUST derive managed, external, copied, symlinked, built-in and
read-only states consistently and MUST NOT offer uninstall for read-only
discovery entries. Opening Agent management directly MUST load the canonical My
Skills library before classifying scanned Agent Skills and MUST NOT start a
second library read while one is already in progress. The Plugin adapter MUST
derive target-installed versus PromptHub-managed state consistently and MUST
preserve working import, folder, managed-entry and store actions in every entry
point.

#### Scenario: Open the same Skill or Plugin from either workspace

- Given a Skill or Plugin is visible in both its owning management workspace
  and Agent management
- When the user opens the asset from either location
- Then both locations render the canonical full detail page through the same
  domain-specific Agent adapter
- And management status and available actions are identical for the same asset
- And read-only or external assets never gain a destructive managed action
- And entering Agents before Skills does not misclassify managed Skills as
  external

## Non-Functional Requirements

### `NFR-AGENT-001`: Local-First And Privacy

Agent configuration processing and session indexing MUST work locally. External session bodies, credentials, local absolute paths, request logs, and usage details MUST NOT enter remote sync or telemetry by default.

### `NFR-AGENT-002`: Security

All filesystem, IPC, import, deep-link, process execution, and network boundaries MUST validate type, size, path, protocol, command arguments, redirects, timeouts, and redaction. Shell command construction from untrusted strings is prohibited.

### `NFR-AGENT-003`: Reliability

Provider activation and supported config edits MUST be restart-safe, idempotent where possible, backed up, and recoverable after process interruption. No failed operation may be reported as active or synchronized.

### `NFR-AGENT-004`: Performance

The Agents workspace MUST remain responsive with at least 50 platforms, 100 Provider Profiles, 10,000 sessions, and 1,000 assets. Lists and sessions MUST use bounded, cancellable, paginated or virtualized operations.

### `NFR-AGENT-005`: Compatibility

Existing Prompt, Skill, MCP, Rules, Plugin, AI settings, platform paths, backup, sync, tray, and CLI detection behavior MUST remain compatible unless separately specified and tested.

### `NFR-AGENT-006`: Accessibility And Localization

All user-visible copy MUST use the seven supported locales. Keyboard navigation, focus restoration, reduced motion, screen reader names, and narrow desktop layouts MUST be covered.

### `NFR-AGENT-007`: Observability Without Secret Leakage

Operations MUST emit structured result categories, adapter name/version, duration, and redacted diagnostics. Logs MUST never include credentials, authorization headers, full native config files, or unrestricted transcript bodies.

## Acceptance Boundary

The first production delivery is accepted only when:

- Every locally detected Agent in the current built-in registry and every detected custom Agent is visible without creating a profile; disabled and undetected Agents are absent.
- Default ordering prioritizes pinned and curated common Agents within the locally detected set.
- Every platform capability is reported independently; unsupported native config management does not block path, asset, or overview management.
- Every adapter that declares provider support passes import, preview, activation, verification, external-change detection, and rollback tests against representative fixtures.
- Agent asset summaries agree with their owning domains.
- At least two verified session adapters support browse/search/read/resume.
- All verified session adapters contribute bounded metadata to one
  project-centered catalog, and unresolved sessions require explicit project
  association before continuation.
- Every adapter with a verified native resume contract can be launched through
  Resume in original Agent without renderer-built shell commands.
- Every enabled target Agent appears in the cross-Agent picker by full display
  name; its apply plan resolves to direct, launch or unavailable without
  exposing transport labels in the compact picker. At least Claude Code and
  Codex pass the direct continuation contract when installed.
- Cross-Agent continuation preserves the source, records lineage, previews the
  exact bounded payload and never claims native session-state migration.
- Single and batch JSON/Markdown exports preserve ordered visible messages,
  report partial sources and exclude secret/hidden/path data by default.
- Provider secrets are absent from normal storage, IPC, logs, snapshots, and exports.
- Tray switching uses the same verified activation service.
- Full backup and restore preserve non-secret Agent configuration and expose missing secrets for repair.
- Existing release regression suites remain green.

### `FR-AGENT-084`: Import PromptHub Providers Into Agent Profiles

The Provider & Model workspace MUST list compatible PromptHub AI providers as
redacted import sources. Import MUST create an independent per-Agent Provider
Profile and model mapping; it MUST NOT alias or mutate the global AI provider
record. Provider credentials MUST be resolved and copied only in the main
process, and no credential value or secret reference may enter the renderer
payload. Unsupported protocol/platform combinations MUST remain visible with a
specific incompatibility reason and MUST NOT be importable.

#### Scenario: Import a compatible global provider

- Given PromptHub has a global OpenAI-compatible provider with chat models
- When the user imports one model into Codex
- Then PromptHub creates an independent Codex Provider Profile with source
  `import`, the selected primary model and a main-owned credential reference
- And the global provider record and Codex native configuration remain unchanged
  until the user separately previews and confirms activation

#### Scenario: Reject a lossy projection

- Given a global provider protocol cannot be represented by the selected Agent
- When the user opens the import source picker
- Then the provider remains visible with its incompatibility reason
- And the import action is disabled without creating a Profile or copying a
  credential

### `FR-AGENT-085`: Verified Current-Format Session Expansion

PromptHub MUST promote a built-in Agent from planned history support only after
its current local session contract is verified from first-party documentation
or current upstream source. The promoted read-only surface MUST provide the
complete discoverable catalog with offset pagination, visible-body search,
opaque cursor-paginated detail and export-compatible user/assistant messages.
Tool calls, tool results, reasoning, system/runtime records and credentials
MUST remain excluded. Native resume is advertised only when a stable direct
command is independently verified.

Read-only qualification requires a real visible transcript body: list-only
metadata, an opaque session id, or an encrypted/private store without a public
reader contract does not qualify. PromptHub MUST keep such platforms planned
rather than presenting an empty conversation as supported. Local sources MUST
remain platform-owned and immutable; cloud-only history requires a separately
approved authenticated adapter and explicit user opt-in.

This batch covers Hermes `state.db`, Reasonix event logs, NanoClaw v2 inbound /
outbound databases, CoPaw/QwenPaw SafeJSONSession workspaces and Qoder's
documented transcript JSONL. QoderWork remains planned because its public Hook
contract currently exposes a session id but no stable transcript path or file
schema.

#### Scenario: Read a Qoder transcript without private runtime records

- Given Qoder generated a regular
  `~/.qoder/projects/<project>/transcript/<session-id>.jsonl` file
- When the user lists, searches, pages or exports that conversation
- Then PromptHub includes only string user questions and assistant `text`
  blocks whose session id matches the source file
- And progress, Hook, tool-use and tool-result records do not enter metadata,
  search, detail or export
- And PromptHub does not claim direct Qoder resume while the documented CLI
  exposes resume only as an interactive TUI command

#### Scenario: Keep unverified sibling products honest

- Given QoderWork exposes session Hook events but no public transcript storage
  contract
- When PromptHub reports QoderWork capabilities
- Then Sessions remains planned instead of reusing the Qoder adapter or
  guessing a private QoderWork path

#### Scenario: Do not promote an opaque local session store

- Given a platform exposes session ids in a public settings database but keeps
  message bodies in an undocumented encrypted or private store
- When PromptHub evaluates read-only History support
- Then the platform remains planned until a first-party export, API or stable
  local body schema is verified
- And PromptHub does not display metadata-only sessions as empty conversations

### `FR-AGENT-086`: Current Native Provider Identity And Official Restore

The Provider & Model workspace MUST show the Agent's current native provider
configuration even when PromptHub has never created or activated a Provider
Profile for that Agent. The public projection MUST identify the provider as
official, custom or unknown and MAY show its provider name, protocol, sanitized
endpoint, selected model and credential ownership/status. It MUST NOT expose a
credential value, authorization material or secret reference.

The current native configuration MUST remain available as an explicit source
for creating an independent Provider Profile. For platforms with a verified
official-provider write contract, the workspace MUST also offer an official
restore action. That action MUST create or reuse an independent official
Profile and enter the existing activation preview/confirmation flow; it MUST
NOT write native configuration before confirmation. Platforms without a
verified official default MUST omit or disable restore instead of inventing a
provider, model or credential contract. Manual custom Profile creation remains
available independently.

The native configuration MUST be presented as a normal selectable card rather
than a rail-selected row, and its sanitized provider, protocol, endpoint,
model, and credential-ownership fields MUST be visibly grouped. Because the
native file remains owned by the Agent, this projection MUST stay read-only and
MUST explain that boundary in the workspace. The primary management action
MUST create an independent PromptHub Profile from the sanitized projection and
open that Profile in the existing editable right-pane editor; it MUST NOT turn
the Agent-owned file into a renderer-editable document or expose credentials.

#### Scenario: Show a custom Claude configuration before any Profile exists

- Given Claude Code is installed and its native settings configure a custom
  Anthropic-compatible endpoint and credential
- And PromptHub has no Claude Provider Profiles or verified activation snapshot
- When the user opens Provider & Model
- Then the current native configuration is shown as custom with its sanitized
  endpoint, model and credential type/status
- And no credential value or secret reference enters IPC or renderer state

#### Scenario: Restore a verified official provider safely

- Given Codex or Claude Code currently uses a custom provider and exposes a
  usable current model
- When the user chooses restore official configuration
- Then PromptHub creates or reuses the platform's verified official Profile,
  preserving the current model for review
- And native configuration remains unchanged until the user confirms the
  existing activation preview
- And cancelling the preview leaves the Agent native configuration unchanged

#### Scenario: Turn the native summary into an editable Profile

- Given an Agent has a native provider configuration but no editable PromptHub
  Profile for it
- When the user chooses to manage the native configuration
- Then the workspace previews the sanitized import and requires confirmation
- And confirmation creates an independent Profile and opens it in the existing
  right-pane editor
- And the Agent-owned native configuration remains unchanged until a later
  reviewed activation

### `FR-AGENT-087`: Project-Scoped Native Resume And Dense Transcript Layout

Claude Code history MUST derive the selected conversation's project directory
from bounded, validated JSONL metadata and pass that absolute directory to the
native resume command. A matching session id MUST be resumed with typed
arguments from that directory; relative, null-byte or otherwise unsafe source
values MUST NOT enter the launcher command.

The history viewer MUST use a compact vertical rhythm for consecutive message
bubbles. Native resume MUST be represented as a current-Agent terminal action
rather than a share action. The continuation action hierarchy is defined by
`FR-AGENT-088`.

#### Scenario: Resume a Claude conversation from its owning project

- Given a Claude JSONL conversation contains a valid absolute `cwd` and session
  id
- When the user invokes native resume from History
- Then PromptHub launches `claude --resume <session-id>` with that `cwd`
- And Claude resolves the selected project conversation instead of searching
  from the user's home directory

#### Scenario: Ignore unsafe resume metadata

- Given an older or malformed Claude record contains a relative `cwd` or unsafe
  session id
- When PromptHub lists the conversation
- Then the unsafe values are excluded from resume metadata
- And the source filename remains the bounded local conversation identity

### `FR-AGENT-088`: Two-Step Continuation And Transcript Pagination

History MUST expose exactly two primary continuation choices: continue in the
current Agent through its verified native resume contract, or hand the
conversation to a different detected Agent. Target Agent and project selectors
MUST remain hidden until the user chooses cross-Agent continuation. The target
selector MUST NOT hide a detected Agent merely because it lacks a PromptHub-
verified CLI prompt-injection contract. Verified permanent deletion MAY remain
in the overflow menu, while export MUST have a distinct icon action with
Markdown and JSON choices. Conversation metadata editing MUST NOT be exposed.

The main-process continuation service MUST select one evidence-backed handoff
transport for the target Agent. A verified interactive CLI target MAY receive
the reviewed payload directly. A detected application with an allowlisted
launch contract MUST receive the payload through the clipboard before the
application opens. A target without either contract MUST remain available as a
copy-only fallback so the user can paste the portable handoff context manually.
The review surface MUST name the selected behavior before execution and MUST
never describe a portable cross-Agent handoff as native session resume.

For a direct CLI transport, the reviewed preview MUST expose the exact shell-
quoted command derived by the main-process continuation service. For launch or
copy-only transports, the copy action MUST copy the reviewed portable payload,
not an unusable synthetic command. If application launch fails after copying,
the user MUST be told that the context remains copied for manual continuation.

The transcript viewer MUST render a bounded message page rather than mounting
the complete loaded conversation or requiring repeated scroll-to-end actions.
Users MUST be able to jump between loaded pages directly. Moving beyond the
last loaded page MUST request the next source-bound cursor page without losing
already loaded messages.

#### Scenario: Choose the continuation mode before configuration

- Given a readable conversation has a verified native resume command and at
  least one detected target Agent
- When the user opens the conversation
- Then the action surface shows `Continue in <current Agent>` and `Continue
elsewhere` as its two primary controls
- And target Agent and project selectors are not visible until `Continue
elsewhere` is selected

#### Scenario: Continue directly in a verified target

- Given the user selected a target with a verified interactive handoff and reviewed the
  portable context
- When the handoff preview opens
- Then PromptHub offers the exact shell-quoted CLI command as a copy action
- And the terminal action launches the same target, working directory and
  reviewed payload when that CLI is resolvable
- And unresolved CLI targets cannot report a successful terminal launch

#### Scenario: Copy context before opening another Agent

- Given the user selected a detected target application without a verified
  prompt-injection CLI contract
- When the user confirms the reviewed handoff
- Then PromptHub copies the same reviewed payload to the clipboard before
  opening the allowlisted target application
- And if the application cannot be opened, the copied context remains available
  and the failure message explains the manual paste fallback

#### Scenario: Keep unsupported targets available as copy-only handoff

- Given a detected target Agent has neither a verified direct handoff nor an
  allowlisted application launch contract
- When the user reviews cross-Agent continuation
- Then the target remains selectable
- And PromptHub offers the reviewed portable payload as a copy-only fallback
- And PromptHub does not claim that the target session was resumed or launched

#### Scenario: Jump through a large transcript

- Given the reader has loaded 80 messages and exposes another source cursor
- When the user opens the transcript
- Then only the first 20 messages are mounted and pages 1 through 4 are
  directly selectable
- And advancing from page 4 reads the next cursor batch and displays page 5
  without discarding pages 1 through 4

### `FR-AGENT-089`: Inline Provider Profile Editing

Provider & Model MUST create and edit Provider Profiles in the right-hand
workspace instead of opening a modal. Choosing Add MUST open an unsaved draft
with platform-aware defaults; no Profile, model mapping or credential may be
persisted until Save succeeds. Cancel MUST discard the draft and return to the
previous current-native or Profile detail.

The editor MUST group the complete fields supported by the selected Agent's
verified adapter into identity, connection/protocol, model routing and
authentication sections. It MUST expose environment-owned credentials where
the adapter supports them and write-only PromptHub-managed credentials where
PromptHub owns them. Fields that require a separate local proxy, protocol
conversion or unimplemented native projection MUST NOT be shown as effective
configuration.

#### Scenario: Add a custom Codex provider without a modal

- Given Codex Provider management is supported
- When the user chooses Add profile
- Then the right workspace becomes an Add provider profile editor
- And the editor shows provider identity, Responses/Chat protocol, endpoint,
  primary model and PromptHub-managed or environment-owned authentication
- And no dialog opens and no Profile is created before Save

#### Scenario: Cancel an unsaved provider draft

- Given the user changed fields in a new Provider draft
- When the user cancels
- Then PromptHub performs no Provider IPC write
- And returns to the previously selected current-native or Profile detail

#### Scenario: Do not emulate CC Switch proxy-only settings

- Given CC Switch exposes model catalogs, reasoning conversion or request
  routing through its local proxy
- When PromptHub renders a direct Agent Provider editor without that proxy
- Then those controls are omitted unless the selected Agent adapter can write
  and verify the same native behavior independently

### `FR-AGENT-090`: Agent Config Editor Isolation

The native Config Files workspace MUST treat the bounded file inventory as its
read/write allowlist. An existing file that is neither declared by the Agent
adapter nor returned by bounded discovery MUST NOT become readable or writable
through a caller-supplied relative path.

Changing the selected Agent MUST isolate inventory, selected-file content and
in-flight asynchronous results by source identity. PromptHub MUST ask for
confirmation before a user-initiated Agent switch discards unsaved config
changes.

Provider Profile credentials remain governed by their existing credential
ownership and reveal controls. This requirement does not remove the explicit
eye-button reveal behavior from the Provider editor.

#### Scenario: Reject an undiscovered existing file

- Given an editable file exists below an Agent root but outside declared paths
  and bounded discovery directories
- When a caller addresses the file directly through config read or write IPC
- Then PromptHub returns `AGENT_CONFIG_FILE_NOT_DISCOVERED`
- And the existing file remains unchanged

#### Scenario: Switch between equal relative paths safely

- Given two Agents each expose `config.toml`
- When the user switches Agents while either Agent has an in-flight list or read
- Then only the newly selected Agent inventory and content can render
- And an older completion cannot overwrite the new source state

#### Scenario: Protect unsaved config edits

- Given the active Agent config editor has unsaved changes
- When the user selects another Agent
- Then PromptHub asks whether to discard the changes
- And cancellation keeps the current Agent and editor state

### `FR-AGENT-091`: Focused Appearance Sub-Workspaces

The Appearance tab MUST separate desktop skins and Pets into two focused
sub-workspaces selected from a compact left-side icon navigation rail. The rail
MUST remain inside the Appearance tab and MUST NOT add more top-level Agent
tabs. Pets MUST appear before desktop skins in this rail. Each destination MUST
show its own item count and preserve a stable selection while Appearance
remains mounted.

The desktop-skin destination MUST be the default. It alone owns native
appearance status, restore, restart permission, skin import, skin inventory and
the skin directory action. The Pets destination alone owns Pet import, Pet
inventory and the Pet directory action. A destination MUST NOT render the
other destination's cards or actions, and invalid-item feedback MUST use only
the selected destination's invalid count.

#### Scenario: Switch from skins to Pets without mixed controls

- Given Appearance has one installed skin and two valid Pets
- When the user selects Pets from the Appearance navigation rail
- Then the skin card, native appearance controls and skin import action are not rendered
- And the two Pet cards, Pet import action and Pet directory action are rendered
- And returning to desktop skins restores the skin workspace without reloading the Agent

### `FR-AGENT-092`: Managed Pet Inventory And Allowlisted Catalog

The Pets sub-workspace MUST provide a responsive installed inventory with at
least three columns when the available content width permits. Every installed
Pet MUST expose its v1 or v2 sprite contract, exact managed path, preview,
metadata edit, export, path-open and delete actions. Metadata edits MUST
preserve unknown manifest fields and MUST use atomic replacement. The preview
MUST be the dominant card content rather than a small identity icon. The exact
managed path MUST remain available to the path-open action but MUST NOT occupy
the visible card body.

The workspace MUST also provide a catalog sourced only from the hardcoded
official `legeling/awesome-codex-pet` project and MUST identify that destination
as `Awesome Codex Pet` in every supported locale. Catalog search and paging
MUST be bounded. Editing the search field MUST NOT fetch or filter the catalog;
only an explicit search-button action or Enter submission commits the query.
A newer submitted query MUST be allowed to supersede an older in-flight query.
Catalog cards MUST reuse the same Agent asset-card shell,
spacing, typography and quick-action layout used by Skills, MCP and Plugins,
while their Pet-specific content body MUST use a large bounded preview, MUST
keep long titles, descriptions and metadata inside the card, and MUST NOT
render the catalog identifier as source-path copy. Their image source MUST
prefer the project's published
`codexpet.top/assets/previews/<pet-id>/webp/idle.webp` preview and MUST fall back
to the validated package spritesheet rather than a guessed repository path.
Valid preview bytes MUST be reused from a bounded persistent cache across
catalog refreshes and application restarts. Stale, invalid or excess cache
entries MUST be removed without blocking catalog use.
Catalog, manifest, sprite and preview responses MUST enforce timeouts and byte
limits, MUST reject redirects or paths outside the two hardcoded official asset
prefixes, and MUST NOT execute upstream installers or telemetry.
Installing an item MUST stage and validate the package before reusing the
existing Pet import transaction. Installed Pets remain filesystem-owned under
the selected Codex root and remain outside PromptHub backup and sync.

#### Scenario: Manage and install Pets without changing ownership

- Given two installed Pets and one valid catalog Pet
- When the user edits an installed Pet and installs the catalog Pet
- Then the edited `pet.json` preserves its unknown fields and is atomically replaced
- And the catalog package is validated before appearing in the installed inventory
- And every card uses the shared Agent asset-card measurements, gives the Pet preview primary visual weight and shows the sprite contract version
- And the catalog destination is labelled `Awesome Codex Pet` without card text overflow
- And the catalog preview loads from the published gallery or the validated package fallback
- And a valid cached preview is reused without another upstream image request
- And every installed card can open its exact directory
- And no Pet bytes are copied into PromptHub durable storage

### `FR-AGENT-093`: Bounded Agent Quotas In The Menu Bar

The PromptHub menu bar MUST expose Agent quotas through Electron's native menu
on macOS, Windows and Linux. It MUST NOT create a renderer BrowserWindow,
vibrancy shell, custom cards, product-icon rows, plan badges, ring/progress
graphics or expansion controls for the menu-bar quota surface.

The native Agent Quotas submenu MUST list every verified and enabled usage
adapter in stable registry order. Successful rows expose a compact most-
constrained summary plus plain native submenu lines for plan, every bounded
metric and reset time. Missing credentials, expired access, unavailable usage,
loading and successful responses with no metrics remain explicit rather than
becoming fake zeroes.

The native projection MUST reuse the same process-wide usage service as the
Agent workspace. Menu construction MUST use the latest in-memory snapshot and
MUST NOT wait on provider network calls. Refresh work remains deduplicated,
bounded to at most two providers at once, timed out by the owning adapter and
isolated per provider. A failed refresh preserves a prior successful snapshot
as stale, and no menu label or log may expose credentials, provider bodies,
control characters or raw errors.

#### Scenario: Open native quotas without blocking

- Given one or more cached quota snapshots exist
- When the user opens the PromptHub tray menu and selects Agent Quotas
- Then the operating system renders the menu and quota submenus
- And the current snapshot appears synchronously without a renderer window
- And every metric, reset time and optional plan is plain native menu text
- And background refresh does not block the menu

#### Scenario: Open quotas before the first snapshot exists

- Given one or more verified adapters have not completed their first request
- When the native Agent Quotas submenu opens
- Then every currently verified Agent appears in stable order with a named loading row
- And settled providers update the next native menu snapshot independently
- And the inventory never collapses into one anonymous loading item

#### Scenario: Degrade one provider without losing the others

- Given one Agent adapter rejects while another returns a valid quota snapshot
- When the quota projection refreshes
- Then the failed Agent receives a bounded unavailable state
- And the valid Agent remains visible with its metrics
- And a previous successful row is retained and marked cached when its refresh fails
- And no rejected error text or credential material reaches the native menu

#### Scenario: Remove the rendered quota surface

- Given PromptHub previously mounted `surface=agent-usage` in a frameless window
- When the native menu implementation is installed
- Then the renderer popover component, queue model, custom CSS, locale keys,
  BrowserWindow factory and popover controller no longer exist
- And tray destruction has no secondary quota-window resource to release

### `FR-AGENT-094`: Dense And Safe Conversation Pagination

The Agent conversation detail header MUST render continuation, export and
metadata actions as a lightweight row without an additional rounded card shell.
Selected session rows MUST retain an explicit readable foreground color in light
and dark themes and MUST NOT rely on saturated primary text/background pairs.

Transcript pagination MUST clamp a page request to loaded entries and MUST follow
at most eight advancing native cursors when a page contains only duplicate or
empty records. A cursor that does not advance MUST terminate loading. The detail
view MUST never render a blank page solely because a cursor response was empty;
it MUST show the nearest page containing loaded entries instead. Transcript
bodies remain platform-owned and are never persisted by this renderer fix.

#### Scenario: Skip duplicate cursor records

- Given the current page ends at the loaded transcript boundary
- When the next native cursor repeats known entries and supplies an advancing cursor
- Then the renderer follows the cursor within the bounded hop limit
- And the requested page shows the first newly loaded entry instead of an empty view

#### Scenario: Prevent stale empty pages

- Given a cursor returns no new entries and no advancing cursor
- When the user requests the next message page
- Then the renderer stays on or clamps to the last page containing entries
- And the transcript never presents an empty page caused by pagination state

### `FR-AGENT-095`: Unified Provider Workbench And Pi Native Import

Every Agent Provider & Model view MUST use the same sidebar width, toolbar
placement, provider-row anatomy, detail header, metadata-row treatment and
section surfaces. Platform adapters MAY expose different fields and actions,
but they MUST NOT replace the shared visual hierarchy with an Agent-specific
page composition.

Pi MUST expose an import action in the shared sidebar toolbar. The action MUST
list PromptHub providers, allow one compatible chat model to be selected, and
import the selection into Pi's native `models.json` catalog. When the selected
PromptHub model has a configured credential, the credential MUST be written to
Pi's native `auth.json` without crossing the renderer boundary.

The Pi import MUST validate the provider id, endpoint, protocol and model,
reject duplicate or unsupported entries before writing, create backups, detect
concurrent modification, and restore both native files after any partial write
failure. Cancelled or invalid imports MUST perform zero native writes.

#### Scenario: Provider tabs share one visual hierarchy

- Given Claude Code and Pi expose different native provider adapters
- When the user opens Provider & Model for either Agent
- Then both views use the shared sidebar, toolbar, list-row and detail-section primitives
- And only platform-specific data and commands differ

#### Scenario: Import a PromptHub provider into Pi

- Given a PromptHub chat provider uses a Pi-supported protocol
- And the user selects one compatible model in Pi's import dialog
- When the import is confirmed
- Then the provider and model are written to Pi's native catalog
- And any configured credential is written only by the main process
- And the refreshed Pi provider list exposes the imported provider

#### Scenario: Import rollback is complete

- Given the Pi catalog write succeeds but the credential write fails
- When the combined import reports failure
- Then both `models.json` and `auth.json` match their pre-import contents
- And the renderer receives only a stable public error code

### `FR-AGENT-096`: Pi Current Provider Import Parity

Pi MUST expose the same current-configuration import action and PromptHub-source
import action in the shared Provider toolbar. Importing the current Pi
configuration MUST create an editable same-id override for the currently active
built-in provider without copying, deleting or returning its credential and
without replacing Pi's built-in model catalog.

The action MUST be unavailable when Pi has no configured provider or the current
provider is already custom. Main MUST resolve the current provider and model from
native configuration, validate both against the built-in catalog, then use the existing
backup, digest, atomic-write, re-read verification and rollback pipeline.

#### Scenario: Make the current built-in Pi provider editable

- Given Pi's current provider comes from the built-in catalog
- When the user confirms the current-configuration import
- Then PromptHub writes a behavior-preserving same-id provider override to `models.json`
- And the built-in models and existing credential remain available
- And the refreshed provider detail exposes the custom editing controls

#### Scenario: Reject an unavailable current import

- Given Pi has no current built-in provider or already has a custom override
- When the Provider toolbar is rendered or a stale request reaches main
- Then the action is disabled or rejected before any native write

### `FR-AGENT-097`: Semantic And Composable Agent Quotas

The Agent usage contract MUST describe each provider quota by typed scope,
period and value semantics rather than by a renderer-specific `window` or
`quota` chart kind. Provider adapters MUST normalize finite values to remaining
percentage and, when available, remaining/limit amounts. Unlimited and unknown
values MUST remain explicit and MUST NOT be dropped or fabricated as `0%`.

Overview and menu-bar quota surfaces MUST consume one shared presentation model
and semantic visualization selector. Finite 5-hour, daily and weekly windows
MUST use a compact ring regardless of whether the provider reports percentages
or absolute amounts. Monthly/billing-cycle/lifetime totals and provider-defined
quotas MUST use a horizontal remaining bar. Grouping, ordering, visible density
and expansion MUST derive from scope, period and metric cardinality rather than
the Agent id. This semantic rule supersedes the provider `window`/`quota`
mapping in `FR-AGENT-027`; its verified adapter and credential boundaries remain
in force.

#### Scenario: Compose short, weekly and monthly quotas

- Given an Agent reports account, model-group or feature quotas across 5-hour, weekly and monthly periods
- When the Overview renders the quota summary
- Then metrics are grouped by typed scope and ordered from shorter to longer periods
- And finite 5-hour, daily and weekly windows use compact rings that can compose side by side
- And absolute monthly or total quotas use horizontal bars with remaining amount and total

#### Scenario: Keep Antigravity baseline and overage credits separate

- Given Antigravity reports grouped five-hour and weekly baseline windows through `RetrieveUserQuotaSummary`
- And `GetUserStatus` also contains legacy or internal prompt-credit counters
- When PromptHub normalizes Antigravity usage
- Then only the grouped baseline windows become quota metrics
- And `GetUserStatus` contributes plan identity without fabricating an account total
- And AI credit overage balance remains absent until a separately verified provider field and contract are implemented

#### Scenario: Preserve Kimi weekly and rolling quota without fabricating the shared monthly total

- Given the current Kimi Code usage response reports weekly and rolling limits as `remaining` plus `limit`
- And the rolling window uses a proto-style time unit such as `300 TIME_UNIT_MINUTE`
- When PromptHub normalizes Kimi usage
- Then the weekly allowance and 5-hour rolling window remain visible with their provider reset times
- And legacy `used` plus `limit` responses remain compatible
- But the cross-product Kimi membership monthly total is not derived from the unverified `totalQuota` field or from local usage estimates

#### Scenario: Keep one value direction

- Given a provider reports used percent, used/limit, remaining fraction or remaining/limit
- When its adapter produces the shared usage contract
- Then main normalizes the value to remaining percent before IPC
- And ring arc, bar fill, numeric percentage, amount copy, warning tone and accessible label all describe remaining quota
- And no surface combines percent used with an amount described as remaining

#### Scenario: Keep provider provenance out of the primary quota surface

- Given every supported quota currently comes from a provider adapter
- When a successful quota summary renders
- Then the surface shows the plan, quota values, reset times and refresh action
- And it does not repeat a provider-reported provenance sentence
- And an in-flight refresh is conveyed by the refresh control without exposing cache implementation copy
- But stale state remains explicit when a failed refresh affects trust

#### Scenario: Bound a large model inventory

- Given a provider reports more than eight model-scoped quotas
- When the Overview first renders
- Then all account, model-group and feature metrics remain visible
- And only the four most constrained individual-model metrics render initially with an explicit expand action
- And expanding remains bounded to 64 sanitized metrics in an internal scroll region

#### Scenario: Preserve unlimited, unknown and empty states

- Given a provider reports an unlimited entitlement, a named quota without a trustworthy value, or an ok response with no metrics
- When either quota surface renders
- Then unlimited and unknown remain explicit non-progress states
- And an empty ok response shows that the provider did not report a quota
- And none of those states render a zero-length warning meter

#### Scenario: Load without fabricated quota values

- Given no cached quota snapshot exists for the selected Agent
- When the initial request is pending
- Then the surface shows neutral skeleton rows without percentages or Agent-specific fake periods
- When a cached successful snapshot exists
- Then its metrics remain in place during refresh and a failed refresh marks them stale instead of replacing them with an anonymous unavailable state

### `FR-AGENT-098`: Expanded Evidence-Backed Native Model Configuration

The shared Provider & Model workbench MUST support Claude Code, Codex,
Antigravity, Grok, Pi, OpenCode, Qoder and every Claw-family platform that has a
single evidence-backed native model target. Antigravity, Qoder, CoPaw, AutoClaw,
QClaw and Hermes MUST use independent adapters for their current native formats;
Claw family membership MUST remain presentation metadata and MUST NOT imply an
OpenClaw-compatible file contract.

Every adapter MUST expose one sanitized `AgentModelConfiguration`, update only
the native model selector, preserve credentials and unrelated fields, reject
malformed, oversized or symlinked files, detect concurrent modification, create
a private backup, write atomically, re-read the native source and roll back on
failure. Missing native files MAY be created only at a verified canonical path.

NanoClaw MUST remain unavailable in the platform-level Provider Profile until a
group target is selected explicitly. PromptHub MUST NOT mutate generated
container configuration or silently apply one group's model to another.

#### Scenario: Configure a newly supported global model target

- Given Antigravity, Qoder, AutoClaw, QClaw or Hermes has a valid native config
- When the user imports or activates a model-only Provider Profile
- Then PromptHub updates only that platform's native model selector
- And the refreshed shared workbench shows the selected model and sanitized provider metadata
- And literal credentials and unrelated native settings remain byte-equivalent in meaning

#### Scenario: Configure CoPaw's active Agent

- Given CoPaw's global config identifies one active Agent workspace
- And that workspace is contained beneath the CoPaw root
- When the user activates a model profile
- Then PromptHub updates that workspace's `active_model` provider/model pair
- And it does not read or return the separate provider secret store

#### Scenario: Refuse an ambiguous NanoClaw target

- Given NanoClaw stores model configuration per Agent Group
- When the platform-level Provider & Model capability is evaluated
- Then it remains planned and disabled
- And no group database row or materialized container file is changed

### `FR-AGENT-099`: Discoverable Provider Commands Without Horizontal Overflow

The shared Provider toolbar MUST render visible labels for current-configuration
import and PromptHub-source import while retaining icons, accessible names and
tooltips. The command area MAY grow vertically to fit localized labels but MUST
NOT widen the fixed sidebar or truncate the commands into icon-only controls.

Provider list rows MUST fit within the sidebar content box at every supported
width. The sidebar MUST permit vertical scrolling for large inventories and
MUST NOT expose horizontal scrolling caused by row width, margin, focus ring or
localized text.

#### Scenario: Use both import commands without guessing icons

- Given the generic or Pi Provider workbench is open
- When the toolbar renders
- Then both import commands show icon and localized text
- And keyboard and assistive-technology names remain available

#### Scenario: Keep the provider sidebar on one axis

- Given a native configuration row and provider profiles are present
- When the sidebar is narrower than the detail pane
- Then rows truncate internal metadata within their bounds
- And the sidebar scroll width does not exceed its client width

### `FR-AGENT-100`: Truthful Conversation Storage And Project Filters

Every native conversation row MUST expose its adapter-reported per-session
storage size when the adapter can calculate that value without attributing a
shared database to one conversation. Unknown sizes MUST remain explicit rather
than displaying the size of a shared store as if it belonged to one session.

The project filter MUST merge registered PromptHub projects with exact project
paths and labels reported by the loaded native sessions. Selecting a native
project option MUST filter by exact normalized path; labels alone MUST NOT merge
two different directories.

The visible destructive action MUST permanently delete native content only
through an adapter-owned operation. It MUST require a second confirmation and
MUST re-resolve the session in the main process. Adapters without a verified
session-scoped delete operation MUST NOT expose the destructive action, and no
implementation may delete an arbitrary renderer-provided `sourcePath`.

#### Scenario: Show Codex disk usage and native projects

- Given loaded Codex sessions report distinct working directories and rollout files
- When Conversation History renders
- Then every Codex row shows the exact current rollout-file byte size
- And the project selector lists each distinct working directory once
- And selecting one directory shows only sessions with that exact path

#### Scenario: Confirm and permanently delete a Codex session

- Given a Codex rollout still resolves inside the configured Codex sessions or archived-sessions root
- When the user chooses permanent delete and confirms the destructive dialog
- Then the main process re-resolves and removes that exact rollout file
- And PromptHub hard-deletes the corresponding local metadata row
- And the deleted session disappears from the loaded history without a rescan
- And canceling the dialog performs no IPC mutation

#### Scenario: Reject an unverified delete target

- Given a session comes from a shared database or an adapter without native delete support
- When its action menu renders or a crafted delete IPC request is sent
- Then no permanent-delete command is offered
- And the main process returns a stable unsupported error without changing metadata or native files

### `FR-AGENT-101`: Enter-Submitted Title And Project Search

Conversation History MUST keep the editable search draft separate from the
submitted query. Changing the input MUST NOT request, filter or reorder sessions.
Pressing Enter outside an active IME composition MUST submit the trimmed query;
submitting an empty query MUST restore the unfiltered session inventory.

The submitted query MUST match only the effective displayed title, native title,
project label or exact project path using case-insensitive literal containment.
Transcript text, note, tag, model, redacted preview and session id MUST NOT create
a match. Persistent-index and live-reader results MUST expose the same scope.

#### Scenario: Compose without searching

- Given Conversation History has loaded sessions
- When the user types several characters without pressing Enter
- Then no additional list request is sent
- And the existing list remains visible and unfiltered

#### Scenario: Submit a title or project query

- Given a session title or project label/path contains the query
- When the user presses Enter after composing the query
- Then PromptHub requests one submitted search and shows the matching session
- And loading more uses the same submitted query rather than the current draft

#### Scenario: Exclude body-only matches and clear the query

- Given a query exists only in transcript text, notes, tags, model metadata or a redacted preview
- When the user submits it
- Then that session is not returned as a search match
- When the user clears the input and presses Enter
- Then PromptHub restores the unfiltered inventory

### `FR-AGENT-102`: Conversation Ordering And Native Rename Priority

The second Conversation History selector MUST order the currently loaded
conversation inventory rather than filter it by PromptHub metadata status. It
MUST provide newest, oldest, largest and smallest ordering. Missing timestamps
or per-session sizes MUST sort after known values in either direction, and ties
MUST be deterministic. Newly loaded pages MUST be merged into the selected
order without mutating the adapter result.

The displayed title MUST prefer a non-empty PromptHub metadata override, then a
non-empty Agent-native title, then the adapter's first visible user-message
fallback, and finally the session id. Codex MUST read the latest valid
`thread_name` for each safe session id from its bounded, read-only native
`session_index.jsonl`; malformed, oversized or unsafe records MUST NOT replace
the transcript fallback. Removing the status selector MUST NOT make archived
metadata unreachable: native sessions remain visible and archived metadata is
represented as row state rather than list exclusion. If a returned native
session exists, the renderer MUST show it as a normal or archived session. The
conversation domain MUST NOT expose removed state or a Restore action.

#### Scenario: Sort loaded history without losing unknown sizes

- Given loaded sessions have different timestamps, known sizes and an unknown size
- When the user chooses largest, smallest, newest or oldest
- Then known values appear in the requested order
- And unknown values stay after known values with stable tie-breaking

#### Scenario: Prefer an Agent-native renamed title

- Given a Codex rollout starts with `<recommended_plugins>`
- And the latest safe Codex index record names that session `Plugin review`
- When Conversation History lists the rollout
- Then the native title is `Plugin review` rather than the first user message
- And a PromptHub title override still takes precedence when present

### `FR-AGENT-103`: Latest Transcript Navigation And Row Context Actions

Conversation History MUST provide an explicit latest-messages command whenever
the selected transcript has later loaded pages or an advancing native cursor.
Invoking it MUST follow cursor pages with a bounded number of reads and show the
newest page reached in that invocation. If more cursor data remains, the command
MUST stay available for another bounded invocation; duplicate or stalled cursors
MUST NOT create an empty page or unbounded loop.

Right-clicking a conversation row MUST select that row and open a contextual
menu at a viewport-contained position. The menu MUST reuse the same verified
actions as the selected-conversation toolbar: native continuation when
available, cross-Agent continuation when targets exist, Markdown and JSON
export, and adapter-gated permanent deletion. Permanent deletion MUST retain the
existing second confirmation. The menu and toolbar MUST NOT expose conversation
metadata editing. Escape, outside pointer input, window blur, resize or scroll
MUST close the contextual menu without changing native or PromptHub data.

#### Scenario: Jump from the oldest loaded page to the latest messages

- Given the selected transcript starts on page one and has advancing cursors
- When the user invokes latest messages
- Then PromptHub performs only a bounded number of cursor reads
- And shows the newest page reached without displaying an empty page

#### Scenario: Use row actions without an edit dialog

- Given a native session supports resume and verified permanent deletion
- When the user right-clicks its history row
- Then the row becomes selected and the menu offers continuation, both export formats and permanent deletion
- And no metadata-edit action is present
- And deletion still requires explicit confirmation

### `FR-AGENT-104`: Contained Transcript Tables And Agent-Owned Tool Messages

Markdown tables in user, assistant and tool transcript bodies MUST remain
inside the message bubble and transcript viewport. Wide tables MUST use a local
horizontal scroll region rather than increasing the bubble, transcript pane or
window scroll width. The Markdown root and each chat bubble MUST be allowed to
shrink within its flex row; raw transcript text and export content MUST remain
unchanged.

Tool calls and tool results are emitted by the Agent and MUST use the same
left-aligned Agent-message structure as assistant messages: Agent avatar,
bounded bubble and message body. A compact Tool role label MAY distinguish the
record inside that bubble. Tool messages MUST NOT render as centered system
notices. System/unknown events remain informational notices.

#### Scenario: Contain a wide table in a user message

- Given a user transcript entry contains a GFM table with long file paths
- When the message bubble renders in a narrow transcript pane
- Then the bubble stays within its row
- And the table scrolls horizontally inside that bubble
- And the transcript pane does not gain horizontal overflow

#### Scenario: Render a tool result as an Agent message

- Given the native transcript contains a Tool entry
- When Conversation History renders that entry
- Then it appears left-aligned with an Agent avatar and bounded message bubble
- And its Tool label remains visible inside the bubble
- And it is not styled as a centered system notice

### `FR-AGENT-105`: Native Session And Project Location Actions

The selected-conversation More menu and row context menu MUST expose two
distinct filesystem actions. **Show in folder** MUST locate the Agent-owned
native session file from the adapter-provided `sourcePath`; **Open project
folder** MUST open the effective registered or native `projectPath`. The More
menu MUST remain available independently of native-delete support. A missing
path MUST leave its corresponding action visible but disabled, and MUST NOT be
replaced by a guessed path.

Both actions MUST use the existing validated main-process shell path handler.
The renderer MUST NOT open, edit, delete or construct a parent path from the
native session file. A failed or inaccessible path MUST preserve the current
conversation and report the existing conversation-action failure state.

#### Scenario: Locate both native resources

- Given a conversation exposes a native session file and project directory
- When the user chooses Show in folder or Open project folder
- Then PromptHub sends the exact corresponding path through the safe shell handler
- And the session file is selected in the platform file manager while the project directory is opened

#### Scenario: Do not guess a missing source location

- Given a conversation has a project directory but no native source file path
- When the More or row context menu opens
- Then Show in folder is visible but disabled
- And Open project folder remains available

### `FR-AGENT-106`: Claude Visible Transcript And Project Identity

The Claude Code session adapter MUST expose only user-visible conversation
records. Native `user` and `assistant` messages MAY contribute visible entries;
Claude `tool_result` content MUST use the Tool role. Records marked `isMeta`,
non-message native record types, empty content and generated local-command
wrappers MUST NOT become transcript events or title fallbacks. A well-formed
ignored native record MUST NOT increment the detail parse-error count.

When a bounded Claude JSONL record supplies a safe absolute `cwd`, that exact
path MUST be the session project identity and its basename MUST be the displayed
project label. The encoded `projects/<key>/` directory name MAY be used only
when no valid native project path exists. Live list, optional local index,
project filter and native resume cwd MUST agree on this projection.

#### Scenario: Hide Claude internal records

- Given a Claude transcript contains meta command caveats, local-command system records, lifecycle records, visible user and assistant messages, and a tool result
- When Conversation History reads the transcript
- Then only the visible user, assistant and Tool entries are shown
- And the visible user message supplies the fallback title
- And the ignored valid records are not reported as parse errors

#### Scenario: Display the real Claude project

- Given Claude stores a session below an encoded project directory
- And the session reports `/workspace/newpaper-repair` as its safe absolute cwd
- When the live or indexed project selector is shown
- Then the option label is `newpaper-repair`
- And its identity and resume cwd remain `/workspace/newpaper-repair`
- And the encoded directory key is not displayed

### `FR-AGENT-107`: Gemini And Cursor Native Project Projection

For Gemini sessions, PromptHub MUST read at most 4 KiB from the regular,
non-symlink `.project_root` marker adjacent to the native `chats` directory.
A null-free absolute marker value MUST become the exact project identity,
display basename and native resume cwd in both live and indexed metadata. A
missing, malformed, oversized or unsafe marker MUST fall back to the cache key
without guessing a path.

Gemini `info` and unknown native message types MUST be treated as valid hidden
records rather than transcript Events or parse failures. Native `user` and
`gemini` text remains visible as User and Assistant; a user record containing a
function response and no visible user text MUST project as a Tool result.
Gemini's non-empty bounded native `summary` MUST take title priority over the
first visible User fallback. Malformed document syntax and non-object message
rows remain parse errors.

For Cursor sessions, PromptHub MUST NOT display an encoded project key when it
can uniquely resolve that key to an existing directory beneath the configured
home. Resolution MUST walk only actual non-symlink directory components, MUST
be bounded, and MUST reject ambiguous, external, missing or oversized trees.
A unique match MUST supply the exact project path, its basename label and the
resume cwd. For an unresolved under-home key, PromptHub MAY remove only the
uniquely verified existing directory prefix and display the remaining literal
tail; it MUST retain a null path and MUST NOT split the tail into a guessed path.

#### Scenario: Project a Gemini project marker and Tool result

- Given a Gemini cache key `project-hash` has a safe `.project_root` containing `/workspace/PromptHub`
- And its transcript contains `info`, User, Gemini and function-response records
- When live or indexed History is loaded
- Then the project is labeled `PromptHub` with the exact project path and resume cwd
- And only User, Assistant and Tool entries are visible
- And the valid hidden `info` row does not increment parse errors

#### Scenario: Resolve a unique Cursor encoded project

- Given Cursor stores a transcript below the encoded key for an existing project under the configured home
- And exactly one non-symlink directory path matches that key
- When Conversation History lists the session
- Then the project label is the real directory basename
- And project filtering and resume use the exact resolved path

#### Scenario: Reject an ambiguous Cursor key

- Given two existing directory paths under the configured home encode to the same Cursor key
- When Conversation History lists the session
- Then PromptHub does not choose either path
- And it displays the unresolved literal tail with a null project path

### `FR-AGENT-108`: Grok Build Subscription, Weekly Usage, And Session Size

PromptHub MUST project Grok Build's official account subscription and shared
weekly usage through the same Agent usage contract used by the other verified
adapters. It MUST read only an official `auth.x.ai` credential from the bounded
native `auth.json`, query the official Grok Build user and billing endpoints
with a main-process-only bearer token, and MUST NOT expose credentials or
account identity to the renderer, logs, tests, or stored quota cache.

The native `subscriptionTier` MUST become the plan badge. The billing current
period MUST become one account-scoped weekly metric using
`creditUsagePercent`, the provider's period end as reset time, and the shared
week-ring presentation. Missing, expired, rejected, malformed and unavailable
responses MUST use the existing explicit usage states rather than guessed
values. The existing 60-second in-memory cache and force-refresh behavior MUST
apply, with at most two bounded provider requests per refresh.

Each Grok history row MUST report the exact contained
`chat_history.jsonl` real path and its byte size. PromptHub MUST NOT use the
session directory, summary file, lock files, event logs or other runtime
artifacts as the displayed conversation size.

#### Scenario: Show Grok membership and weekly usage

- Given Grok Build has a current official OAuth credential
- And the user endpoint reports `XPremium`
- And billing reports a seven-day current period with 15 percent used
- When the Agent Overview loads usage
- Then the plan badge reads `X Premium`
- And the weekly ring shows 85 percent remaining with the provider reset time
- And no credential or account identity reaches the renderer

#### Scenario: Show exact Grok conversation size

- Given a Grok session owns a contained `chat_history.jsonl`
- When Conversation History lists that session
- Then the row size equals that file's exact byte length
- And “在文件夹中显示” targets that exact real file

### `FR-AGENT-109`: Missing Agent Rule File Creation Gate

The Agent-scoped `Rules` tab MUST distinguish a declared rule file that does
not exist from a file that exists with empty content. A missing file MUST show
a centered creation prompt with the Agent-declared file name and resolved
target path. PromptHub MUST NOT create or open an empty editor for that target
until the user explicitly confirms creation.

The file name, rule id, platform identity and target path MUST come from the
shared rule descriptor inventory. The renderer MUST NOT assume `AGENTS.md`,
derive a replacement path or introduce an Agent-specific write path. Existing
empty files MUST continue directly into the shared Rules editor. Descriptors
that cannot be resolved after one bounded scan MUST retain the existing scoped
retry state.

#### Scenario: The declared file is missing

- Given an installed Agent resolves to a rule descriptor with `exists: false`
- When the user opens the Agent's `Rules` tab
- Then the page shows the descriptor's exact file name and target path
- And no rule read or write occurs before confirmation
- When the user confirms creation
- Then the existing Rules save contract creates an empty file for that rule id
- And the shared Rules editor opens the newly created empty file

#### Scenario: The declared file already exists but is empty

- Given an Agent rule descriptor has `exists: true`
- And reading the file returns empty content
- When the user opens the Agent's `Rules` tab
- Then the shared Rules editor opens with an empty draft
- And the creation prompt is not shown

#### Scenario: Agents use different canonical rule names

- Given two installed Agents declare different rule files such as `GEMINI.md`
  and `RULES.md`
- When either missing target is shown or created
- Then the prompt and write operation use that descriptor's own name, path and
  rule id
- And neither flow is rewritten to `AGENTS.md`

### `FR-AGENT-110`: Truthful Footprint And Permanent Delete For Every Listed Session

Every native conversation returned by a supported history adapter MUST expose a
truthful non-negative footprint and an adapter-owned permanent-delete action.
For file- or directory-backed sessions, the footprint MUST cover the native
session payload removed by that action. For shared database stores, it MUST be
the logical byte footprint of the matching session rows and MUST NOT be the
size of the whole database. A session MUST NOT be listed as deletable until the
main process can re-resolve its native identity without using a
renderer-provided path.

Permanent delete MUST require the existing second confirmation, re-resolve the
session in the main process, remove the native session payload or native rows,
and then remove only the matching PromptHub metadata. Multi-file sessions MUST
delete their known transcript and metadata companions as one adapter-owned
operation. Missing, ambiguous, symlinked, escaped or changed targets MUST fail
closed without deleting an unrelated path. This requirement supersedes the
earlier `FR-AGENT-100` allowance to leave listed adapters without deletion; a
supported adapter that cannot yet prove these semantics MUST not claim the
history capability as complete.

#### Scenario: File-backed session reports and deletes its native footprint

- Given a listed native session consists of one or more contained files
- When PromptHub loads its metadata and the user confirms permanent delete
- Then the row shows the summed byte footprint of the files owned by that session
- And the main process re-resolves and removes those exact native files
- And the row disappears without accepting a renderer-supplied deletion path

#### Scenario: Shared-database session deletes only its rows

- Given two sessions share one native SQLite database
- When the user permanently deletes one session
- Then its displayed size is its logical row payload rather than the database file size
- And the adapter deletes the matching child rows and session row transactionally
- And the other session and database remain intact

#### Scenario: Reject a changed native target

- Given a listed target is replaced by a symlink, escapes its configured root, or no longer resolves to the same native session
- When permanent delete is invoked
- Then the operation fails with a stable error
- And no native file, directory, database row or PromptHub metadata is removed

### `FR-AGENT-111`: Pi Compatible MCP Workspace Entry

The installed `pi` Agent MUST expose the MCP tab as a partial compatibility
capability. Its Agent summary MUST derive the primary user target from
`<PI_CODING_AGENT_DIR>/mcp.json`, defaulting to `~/.pi/agent/mcp.json`, while
the owning MCP domain continues to expose the existing Pi user, shared-adapter,
and project target presets independently.

PromptHub MUST describe this as compatible configuration management rather
than native MCP runtime support. It MUST NOT merge Pi with Oh My Pi, install an
MCP extension into Pi, or claim that the base Pi executable loads these files
without an adapter. A missing target MUST still leave Add MCP available through
the owning MCP workflow.

#### Scenario: Open Pi MCP management

- Given Pi is installed and its primary `mcp.json` does not exist
- When the user opens the Pi Agent workspace
- Then the MCP tab is enabled as a partial capability
- And its primary path resolves to the Pi Agent root rather than the Oh My Pi root
- When the user opens MCP
- Then Add MCP remains available and the existing Pi-compatible target presets are used

### `FR-AGENT-112`: System-Level History Acceleration And First-Page Navigation

PromptHub MUST own local session metadata indexing as one application setting,
enabled by default for a new or previously unset preference. The setting MUST
be shown in App Settings rather than inside an individual Agent History panel.
When enabled, opening a supported history MUST reconcile that source to enabled
and run one bounded refresh automatically. When disabled, supported histories
MUST use their live-reader fallback and MUST NOT start an index refresh.

The History panel MUST NOT expose a per-Agent indexing toggle, manual refresh
button or indexing implementation copy. Transcript pagination MUST place a
first-page command before the previous-page command, mirroring the latest
messages command on the right. The first-page command MUST be disabled on page
one and MUST return to the already loaded first page without native I/O.

#### Scenario: Apply the default application preference

- Given the user has never changed history acceleration
- When a supported Agent History opens
- Then the application preference is enabled
- And PromptHub enables and refreshes that source automatically
- And no indexing control appears inside History

#### Scenario: Disable history acceleration in App Settings

- Given the user turns off history acceleration in App Settings
- When a supported Agent History opens
- Then PromptHub disables the source and uses bounded live reads
- And no metadata refresh starts

#### Scenario: Return directly to the first message page

- Given the reader is on a later transcript page
- When the leftmost first-page button is activated
- Then page one is displayed from already loaded entries
- And the button becomes disabled
- And no additional native transcript page is read

### `FR-AGENT-113`: Verified Project Rules And Expanded MCP Targets

PromptHub MUST expose Cursor Rules through Cursor's documented project rule
file rather than inventing a user-global file. A registered project MUST be
able to manage `.cursor/rules/prompthub.mdc` independently from that project's
`AGENTS.md`; a missing target MUST require explicit creation and an existing
empty target MUST open normally.

Qoder MUST expose its documented project-root `AGENTS.md` compatibility through
the same project Rules workflow. If that target is already registered for
another compatible Agent, Qoder MUST reuse it rather than create a duplicate
managed record for the same path.

PromptHub MUST expose verified MCP targets for OpenClaw, Qoder, Grok Build and
Antigravity.
OpenClaw MUST preserve unrelated `openclaw.json` data while managing
`mcp.servers`; Qoder MUST support its user and documented project JSON targets;
Grok MUST preserve unrelated TOML while writing `mcp_servers` with Grok's
`headers` key; Antigravity MUST support its global and workspace JSON targets
and write remote endpoints as `serverUrl`. Reasonix MAY expose its documented
project `.mcp.json` compatibility, but its modern global `[[plugins]]` TOML
remains native-owned until a lossless target adapter exists. Unsupported
target-specific fields and transports MUST remain owned by the native Agent
rather than being fabricated or discarded.

#### Scenario: Manage a Cursor project rule

- Given Cursor is installed and a PromptHub project is registered
- When the user opens Cursor Rules and confirms creation
- Then PromptHub manages `.cursor/rules/prompthub.mdc` for that project
- And a sibling `AGENTS.md` registration remains independent

#### Scenario: Apply MCP without damaging native settings

- Given an OpenClaw, Qoder, Grok or Antigravity configuration has unrelated native fields
- When PromptHub applies one supported MCP server
- Then the supported entry is merged at the documented location
- And unrelated fields and unmanaged servers remain intact

#### Scenario: Reuse Qoder AGENTS.md compatibility

- Given a registered project already manages its root `AGENTS.md`
- When the user opens Qoder Rules for that project
- Then the existing project rule opens in the shared editor
- And PromptHub does not create a duplicate project rule record

### `FR-AGENT-114`: Reuse Session Index Without Reblocking History

PromptHub MUST reuse a completed supported-source metadata index while it is
fresh and MUST NOT launch a full refresh on every History mount. Initial source
enablement and stale metadata MAY start one background refresh after the first
bounded session list settles. Reopening or switching back to the same Agent
while that refresh is running MUST join the existing refresh rather than start
another scan.

Leaving History MUST NOT cancel an application-owned automatic refresh. Window
destruction MUST still cancel it through the existing IPC sender lifecycle.
The panel MUST keep an already loaded session list visible while a refresh
revision is applied; only an Agent with no completed initial list may use the
blocking loading state.

#### Scenario: Reopen a freshly indexed History

- Given a supported Agent has a successful index refreshed within the freshness window
- When the user leaves and reopens its History
- Then PromptHub lists cached metadata without starting another native scan
- And the History panel does not return to a long blocking loading state

#### Scenario: Leave while initial cache warmup runs

- Given a supported Agent has no completed index and its first live list is visible
- When automatic cache warmup starts and the user opens another Agent
- Then the warmup continues as one application-owned request
- And reopening the original Agent joins that request instead of restarting it

#### Scenario: Apply a completed background refresh

- Given History already displays cached or live session rows
- When a stale background refresh completes
- Then PromptHub reloads the bounded metadata page without hiding the existing rows

### `FR-AGENT-115`: Install Agent Assets In Context

The Add action in an Agent's MCP or Plugin workspace MUST keep the user in the
current Agent workspace. It MUST open an in-context selection dialog, matching
the existing Skill installation workflow, rather than navigating to the
standalone MCP or Plugin manager.

The MCP dialog MUST select one or more enabled entries from My MCP and apply
them to the selected Agent's bounded target preset. Entries already present on
that target MUST remain visible but unavailable for duplicate selection. The
Plugin dialog MUST select one or more entries from My Plugins, choose copy or
symlink installation, and distribute them only to enabled Plugin targets owned
by the selected Agent. Successful installation MUST refresh the current asset
inventory without changing the active app module or Agent tab.

#### Scenario: Add MCP without leaving the Agent

- Given an Agent has a writable MCP target and My MCP contains an enabled server
- When the user selects Add MCP, chooses the server and confirms
- Then PromptHub applies the server to that Agent target
- And the MCP dialog closes after the current Agent inventory refreshes
- And the standalone MCP manager is not opened

#### Scenario: Add Plugins without leaving the Agent

- Given an Agent has an enabled Plugin target and My Plugins contains packages
- When the user selects Add Plugin, chooses packages and an install mode, then confirms
- Then PromptHub distributes the packages only to the selected Agent targets
- And the Plugin dialog closes after the current Agent inventory refreshes
- And the standalone Plugin manager is not opened

### `FR-AGENT-116`: Provider Terminology And Read-Only Native Configuration

The Agent Provider & Model workspace MUST call user-managed entries providers
in all user-visible labels, dialogs, empty states and activation copy. It MUST
NOT call them profiles or configuration profiles. Internal compatibility type,
database and IPC names MAY retain their existing Provider Profile identifiers.

The workspace MUST NOT expose Import current configuration, Create editable
profile or equivalent native-to-managed conversion commands. This applies to
the shared Provider workspace and Pi's built-in provider catalog. The current
native configuration remains visible as a read-only detected state, while Add
provider and Import from PromptHub remain available.

#### Scenario: Open an Agent with detected native configuration

- Given PromptHub detects an Agent-owned native provider configuration
- When the user opens Provider & Model
- Then the native configuration is shown read-only
- And no command imports or converts that native configuration
- And the user may still add a provider or restore official configuration when supported

### `FR-AGENT-117`: Clear Plugin Empty States And Network-Aware Market Downloads

The Agent Plugin workspace MUST describe empty inventory without exposing
target or distribution implementation terms. Add Plugin MUST open its
in-context dialog even when My Plugins or writable targets are empty. Official
market Git downloads MUST follow the effective proxy mode from Network
Settings and MUST NOT bypass that mode with an installer-specific fallback.
Download failures MUST be presented as a concise localized action that points
back to Network Settings rather than raw IPC or Git diagnostics. Every Plugin
install or import failure MUST state what failed, the likely failure category,
and the next action. Source access, package validation, duplicate installation,
local storage, Git availability, network/proxy and unexpected failures MUST use
one shared renderer policy across market, local/source import, Agent deployment
and batch-install surfaces. Unexpected details MUST be bounded and redact source
URLs, local paths, IPC prefixes and internal error wrappers.

#### Scenario: No Plugins are available

- Given the current Agent has no My Plugins and no discovered Plugin packages
- When the Plugin tab and Add Plugin dialog render
- Then the workspace says only that no Plugins are available
- And clicking Add Plugin opens the selection dialog without a target-error toast
- And the dialog does not ask the user to understand targets or distribution

#### Scenario: Plugins exist but the Agent cannot install them

- Given My Plugins contains selectable packages
- And the current Agent has no enabled Plugin destination
- When Add Plugin opens
- Then the dialog states that this Agent does not support Plugin installation
- And package selection and confirmation remain disabled

#### Scenario: Plugin download follows Network Settings

- Given Network Settings selects system proxy, direct connection or a manual proxy
- When Git downloads an official-market Plugin
- Then the child process inherits the environment produced by that selected mode
- And direct mode clears inherited proxy variables
- And system mode restores the proxy environment captured at application startup
- And manual mode applies only the configured proxy and bypass rules
- And the Plugin installer does not silently switch modes or retry without proxy
- And a proxy failure points the user to Network Settings without raw IPC,
  temporary paths, command output or repository internals

#### Scenario: Plugin failures explain the situation

- Given a market, local, source, Agent deployment or batch Plugin operation fails
- When PromptHub reports the failure
- Then the message identifies the failure category and a corrective next step
- And batch installation includes its aggregate counts and first explained failure
- And a completed Agent deployment whose inventory refresh fails states that the
  operation completed and asks the user to refresh before retrying installation
- And source URLs, local paths, IPC prefixes, command output and internal wrappers
  are not shown

#### Scenario: Manage providers without profile terminology

- Given the user opens a provider list, form, activation review or delete confirmation
- When PromptHub renders user-facing copy
- Then the managed entry is called a provider in the active locale
- And internal Provider Profile identifiers are not shown as product terminology

### `FR-AGENT-118`: Visual Provider Import And Agent-Aware Protocol Choice

The PromptHub provider import dialog MUST show the existing themed provider
icon for every source row and the inferred model-family icon for every model
choice, with the existing Custom/Other fallback when no dedicated asset is
available. It MUST use a bounded custom selector rather than a native text-only
model menu.

The dialog MUST expose a protocol selector whose options are derived from both
the source provider API and the destination Agent's writable protocol
capabilities. It MUST preselect the direct/recommended mapping and include the
selected protocol in the import request. The main process MUST reject a stale,
missing or destination-incompatible protocol instead of silently choosing a
different one.

#### Scenario: Import an OpenAI-compatible provider into Codex

- Given PromptHub has an OpenAI-compatible provider with multiple chat models
- When the user opens Import from PromptHub for Codex
- Then the provider and each model display their matching local icons
- And the protocol selector offers only Codex-compatible OpenAI Chat and OpenAI Responses choices
- And OpenAI Chat is selected as the direct mapping for an OpenAI-protocol source
- And importing persists the explicitly selected protocol

#### Scenario: Import the same provider into Pi

- Given the same PromptHub provider is selected for Pi
- When the import dialog renders
- Then protocol choices use Pi's native API names and capabilities
- And a protocol that was valid for Codex but is not a Pi API value cannot be submitted

### `FR-AGENT-119`: Provider Creation And Import Entry Placement

The Provider & Model sidebar MUST place Import from PromptHub and Add custom
provider together in the top action area, and both commands MUST use the add
icon. The bottom of the sidebar MUST NOT retain a duplicate add command.

Right-clicking anywhere inside the provider list MUST expose the same available
commands. Desktop Agents expose both import and custom creation; runtimes that
cannot import from the local PromptHub model service expose only custom
creation. The context menu MUST reuse the same workflows and busy state as the
visible toolbar commands.

#### Scenario: Open provider actions from the list

- Given the user is viewing a desktop Agent's provider list
- When the user right-clicks a provider row or empty list space
- Then the menu offers Import from PromptHub and Add custom provider
- And either command opens the same dialog as its matching top action
- And no add-provider action remains fixed to the bottom of the sidebar

### `FR-AGENT-121`: Layered Inline Provider Editor

The inline Add/Edit provider workspace MUST visually distinguish the page
background, action header, form surface, sections and controls. The form MUST
use one white/card-colored surface with section dividers rather than rendering
every section as an independent nested card. Text inputs, secret inputs and
custom dropdown triggers MUST share the same outlined control treatment and
disabled state; the provider editor MUST NOT fall back to an operating-system
native select menu. Every field group MUST use a single full-width column in
the right pane; it MUST NOT leave a half-width control beside empty space. Form
dropdowns MUST match their trigger width and use a restrained border, radius,
shadow and selected state rather than a floating oversized menu treatment.

Field labels, examples and placeholders MUST follow the corresponding
CC Switch provider concepts where PromptHub already owns the same writable
field: provider name, provider identifier, endpoint, model identifier, context
size and API key. Examples MUST be specific to the destination Agent where the
adapter has a known convention. This visual/content alignment MUST NOT invent
new stored website, notes, icon, proxy or request-conversion fields.

#### Scenario: Add a custom provider in the right pane

- Given the user opens Add custom provider from Provider & Model
- When the inline editor renders
- Then the right pane has a muted page background and a distinct action header
- And all form sections sit inside one bordered white form surface
- And section headings, dividers and outlined controls create a visible hierarchy
- And every input and dropdown trigger spans the available form width
- And every dropdown opens a themed PromptHub listbox rather than a native menu
- And the listbox aligns to its trigger without an oversized radius or shadow
- And blank fields show actionable Agent-specific examples for endpoint, model and credentials
- And the editor does not create a stack of decorative cards inside the form

### `FR-AGENT-122`: Claude Code Native Model Routes

The custom-provider editor for Claude Code MUST expose the model routes that
Claude Code natively supports: the required primary model and optional Sonnet,
Opus, Haiku and subagent models. These values MUST be stored as typed model
mappings, included in activation planning and verification, and written to the
matching Claude Code environment keys without exposing credentials.

Importing the current Claude Code configuration MUST recover every supported
route. Activating a profile MUST remove stale PromptHub-managed route values
that are omitted by the selected profile while preserving unrelated native
settings. Unknown routes, duplicate routes, parameters and invalid model ids
MUST block activation.

The editor MUST NOT add unsupported Fable, proxy, request-rewrite, website,
icon or promotional metadata fields. Draft-time endpoint model discovery MUST
not reuse the unrestricted renderer HTTP path or move write-only credentials
out of the main process; it remains separately gated until a bounded main-only
discovery contract exists.

#### Scenario: Configure Claude role models

- Given the user adds or edits a Claude Code custom provider
- When the model section renders
- Then the primary, Sonnet, Opus, Haiku and subagent model fields are available
- And blank optional role fields are omitted from the saved model mappings
- And activation writes each supplied route to its documented Claude Code key
- And a later profile that omits a route removes that stale managed value
- And unrelated settings and environment values remain unchanged

### `FR-AGENT-124`: Codex Native Model Runtime Options

The Codex custom-provider editor MUST expose the optional model reasoning effort
and context window values that Codex currently documents in `config.toml`.
Reasoning effort MUST accept only `minimal`, `low`, `medium`, `high` or `xhigh`
and MUST be available only for the Responses path or the native OpenAI path.
Context window MUST be a positive bounded integer. Both values MUST travel with
the primary model mapping so profile import, activation, verification and later
profile switching use one source of truth.

Importing native Codex configuration MUST recover valid values. Activating a
profile MUST write supplied values and remove stale PromptHub-managed values
when the selected profile omits them, while preserving unrelated TOML comments,
tables and settings. Invalid, unknown or misplaced mapping parameters MUST block
activation.

The editor MUST NOT copy CC Switch's legacy `disable_response_storage` field,
global `goals` feature toggle, proxy conversion or promotional metadata into the
provider profile. OpenAI-auth reuse and command-backed authentication remain
separate security-sensitive contracts rather than cosmetic form toggles.

#### Scenario: Configure Codex model runtime options

- Given the user adds or edits a Codex provider
- When the model section renders
- Then optional reasoning effort and context window controls are available
- And blank values preserve the Codex model defaults
- And saved values are stored on the primary model mapping
- And activation writes `model_reasoning_effort` and `model_context_window`
- And selecting a profile without either value removes the stale managed keys
- And unrelated `config.toml` content remains unchanged

### `FR-AGENT-123`: Provider List Activation And Native Provider Testing

The Provider & Model sidebar MUST expose activation as a compact switch on
every managed provider row. The provider verified against the Agent's current
native state MUST show a checked, non-destructive switch; selecting an inactive
switch MUST enter the existing review, atomic apply, verification and rollback
workflow. The detail pane MUST NOT retain a second activation command.

The read-only current native provider, including an official platform-managed
provider, MUST expose the same connection and explicit model-test surfaces as a
stored provider. Testing MUST derive an ephemeral sanitized target from the
Agent's current native configuration. It MUST NOT create a stored provider,
persist credentials, activate a provider or write the Agent configuration.
Platform-native subscription or OAuth transports that cannot be probed directly
MUST return a truthful unsupported result rather than pretending that a remote
connection succeeded.

Codex's official OpenAI transport is probeable through the installed Codex CLI.
Its connection check MUST use the CLI's native login-status command against the
selected Codex root without sending a model request. Its explicit model test
MUST use an ephemeral, user-config-free, rule-free, read-only `codex exec` run
with the selected official model. The probe MUST NOT persist a session, expose
authentication output or mutate `config.toml`; cancellation and bounded timeout
failures MUST remain typed and redacted.

#### Scenario: Activate another provider from the list

- Given one provider is verified as current and another provider is inactive
- When the user selects the inactive provider's switch
- Then PromptHub opens the existing activation review for that provider
- And only the current provider's switch remains checked until verification succeeds
- And no duplicate activation button appears in the detail pane

#### Scenario: Test the current official provider

- Given an Agent has a detected official platform-managed native provider
- When the user runs connection or model testing from its detail pane
- Then PromptHub tests an ephemeral projection of that current provider
- And no Provider Profile row, secret reference or Agent file is created or changed
- And an official Codex connection check validates the CLI login without consuming model quota
- And an official Codex model test uses an isolated ephemeral request only after confirmation
- And an unprobeable native transport is reported as unsupported

### `FR-AGENT-125`: Codex Official Account Snapshot Switching

For Codex's built-in OpenAI provider, PromptHub MUST let the user save the
current official login, import another complete `auth.json` as a write-only
account snapshot, list sanitized account summaries and switch the active
account by replacing the single native `~/.codex/auth.json`. PromptHub MUST NOT
append an account array or otherwise change Codex's native authentication
schema.

Account snapshots MUST be encrypted at rest in a main-process-only PromptHub
store. The renderer may receive only a user label, masked account identifier,
timestamps and active state. Switching MUST preserve an unsaved current login,
write the selected snapshot atomically with owner-only permissions, re-read and
verify it, and restore the exact previous file on failure. It MUST NOT modify
`config.toml`, Provider Profiles, models, MCP, sessions or unrelated Codex
state. An active snapshot MUST NOT be deletable.

#### Scenario: Switch between saved official accounts

- Given the current official Codex login and another valid saved account
- When the user switches to the saved account
- Then the current login is retained as an encrypted snapshot if necessary
- And the selected snapshot replaces `~/.codex/auth.json` atomically
- And the replacement is re-read and verified before success is reported
- And `config.toml` and all other Codex files remain unchanged

#### Scenario: Reject invalid or unsafe authentication input

- Given malformed JSON, an oversized payload or a payload without an official access token
- When the user tries to add an account
- Then no account metadata, ciphertext or Codex file is changed
- And no token or raw authentication JSON appears in the returned error

### `FR-AGENT-126`: DeepSeek Harness Profile Plugin Management

PromptHub MUST register DeepSeek Harness as a distinct managed Agent rooted at
`$DSH_HOME` or the platform default `~/.dsh`. Its Agent workspace MUST follow
the product's profile-and-bundle model instead of projecting separate Skills,
MCP, Rules, or generic directory-plugin tabs. The visible management surface
MUST be Plugins, with a custom profile selector and a two-pane installed-plugin
inventory/detail view. The shared Agent list and header MUST use the upstream
product title `DeepSeek Harness` and its official fish mark in both light and
dark themes rather than reusing the generic DeepSeek provider logo.

PromptHub MUST read each bounded `<dsh-root>/profiles/<name>/package.json` as
the profile source of truth. Ordered `dsh.profile.bundles`, direct dependencies,
installed package metadata, `dsh.bundle.patch`, client declarations, and the
presence of lifecycle scripts MAY be projected as sanitized metadata. Package
script bodies, credentials, arbitrary package files, generated runtime state,
and composed conversation content MUST NOT enter renderer state, backup, or
sync.

Install, update, and uninstall MUST execute only through the installed official
`dsh plugin --profile <name> ...` command without a shell. Package/profile names,
GitHub HTTPS sources, operation, timeout, output size, and concurrency MUST be
bounded in the main process. Installation MUST require an explicit risk
acknowledgement because pnpm packages can execute lifecycle or prepare scripts.
Built-in profile bundles that are not direct profile dependencies MUST remain
read-only. A failed command MUST return a typed, redacted result and MUST NOT be
reported as a successful inventory mutation.

#### Scenario: Inspect a DeepSeek Harness profile

- Given DeepSeek Harness has one or more profiles
- When the user opens its Plugins tab and selects a profile
- Then the Agent list and header identify it as DeepSeek Harness with the official theme-aware fish mark
- Then PromptHub shows the ordered bundle/dependency inventory and selected plugin details
- And enabled means the package appears in `dsh.profile.bundles`
- And install-script risk is shown without returning script bodies
- And Skills, MCP, Rules, Appearance, Provider, Config Files, and Sessions are not presented as independently supported Harness domains

#### Scenario: Install a profile plugin safely

- Given the official `dsh` CLI is installed
- When the user enters a valid registry or GitHub HTTPS package source, selects or names a profile, acknowledges lifecycle-script risk, and confirms
- Then PromptHub runs `dsh plugin --profile <profile> add <source>` without a shell
- And the profile is initialized by the official CLI when it does not yet exist
- And the selected profile is re-read only after the command succeeds
- And malformed sources, missing acknowledgement, output overflow, timeout, or command failure return a redacted failure without a false success state

#### Scenario: Update or remove a direct plugin dependency

- Given a selected package is a direct dependency of the profile
- When the user confirms update or permanent removal
- Then PromptHub delegates to the matching official `dsh plugin` operation and refreshes the profile
- And a shipped bundle that is not a direct dependency cannot be updated or removed from PromptHub

### `FR-AGENT-127`: Registry-Aware Agent Order Upgrades

PromptHub MUST treat a saved Agent display order as a preference over the
current platform registry rather than as a frozen registry snapshot. When a
new built-in Agent is registered after a user has saved an order, Agent
Management MUST merge the new entry beside its product-default neighbors while
preserving the user's existing relative order. The new Agent MUST use the same
shared title, icon, root, enablement, and ordering metadata as the Agent
workspace.

#### Scenario: DeepSeek Harness is added after the Agent order was saved

- Given a saved Agent order contains Codex and later built-in platforms but not DeepSeek Harness
- When Agent Management loads the current platform registry
- Then DeepSeek Harness appears immediately after Codex
- And its row uses the official DeepSeek Harness title and theme-aware fish mark
- And the relative order of the user's previously saved Agent entries is unchanged

### `FR-AGENT-128`: File-Authoritative Agent Skill Inventory

The direct Agent Skills workspace MUST scan the resolved native Skill directory
when the current renderer session has no completed result. Persisted scan rows
MUST NOT be treated as durable inventory across application restarts. Until the
first scan completes, the workspace MUST show loading rather than a zero count;
a failed scan MUST remain distinguishable from a successful empty directory.

#### Scenario: Open Codex Skills directly after restart

- Given the native Codex Skill directory contains valid Skill packages
- And a prior renderer session cached an empty scan result
- When the user restarts PromptHub and opens Codex Skills directly
- Then PromptHub discards the persisted derived scan result
- And performs one bounded scan of the current Codex Skill directory
- And renders the discovered Skill packages without requiring manual refresh

### `FR-AGENT-129`: Truthful Bounded Agent Asset Summaries

The Agent Overview MUST hydrate supported Skills, MCP, Rules, and Plugins
summaries from each owning domain through bounded local summary reads. It MUST
distinguish unrequested, initial loading, successful empty, ready, refreshing,
stale, and initial failure states, and MUST NOT present an unknown or failed
inventory as zero. Summary hydration MUST use a concurrency ceiling of two and
MUST NOT load remote markets, run MCP health checks, read Rules bodies, load
full Plugin or MCP libraries, perform cross-domain validation, start a watcher,
or poll.

#### Scenario: Open Overview with a cold renderer cache

- Given Codex has native Skills, MCP servers, Rules, and Plugins
- And the renderer stores have no current-session summary
- When the user opens Codex Overview
- Then each supported cell first shows a non-numeric loading state
- And PromptHub reads only the four domain-owned summary sources
- And each successful cell displays the observed count
- And no more than two domain summary hydrators run concurrently

#### Scenario: Initial summary load fails

- Given an Agent asset source cannot be read and no prior summary exists
- When its summary loader fails
- Then Overview shows a load failure instead of zero
- And the direct asset workspace shows a failure state with Retry
- And it does not simultaneously show the successful-empty message

#### Scenario: Refresh fails after a successful read

- Given a domain has a successful cached summary
- When a forced refresh fails
- Then the last successful rows and count remain visible
- And the surface reports that refresh failed and cached data is shown

#### Scenario: A declared Rules path is absent

- Given a Rules descriptor is known but its native file does not exist
- When Overview projects the Rules summary
- Then the descriptor is not counted as an installed Rule
- And the direct Rules workspace may still offer its existing create action

### `FR-AGENT-130`: Layered Native Config Editor Surfaces

The Agent Config Files workspace MUST distinguish the application shell, file
navigator, workspace title bar, editor toolbar, editing canvas, gutter, and
status bar with the existing semantic surface tokens. In the light theme, the
title bar and primary editing canvas MUST use the card surface so they remain
visibly distinct from the gray application background and secondary file tree.
The implementation MUST NOT hardcode white or break the paired dark-theme
surface hierarchy.

The primary canvas treatment MUST be owned by the shared file editor and code
editor rather than by a Codex-only selector. It MUST NOT change file discovery,
selection, editing, save, allowlist, or native file-manager behavior.

#### Scenario: Open a native config file in the light theme

- Given a detected Agent exposes one or more verified native config files
- When the user opens Config Files and selects a text file
- Then the title bar and main editor canvas use the semantic card surface
- And the file tree remains a quieter secondary surface separated by a divider
- And the code gutter remains subtly distinct from the editing canvas
- And no raw light-only color overrides the dark-theme token pairing

### `FR-AGENT-137`: Doubao Work Uses Its Native User Skill Directory

PromptHub MUST register Doubao Work as a built-in Agent and, on macOS, resolve
its root to `~/Library/Application Support/Doubao/Default/.doubao/agent_mode/workspace`.
Skill discovery and distribution MUST use only the `.user_skills` child. The
sibling `.skills` directory is product-owned and MUST NOT be used as an install,
update, or removal target.

Unverified Provider, MCP, Rules, Plugins, Config Files, Sessions, Usage, and
maintenance contracts MUST remain planned or unavailable. PromptHub MUST NOT
infer those capabilities from the presence of Doubao runtime files.

#### Scenario: Detect an initialized macOS Doubao Work installation

- Given the verified Doubao Work workspace exists
- When PromptHub detects built-in Agents
- Then Doubao Work appears as installed and launchable
- And its Skills path ends in `workspace/.user_skills`
- And no built-in `.skills` path is exposed as writable

#### Scenario: Install a PromptHub Skill into Doubao Work

- Given a valid managed Skill package and an initialized Doubao Work workspace
- When the user installs the Skill for Doubao Work
- Then PromptHub copies the complete package into `.user_skills/<skill-name>`
- And does not modify `.skills`, `~/.codex/skills`, or `~/.agents/skills`
