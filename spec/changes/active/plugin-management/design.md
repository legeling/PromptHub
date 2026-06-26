# Plugin Management Design

## Overview

Plugin 管理应作为 Skill/MCP 之上的分发层实现。它不替代 Skill，也不替代 MCP；它负责把多个能力作为一个可安装包发现、预览、安装、更新和卸载。

官方 Codex 概念映射：

- Skill: reusable workflow instructions, tells Codex how to perform a class of tasks.
- Plugin: installable distribution unit, can package skills, apps, MCP servers, commands/tools, assets and related metadata.
- MCP server: external tool/context provider.
- App/connector: service integration such as GitHub, Slack, Google Drive, or similar external systems.

Reference links:

- [Codex Skills](https://developers.openai.com/codex/skills)
- [Codex Plugins](https://developers.openai.com/codex/plugins)
- [Build plugins](https://developers.openai.com/codex/plugins/build)

## Recommended Product Boundary

`DES-PLUGIN-001`

PromptHub should model Plugin with three layers:

1. Plugin source: store entry, Git URL, SSH URL, HTTP(S) URL, or local folder.
2. Plugin package: manifest, repo/files, version, provenance, install state, update state.
3. Plugin inventory: child Skills, MCP servers, Apps/connectors, commands, hooks, assets, docs, and templates.

The UI should avoid saying “install Skill” when the package contains multiple capability types. It should say “install Plugin”, then show child assets and separate actions such as “Add Skill to My Skills”, “Install MCP to My MCP”, or “Distribute selected assets to agents”.

## Affected Areas

- Data model:
  - New shared plugin types in `packages/shared` for manifest, source, inventory, scan result, install result, conflict, and target distribution summary.
  - Durable source of truth starts as a local JSON library file under the user data area: `<userData>/data/plugins/library.json`.
  - SQLite remains a later migration option if plugin history, sync, or multi-user ownership requires relational metadata.
- Core workflows:
  - Shared scan/install/update/uninstall logic should live in `packages/core`.
  - Source cloning and static inventory parsing should reuse the Skill Git/source lessons: SSH uses local git, HTTP can use anonymous fetch but must explain rate limits.
- Desktop main/preload:
  - Plugin IPC should expose scan, install, read library, update, uninstall, open source, and distribute child assets.
  - IPC must validate source URLs, file paths, manifest shape, and write targets.
- Renderer UI:
  - Add a Plugins module beside Prompts, Skills, MCP, and Rules.
  - Recommended views: My Plugins, Plugin Store, Plugin Detail, and Plugin Targets.
  - Detail view should show an inventory table/grouped panels for child capability types.
- Agent Assistant:
  - Later Assistant actions should call the same plugin APIs, not duplicate install logic in the chat UI.

## Data Boundary

`DES-PLUGIN-002`

Recommended first implementation:

- Store installed plugin repositories under a PromptHub-owned plugin workspace, for example `<userData>/data/plugins/<source-slug>/repo`.
- Store PromptHub plugin library metadata under a PromptHub-owned source of truth:
  - option A: `<userData>/data/plugins/library.json`
  - option B: SQLite `plugins`, `plugin_sources`, `plugin_assets`, `plugin_bindings`
  - option C: hybrid SQLite metadata plus plugin repo directory

Decision for the first implementation: use option A, `<userData>/data/plugins/library.json`, because installed Plugin metadata is user data and should live beside the managed plugin package workspace. Older builds wrote `<userData>/config/plugin-library.json`; when the data file is missing, the core service reads the legacy file, normalizes it into the data path immediately, and keeps the legacy file as a compatibility backup. If child asset bindings, update history, or sync ownership require relational metadata later, migrate to option C with the same compatibility reader.

No durable business rule should live only in React state. The renderer only chooses filters, selected rows, and confirmation state.

## Store and Source Model

`DES-PLUGIN-003`

Plugin Store should support multiple provenance levels:

- official: first-party or explicitly trusted source
- verified: reviewed source with stable metadata
- community: user/community-provided listing
- custom: user-added Git URL, SSH URL, HTTP(S) URL, or local folder

Store entries should not be considered installed by display name alone. Matching should use stable source identity, manifest id, source URL, and revision/version where available.

## Built-in Marketplace Sources

PromptHub should ship with these default Plugin Store sources:

| Source ID            | Display Name   | Repository                              | Marketplace File                   | Raw JSON                                                                                     |
| -------------------- | -------------- | --------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `openai-curated`     | Codex official | `https://github.com/openai/plugins`     | `.agents/plugins/marketplace.json` | `https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json`     |
| `prompthub-official` | Official Store | `https://github.com/legeling/PromptHub` | `.agents/plugins/marketplace.json` | `https://raw.githubusercontent.com/legeling/PromptHub/main/.agents/plugins/marketplace.json` |

Implementation notes:

- The OpenAI source is public Git content, not a private API. PromptHub can clone/read it directly for catalog browsing and package download.
- If Codex CLI is available, PromptHub may also call `codex plugin marketplace add openai/plugins --ref main` or read `codex plugin list --marketplace openai-curated --available --json`.
- PromptHub must not depend on Codex CLI for the basic browsing path. API-only users should still be able to download public plugin packages into PromptHub's Plugin Library.
- PromptHub's own marketplace starts at `.agents/plugins/marketplace.json` in this repository. It may begin with an empty `plugins` array and later add official PromptHub plugin packages.
- If PromptHub later splits official plugins into a dedicated repository, the app should keep the current source as a compatibility alias or migration source.

## Official Store and Codex Store Experience

`DES-PLUGIN-007`

PromptHub's built-in `prompthub-official` marketplace is the first default Official Store source. The OpenAI `openai-curated` marketplace remains a first-class built-in Codex Official Store source, not an anonymous custom source.

Product behavior:

- Plugin Store should default to PromptHub's `prompthub-official` source when it is available, while still exposing the Codex official source and an "all sources" view.
- Store list loading should read only marketplace JSON first. It must not fetch every plugin manifest eagerly because the official store can contain many entries.
- Each store card should expose a lazy manifest preview action. Preview reads `.codex-plugin/plugin.json`, enriches the card/detail cache with version, author, manifest URL, package path, presentation metadata, and semantic classification.
- Store cards may background-enrich the currently visible first batch of entries so the Official Store does not appear as sparse marketplace JSON. This enrichment still uses the same safe manifest preview path and should be capped rather than fetching the whole store at once.
- Manifest presentation metadata should be parsed from `interface.displayName`, `interface.shortDescription`, `interface.longDescription`, `interface.composerIcon`, `interface.logo`, and `interface.brandColor`. Relative icon/logo paths are resolved against the plugin package path and converted to the source raw file URL only when they remain inside the package.
- Manifest presentation metadata should be persisted in `data/plugins/market-cache.json` after preview/background enrichment. Older `config/plugin-market-cache.json` files remain readable as a legacy cache source and are migrated into the data path on first read when the data cache is missing. Later marketplace listing reads merge this cache into store entries so official icons/descriptions render immediately without refetching every manifest on every app open. Missing entries may be enriched in the background with bounded concurrency.
- Marketplace policy metadata such as `installation: AVAILABLE` and `authentication: ON_INSTALL` should remain visible so users understand whether setup or app auth is expected.
- The store chrome label should name the surface as `Plugins Store` / `Plugins 商店`; source rows and provenance badges should name concrete sources such as `Codex Official Store` / `Codex 官方商店` for the external Codex source and `Official Store` / `官方商店` for PromptHub's built-in source.
- Store cards should avoid redundant provenance badges: when a built-in official source label such as `Codex official store` already communicates official provenance, the card should not render a second standalone `Official` trust chip. Non-official or custom sources can still show trust level so users can distinguish provenance.
- Store cards should not render child inventory count chips such as `1 Skill`, `2 Hooks`, `1 个 Skill`, `Includes 1 Skill`, or `Skills · 1`. Cards focus on source, category, icon, and description; the detail modal keeps the complete inventory for inspection.
- If a Codex/OpenAI manifest declares `skills` as a directory path such as `./skills/`, preview should expand the GitHub repository tree and count nested `SKILL.md` files under the plugin package path. The tree response should be cached in memory per marketplace source during the process so visible-card enrichment does not make one GitHub tree request per card. If the tree lookup fails, preview falls back to the manifest-field count without blocking the store.
- OpenAI curated entries should expose a Codex detail deep link such as `codex://plugins/openai-developers@openai-curated` for users who also run Codex.
- PromptHub install must not require the Codex CLI. Desktop install should download the plugin package into PromptHub's managed plugin directory with Git transport, then record the library metadata.
- Git transport should avoid the GitHub REST API path for package download. SSH marketplace/repo sources should use the user's local Git/SSH configuration and keys.
- Preview/install still must not execute plugin code, install dependencies, start MCP servers, or authorize Apps/connectors.

Implementation boundary:

- Installed plugin metadata remains in `<userData>/data/plugins/library.json`.
- Downloaded plugin package files live under `<userData>/data/plugins/<plugin-id>/repo`.
- The installed record stores the managed root, local repository path, and local package path so uninstall can clean only PromptHub-owned files.
- Child asset import/distribution remains a later explicit action; installing a Codex official plugin does not automatically add child Skills/MCP into their libraries.

## Agent Bundle Adapter Matrix

`DES-PLUGIN-006`

PromptHub must treat Plugin support as adapter work. A target can be supported when it has a native bundle/extension/package mechanism that PromptHub can generate or install into, even if that mechanism is not Codex-compatible. The product question is not "does the agent read `.codex-plugin` directly"; it is "does the agent have a first-class integrated package concept we can map PromptHub Plugins onto."

This must pass a strict semantic gate. A supported Plugin target must model a bundle, not merely a runtime function or a single asset. It should be able to carry or point to multiple child capability classes such as skills, agents, commands, hooks, MCP servers, LSP servers, scripts, assets, or package-level docs. Single-skill packages and single JS/TS hook modules should not be presented as full PromptHub Plugins.

Current adapter matrix:

| Platform                              | Native bundle concept                                                         | Native marker / install surface                                                               | PromptHub stance                      |
| ------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| Codex CLI / Codex app                 | Codex plugin marketplace and plugin package                                   | `.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `codex plugin ...`           | Supported native target               |
| Claude Code                           | Claude Code plugin marketplace and plugin package                             | `.claude-plugin/plugin.json`, `/plugin`, `claude plugin ...`, `--plugin-dir`, `--plugin-url`  | High-priority adapter target          |
| Cursor                                | Cursor plugin marketplace and plugin package                                  | `.cursor-plugin/plugin.json`, `.cursor-plugin/marketplace.json`                               | High-priority adapter target          |
| Gemini CLI                            | Gemini extension package                                                      | `gemini-extension.json`, `gemini extensions install`                                          | High-priority adapter target          |
| Kiro                                  | Kiro power package                                                            | `POWER.md` plus bundled MCP configuration and steering                                        | Adapter target                        |
| GitHub Copilot CLI / VS Code Agent UI | Copilot / VS Code agent plugin package                                        | root `plugin.json`, `.plugin/plugin.json`, `.github/plugin/plugin.json`, `copilot plugin ...` | Adapter target                        |
| OpenCode                              | Runtime JS/TS or npm plugin module, not bundle inventory                      | `.opencode/plugins/`, `~/.config/opencode/plugins/`, `opencode.json` `plugin`                 | Runtime-only / disabled               |
| Cline SDK / CLI / Kanban              | Runtime AgentPlugin entrypoint package, not bundle inventory                  | `cline plugin install`, `package.json` `cline.plugins`, `.ts`/`.js` `AgentPlugin` entrypoints | Runtime-only / disabled               |
| Windsurf / Devin                      | No single agent plugin bundle confirmed; has IDE plugins plus separate assets | Windsurf Plugins, Cascade skills/workflows/hooks/MCP                                          | Composite adapter, not package-native |
| Roo Code                              | No current single plugin package confirmed                                    | skills, rules, commands, MCP-like config surfaces                                             | Composite adapter / disabled          |
| Cherry Studio                         | No plugin package confirmed                                                   | local skill and agent registries                                                              | Composite adapter / disabled          |
| Amp and other targets                 | Public evidence insufficient for a stable plugin package claim                | none confirmed                                                                                | Pending / disabled                    |

Product rule:

- Plugin Targets should show four statuses: `Native`, `Adapter`, `RuntimeOnly`, and `Composite`; evidence-limited targets can remain `Pending`.
- `Native` means PromptHub can install the source package format directly or with only manifest/source-path normalization.
- `Adapter` means PromptHub can generate a target-native package from the PromptHub Plugin inventory.
- `RuntimeOnly` means the target has a plugin runtime, but it is a hook/module/function surface rather than a bundle package; first implementation keeps it disabled and labels it unsupported for PromptHub Plugin bundles.
- `Composite` means the target has no single bundle mechanism; PromptHub must install the plugin's parts into multiple target-native surfaces and show that this is a decomposition.
- First implementation should enable only `Native` and bundle-semantics `Adapter` targets. `RuntimeOnly`, `Composite`, and `Pending` targets remain visible but disabled/greyed out, with explicit "not supported for Plugin bundles" copy, until dedicated wrapper/composite designs or new evidence exist.
- UI copy must avoid saying non-Codex agents "support Codex plugins"; it should say PromptHub can "adapt this plugin to Claude Code", "adapt this plugin to Gemini CLI", and so on.

Evidence references:

- Detailed adapter matrix: `spec/knowledge/reference/plugin-agent-adapter-matrix.md`
- Claude Code plugins: `https://code.claude.com/docs/en/plugins-reference`
- Cursor plugins: `https://cursor.com/docs/plugins` and `https://github.com/cursor/plugins`
- Gemini CLI extensions: `https://geminicli.com/docs/extensions/reference/`
- Kiro powers: `https://kiro.dev/docs/powers/create/`
- GitHub Copilot CLI plugins: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference`
- VS Code Agent Plugins: `https://code.visualstudio.com/docs/agent-customization/agent-plugins`
- OpenCode plugins: `https://opencode.ai/docs/plugins/`
- Cline plugins: `https://docs.cline.bot/customization/plugins`
- Windsurf / Devin Cascade separate assets: `https://docs.devin.ai/desktop/cascade/skills` and `https://docs.devin.ai/desktop/cascade/hooks`

## Installation Flow

`DES-PLUGIN-004`

1. User chooses a store entry or enters a source.
2. PromptHub performs a static scan.
3. PromptHub shows manifest and inventory preview.
4. User confirms install.
5. PromptHub copies/clones into a temp install directory. For Git-backed Codex marketplace entries, PromptHub uses Git transport and sparse checkout instead of GitHub REST API package download.
6. PromptHub validates paths, symlinks, manifest identity, and child inventory.
7. PromptHub commits metadata and repo/files atomically as much as the chosen storage allows.
8. PromptHub shows next actions for child capabilities instead of auto-distributing them.

Uninstall should remove the PromptHub-managed plugin record and managed plugin repo. It should not silently delete child Skills/MCP entries that were already copied into My Skills/My MCP or distributed to external agent directories unless those child entries are explicitly recorded as plugin-managed and the user confirms.

## Agent Plugin Package Distribution

`DES-PLUGIN-008`

Installed Plugin package distribution is distinct from child Skill/MCP decomposition:

- Package distribution copies or symlinks the installed Plugin package directory into an enabled Agent Plugin target directory.
- Child asset decomposition into My Skills, My MCP, or agent-native child surfaces remains a later explicit workflow.
- The renderer must not fake distribution. It calls the same desktop IPC/core service used by future Assistant actions.
- Successful writes update the installed library entry's `distributedTargetIds`; card badges and filters derive from that field.
- Disabled targets in the adapter matrix remain visible but cannot be selected or written.

Target ID mapping:

| Plugin Target ID | Agent platform ID | Default Plugin base directory               |
| ---------------- | ----------------- | ------------------------------------------- |
| `codex`          | `codex`           | `plugins/cache/prompthub` under Codex root  |
| `claude-code`    | `claude`          | `plugins/cache/prompthub` under Claude root |
| `cursor`         | `cursor`          | `plugins/cache/prompthub` under Cursor root |
| `gemini-cli`     | `gemini`          | `config/plugins` under Gemini root          |
| `kiro`           | `kiro`            | `powers` under Kiro root                    |
| `github-copilot` | `copilot`         | `plugins` under Copilot root                |

The Agent Configuration settings own the root and relative path configuration for these surfaces. Built-in and custom agents expose:

- Skill relative path.
- MCP config relative path.
- Plugin directory relative path.
- Rules, Agents, and config file relative paths.

Commands can remain visible as Plugin inventory when a package declares them, but Agent Configuration settings do not expose command-directory configuration in this implementation.

The final package write path is:

`<agent plugin base>/<safe plugin name>/<safe version-or-id>`

Before any package write or removal, the core Plugin library treats the resolved target path as untrusted output from the platform resolver. It may only overwrite or delete:

- a missing path;
- an empty directory reserved for the target package;
- a directory containing a recognized Plugin package marker such as `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `gemini-extension.json`, `POWER.md`, or `plugin.json`;
- a symlink that resolves to a recognized Plugin package or to a PromptHub-managed Plugin package path.

If the resolved path is a normal Agent config file, a non-Plugin directory, the Agent root, or any unrelated user-owned path, distribution and undistribution fail before calling `rm`, `cp`, or `symlink`. This protects Agent JSON/config files even if a future resolver or custom Agent path is misconfigured.

Distribution writes now distinguish native passthrough from adapter output:

- Codex targets can keep the source package structure and honor copy or symlink mode when the package already contains `.codex-plugin/plugin.json`.
- Claude Code targets receive a generated `.claude-plugin/plugin.json` inside a copied package.
- Cursor targets receive a generated `.cursor-plugin/plugin.json` inside a copied package.
- Gemini CLI targets receive a generated `gemini-extension.json` inside a copied package.
- Kiro targets receive a generated `POWER.md` inside a copied package.
- GitHub Copilot / VS Code targets receive a generated root `plugin.json` inside a copied package.
- Adapter targets materialize as generated copies even if the user requested symlink mode, because the target-native marker must be written without mutating or pretending the original Codex package is directly loadable by that Agent.

## Security Rules

`DES-PLUGIN-005`

- Static scan must not execute plugin code.
- Static scan must not install dependencies.
- Static scan must not start MCP servers.
- Static scan must not call plugin tools or app APIs.
- Manifest parsing must reject path traversal, null bytes, absolute write paths, and symlink escapes.
- App/connector auth must remain explicit and user-driven.
- MCP distribution must use existing MCP preview, backup, conflict, and rollback behavior.
- Agent target writes must be confirmation-gated when they overwrite existing config.
- Plugin package scripts, hooks, and commands should be visible as inventory before any enablement.

## Tradeoffs

- Treating Plugin as a wrapper around existing Skill/MCP flows reduces implementation risk, but the UI must clearly show the child inventory or users will not understand what was installed.
- A JSON library file is faster for an MVP, but plugin installation has more relationships than MCP; SQLite is likely cleaner once child asset bindings, updates, and sync are included.
- Supporting official/community store sources early improves usefulness, but every source needs provenance labeling so users do not mistake community packages for trusted packages.

## Traceability

- `FR-PLUGIN-001` -> `DES-PLUGIN-001` -> `TEST-PLUGIN-001` -> `T-PLUGIN-001`
- `FR-PLUGIN-003` -> `DES-PLUGIN-004` -> `TEST-PLUGIN-002` -> `T-PLUGIN-002`
- `FR-PLUGIN-004` / `FR-PLUGIN-005` -> `DES-PLUGIN-005` -> `TEST-PLUGIN-003` -> `T-PLUGIN-003`
- `FR-PLUGIN-006` -> `DES-PLUGIN-002` / `DES-PLUGIN-004` -> `TEST-PLUGIN-004` -> `T-PLUGIN-004`
- `FR-PLUGIN-008` -> `DES-PLUGIN-001` -> `TEST-PLUGIN-005` -> `T-PLUGIN-005`
- `FR-PLUGIN-009` -> `DES-PLUGIN-006` -> `TEST-PLUGIN-006` -> `T-PLUGIN-006`
