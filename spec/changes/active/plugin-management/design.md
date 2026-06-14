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
  - `[待确认]` Durable source of truth can start as a local library file similar to MCP, then migrate to SQLite if plugin history, sync, or multi-user ownership requires it.
- Core workflows:
  - Shared scan/install/update/uninstall logic should live in `packages/core`.
  - Source cloning and static inventory parsing should reuse the Skill Git/source lessons: SSH uses local git, HTTP can use anonymous fetch but must explain rate limits.
- Desktop main/preload:
  - Plugin IPC should expose scan, install, read library, update, uninstall, open source, and distribute child assets.
  - IPC must validate source URLs, file paths, manifest shape, and write targets.
- Renderer UI:
  - Add a Plugins module beside Prompts, Skills, MCP, and Rules.
  - Recommended views: My Plugins, Plugin Store, Agent Plugins, and Plugin Detail.
  - Detail view should show an inventory table/grouped panels for child capability types.
- Agent Assistant:
  - Later Assistant actions should call the same plugin APIs, not duplicate install logic in the chat UI.

## Data Boundary

`DES-PLUGIN-002`

Recommended first implementation:

- Store installed plugin repositories under a PromptHub-owned plugin workspace, for example `<userData>/data/plugins/<source-slug>/repo`.
- Store PromptHub plugin library metadata under a PromptHub-owned source of truth:
  - option A: `<userData>/config/plugin-library.json`
  - option B: SQLite `plugins`, `plugin_sources`, `plugin_assets`, `plugin_bindings`
  - option C: hybrid SQLite metadata plus plugin repo directory

Recommendation: use option C if implementation includes update history, child asset binding, sync, and Agent Assistant actions in the first real implementation. Use option A only for a smaller local-only MVP that mirrors MCP's current `config/mcp-library.json` pattern.

No durable business rule should live only in React state. The renderer only chooses filters, selected rows, and confirmation state.

## Store and Source Model

`DES-PLUGIN-003`

Plugin Store should support multiple provenance levels:

- official: first-party or explicitly trusted source
- verified: reviewed source with stable metadata
- community: user/community-provided listing
- custom: user-added Git URL, SSH URL, HTTP(S) URL, or local folder

Store entries should not be considered installed by display name alone. Matching should use stable source identity, manifest id, source URL, and revision/version where available.

## Installation Flow

`DES-PLUGIN-004`

1. User chooses a store entry or enters a source.
2. PromptHub performs a static scan.
3. PromptHub shows manifest and inventory preview.
4. User confirms install.
5. PromptHub copies/clones into a temp install directory.
6. PromptHub validates paths, symlinks, manifest identity, and child inventory.
7. PromptHub commits metadata and repo/files atomically as much as the chosen storage allows.
8. PromptHub shows next actions for child capabilities instead of auto-distributing them.

Uninstall should remove the PromptHub-managed plugin record and managed plugin repo. It should not silently delete child Skills/MCP entries that were already copied into My Skills/My MCP or distributed to external agent directories unless those child entries are explicitly recorded as plugin-managed and the user confirms.

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
