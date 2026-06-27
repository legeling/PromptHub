# Plugins Spec

## Purpose

本规范定义 PromptHub Plugin 体系的稳定产品边界。Plugin 是比 Skill 更高一级的可安装分发单位，用来承载一组可复用能力，而不是单个任务工作流。

## Official Concept Boundary

PromptHub 采用 Codex 官方概念作为命名基线：

- Skill: 可复用工作流说明，告诉 agent 某类任务该怎么做。
- Plugin: 可安装的分发单位，可以打包 skills、apps、MCP servers 和相关资源。
- MCP server: 提供外部工具和上下文的运行时能力。
- App/connector: 连接 GitHub、Slack、Google Drive 等服务的集成面。

Official references:

- [Codex Skills](https://developers.openai.com/codex/skills)
- [Codex Plugins](https://developers.openai.com/codex/plugins)
- [Build plugins](https://developers.openai.com/codex/plugins/build)

## Stable Requirements

### 1. Plugin Package Contract

- Plugin 是可安装 package，不是单个 Skill。
- Plugin 可以包含多个 child assets，包括 Skills、MCP servers、Apps/connectors、commands、hooks、assets、docs 和 templates。
- Plugin UI 必须展示 child inventory，不能把多能力包误展示成一个 Skill。
- 只有一个 `SKILL.md`、没有额外 inventory / scripts / MCP config / commands / hooks / assets 的来源，应按 Skill package 处理，不应作为完整 Plugin 展示。
- 只有单个 JS/TS hook、function、tool entrypoint 的 runtime plugin，不满足 PromptHub Plugin bundle 语义。
- Plugin 安装只表示能力包进入 My Plugins；子能力是否导入 My Skills / My MCP 或分发到 agent target，必须由用户明确选择。

### 2. Store and Source Contract

- Plugin Store 必须能表达来源和可信级别：official、verified、community、custom。
- PromptHub 应内置自己的 `prompthub-official` marketplace，源仓库为 `https://github.com/legeling/PromptHub`，marketplace 文件为 `.agents/plugins/marketplace.json`。
- PromptHub 应内置 OpenAI 公开 `openai-curated` marketplace，源仓库为 `https://github.com/openai/plugins`，marketplace 文件为 `.agents/plugins/marketplace.json`，作为 Codex official source 暴露。
- Store entry 的安装状态不得只按展示名匹配；必须使用稳定 identity，例如 manifest id、source URL、revision/version 或 source fingerprint。
- Store entry 可以先只从 marketplace JSON 渲染；manifest、inventory 和 semantic classification 应通过懒预览读取，避免打开商店时批量拉取所有插件 manifest。
- Codex official store entry 应保留 marketplace policy 元数据和 Codex detail deep link，例如 `codex://plugins/openai-developers@openai-curated`。
- Git/SSH/HTTP/local folder 都可以作为自定义 plugin source。
- SSH source 应走本地 git 和本地密钥，不应依赖匿名 GitHub API 完成主扫描。

### 3. Static Scan Contract

- 扫描和预览阶段不得执行插件代码。
- 扫描和预览阶段不得安装依赖、启动 MCP server、调用 plugin tools 或触发 App 授权。
- PromptHub 可以读取 manifest、README、package metadata、MCP config、Skill entrypoint 和静态资源清单。
- manifest 和 inventory 必须拒绝路径穿越、绝对写入路径、null byte、危险 symlink escape 和重复 identity 冲突。
- 本地或 Git 物化后的 Plugin package 在进入 My Plugins 前必须先校验 package 边界：manifest child asset 路径不得指向包外，包内 symlink 不得解析到包外，package scripts 只能作为静态文件存在，扫描/导入不得执行它们。

### 4. Distribution Contract

- Plugin 内的 Skill child asset 应复用 Skill package contract 和 Skill 分发流程。
- Plugin 内的 MCP child asset 应复用 MCP library、preview、backup、conflict 和 apply/remove 流程。
- Plugin 内的 App/connector child asset 只能进入待配置/待授权状态，不能自动获得用户账户权限。
- Agent Assistant 未来只能调用同一套 Plugin scan/install/distribute API，不得在聊天层绕过安全确认。

### 5. Agent Plugin Adapter Contract

- “Agent 支持 Plugin”在 PromptHub 中表示 PromptHub 能把一个整合包安装为该 Agent 的原生整合包或等价组合，而不是要求该 Agent 直接读取 Codex `.codex-plugin`。
- Codex CLI / Codex app 是 native target，因为它直接支持 Codex plugin package 和 marketplace。
- Claude Code、Cursor、Gemini CLI、Kiro、GitHub Copilot / VS Code Agent Plugins 应建模为 adapter target，因为它们存在自己的插件、扩展、power 或 agent plugin bundle 机制。
- OpenCode 和 Cline SDK / CLI / Kanban 当前应建模为 runtime-only target，因为它们的官方插件语义主要是 JS/TS hook module、npm plugin、`AgentPlugin` entrypoint、tools/hooks/commands runtime，而不是多子资产 bundle inventory。
- Cline runtime-only target 需要标注适用范围：官方插件机制当前适用于 Cline SDK / CLI / Kanban，不适用于 VSCode / JetBrains 扩展运行时。
- Windsurf / Devin、Cherry Studio 当前应建模为 composite target 或 lower-priority target，因为它们没有确认的单一 Agent 插件包格式，需要把 PromptHub Plugin 拆到多个目标资产面。
- Amp 和其他证据不足的平台应保持 pending/disabled，直到官方文档或源码能证明单一插件包机制。
- UI 必须明确区分 `Native`、`Adapter`、`RuntimeOnly`、`Composite`，不能把适配后的效果伪装成目标 Agent 原生支持 Codex 插件。
- 第一版只启用 `Native` 和满足 bundle 语义的 `Adapter`；`RuntimeOnly`、`Composite`、`Pending` 目标可见但置灰，并明确显示“不支持 PromptHub 插件整合包”，等后续设计 wrapper/composite installer 或有新证据后再重新评估。
- 分发到 Adapter 目标时，PromptHub 必须复制 Plugin package 并生成目标 Agent 的原生 package marker，例如 `.claude-plugin/plugin.json`、`.cursor-plugin/plugin.json`、`gemini-extension.json`、`POWER.md` 或 `plugin.json`；不得只把 Codex `.codex-plugin` 原包软链到非 Codex Agent。
- 当用户对 Adapter 目标选择 symlink 模式时，PromptHub 应落成生成后的 copy package 并在结果中报告实际 copy 写入，因为 marker 转换不能通过原包软链接真实表达。
- 详细目标矩阵和证据源见 `spec/knowledge/reference/plugin-agent-adapter-matrix.md`。

### 6. Stable Internal Sources

- Plugin 当前 active change: `spec/changes/active/plugin-management/`
- Codex extension surface reference: `spec/knowledge/reference/codex-extension-surfaces.md`
- Existing Skill boundary: `spec/knowledge/behavior/skills.md`
- Existing MCP boundary: `spec/changes/active/mcp-management/`

### 7. Current Desktop MVP Boundary

- Desktop stores installed Plugin library metadata in `<userData>/data/plugins/library.json`. If only the legacy `<userData>/config/plugin-library.json` exists, desktop migrates it into the data path on first read and keeps the legacy file as a compatibility backup.
- Desktop stores installed marketplace plugin package files under `<userData>/data/plugins/<plugin-id>/repo` when installation materializes a Git-backed package.
- Plugin Store includes OpenAI `openai-curated` and PromptHub `prompthub-official` built-in marketplace sources.
- Plugin Store defaults to PromptHub's built-in `prompthub-official` Official Store and keeps `openai-curated` available as the Codex Official Store, while keeping an all-sources filter.
- Marketplace preview lazily reads the selected package manifest, shows inventory/classification/policy/source links, and does not execute plugin code.
- Marketplace Store cards may render first from cached marketplace JSON, but visible cards with missing manifest presentation metadata must start bounded background prefetch immediately, even while slower marketplace source refreshes are still in flight.
- Plugin Store uses the same large-catalog rendering boundary as Skill Store: small catalogs render as normal card grids, while catalogs above the shared large-list threshold render through a virtualized row catalog tied to the page scroll container.
- Marketplace install validates the selected package manifest and downloads Git-backed packages into PromptHub's managed plugin directory before writing My Plugins metadata.
- Plugin Store batch mode supports Skill Store-style batch install, update, and remove actions. Install applies to selected store entries that are not in My Plugins. Update applies to selected entries already installed in My Plugins and calls the same source-update flow used by installed Plugin detail. Remove applies to selected installed store entries and removes those Plugin records from My Plugins; it does not remove imported child Skills/MCP entries and does not remove distributed Agent Plugin packages unless the user uses the My Plugins delete cleanup flow.
- My Plugins entries open as full detail pages rather than modal dialogs. The detail page shows Plugin description, inventory, source metadata, local package path, source/manifest content, a Files tab backed by the installed local package path, and an Agent Plugin target-selection entry point.
- Installed Plugin detail page render failures are contained with the same recoverable boundary pattern as My Skills: the Plugin module stays usable, users can go back to the list, and retry reloads Plugin data.
- Installed Plugin detail pages show a Skill-style Back to Top action on long non-files tabs after scrolling. The Files tab hides the floating action because it owns its own editor scroll area.
- My Plugins supports Skill-style installed-library controls where applicable: gallery/list view toggle, persisted gallery column preference, shared page-size pagination, previous/next page controls, and right-click context menu actions for detail, favorite, user tags, Agent target selection, opening the package folder, and delete.
- My Plugins tag filtering uses the shared left-bottom sidebar tag section, matching My Skills. The My Plugins header may keep status/source/view controls, but must not render a separate page-top tag selector.
- Installed Plugin detail pages expose a static package check. The check verifies local package existence, manifest path boundaries, and package symlink boundaries without executing Plugin code, installing dependencies, starting MCP servers, or mutating the Plugin library.
- Installed Plugin detail pages expose an AI safety assessment. The assessment sends a static PromptHub-generated Plugin summary to the existing safety scanner, including Plugin identity, source provenance, child inventory, local package path, and explicit non-execution scope. It must not execute Plugin scripts, commands, hooks, MCP servers, tools, dependencies, or App authorization flows. The resulting `safetyReport` is PromptHub-owned Plugin metadata and is preserved across source refresh and source-update operations.
- Installed Plugin detail pages expose Plugin package snapshots. Snapshot versions start at `v1`, capture Plugin metadata plus static package files, can preview text package files, can be restored with a safety snapshot of the current state, and can be deleted without mutating the current Plugin entry.
- Plugin source updates that proceed to overwrite the installed package must first create an automatic pre-update snapshot with the old Plugin metadata and package files. Up-to-date checks and blocked local-change conflicts must not create snapshot noise.
- My Plugins cards surface checked source update states from the installed detail page, including available updates, local package changes, and source/local conflicts. The card grid must not trigger new source scans by itself because Plugin sources can require Git/SSH/network work.
- My Plugins stores user-facing personal metadata separately from source metadata. `isFavorite`, `userTags`, and `userNotes` are PromptHub-owned user metadata and must be preserved across source refresh or source-update operations. Manifest/source `tags` remain read-only package metadata; My Plugins filtering, searching, and card chips may combine source tags and user tags for discoverability, but write actions must only modify PromptHub-owned metadata.
- My Plugins batch mode supports Skill-style favorite/unfavorite actions. If every selected Plugin is already favorited, the batch favorite action removes favorite state; otherwise it favorites every selected Plugin.
- My Plugins batch mode includes a paper-plane distribute action. Selected Plugin packages share one Agent target picker; confirming the picker distributes each selected Plugin package to the chosen Agent Plugin targets through the same copy/symlink Plugin package distribution flow as single-Plugin distribution.
- My Plugins distribution preserves Codex native package copy/symlink behavior for Codex targets, and generates target-native package markers for enabled adapter targets before recording `distributedTargetIds`.
- Agent Plugin and the installed Plugin detail page both let users remove a distributed My Plugins package from one supported target without deleting the My Plugins record. The removal is confirmation-gated, deletes only the resolved target package path, and removes only that target ID from `distributedTargetIds`.
- Uninstall removes My Plugins metadata and PromptHub-managed plugin package files. Distributed Agent Plugin package copies/symlinks are preserved by default, but single and batch delete confirmations may explicitly remove the resolved Agent Plugin package paths for recorded `distributedTargetIds`. Plugin uninstall never removes imported child Skills/MCP entries, App authorizations, user-owned external source packages, or unrelated Agent folders.
- Single-skill packages and single runtime hook/module packages fail the Plugin semantic gate and are not installed as Plugin bundles.
- Plugin Targets render enabled `Native` / `Adapter` targets and disabled `RuntimeOnly` / `Composite` / `Pending` targets. Disabled targets remain visible with an explicit reason.
- Agent Plugin reads target-native installed Plugin inventory for enabled bundle targets without importing it into My Plugins. Current target-native inventory detection covers Codex `.codex-plugin/plugin.json` cache packages, Claude Code registry/manual packages, Cursor `.cursor-plugin/plugin.json` packages, Gemini CLI extension packages, Kiro `POWER.md` powers, and GitHub Copilot / VS Code Agent Plugin `plugin.json` packages. Runtime-only, composite, and pending targets remain disabled and are not scanned as separate skill/MCP folders.
- Agent Plugin target descriptions are localized UI copy keyed by target ID. Disabled runtime-only or composite targets must clearly say the Agent does not support PromptHub Plugin bundles, instead of surfacing raw adapter metadata or opaque internal status labels.
- Plugin Store cards do not show child inventory count chips. Source, category, provenance, install state, icon, and description stay on the card; complete child inventory remains visible in detail and preview surfaces.
- Agent-installed Plugin inventory chips use direct capability counts, such as `1 Skill`, `2 Hooks`, or `1 个 Skill`; they do not prefix the count with `Includes` / `包含`.
- Agent-installed Plugin cards are clickable read-only detail entries. The detail shows Agent source, description, inventory, local source path, a read-only Files tab, import-to-My-Plugins, and open-folder actions without editing or deleting the external Agent package.
- PromptHub-managed My Plugins entries shown inside Agent Plugin are clickable into the same full installed Plugin detail page used by My Plugins, while still keeping selected-target distribution as a direct paper-plane action.
- Users can explicitly import a target-native installed Plugin from Agent Plugin into My Plugins. Import copies the Agent package into PromptHub-managed `data/plugins`, records Agent source provenance, leaves the original Agent package untouched, and still rejects packages that fail the Plugin bundle semantic gate.
- Users can explicitly import a local Plugin package from My Plugins. The desktop folder picker supplies the source path, the same local Plugin import pipeline performs a static manifest/inventory scan, copies valid packages into PromptHub-managed `data/plugins`, and rejects sources that fail the Plugin bundle semantic gate.
- Users can explicitly import Git/SSH/HTTPS Plugin sources from My Plugins. The URL flow first performs a static preview scan and shows a confirmation modal with manifest identity, source, classification, inventory, and unsupported reasons; it writes My Plugins metadata only after the user confirms import. SSH sources use local git and local SSH keys; source branch and package path are preserved in the installed Plugin metadata for duplicate detection and future source update checks.
- Users can explicitly import supported child assets from an installed Plugin detail page. Child Skills reuse the existing local Skill scan preview and copy import flow. Child MCP configs are discovered by static JSON/TOML package scan, symlink escapes are rejected by realpath, and detected configs are imported through the existing MCP library importer. After child Skill/MCP import succeeds, PromptHub opens My Skills/My MCP with the imported assets selected in the existing batch distribution flow. Unsupported child Apps/connectors, commands, hooks, and scripts remain visible as inventory/content but are not auto-imported or executed.
- Installing a Plugin into My Plugins does not automatically copy child assets into My Skills/My MCP and does not write external Agent configuration.

## Stable Scenarios

### Scenario: Installing a plugin package

When a user installs a Plugin from a store, Git URL, SSH URL, HTTP URL, or local folder:

- PromptHub performs a static scan
- PromptHub shows the manifest and child inventory
- PromptHub asks for confirmation before installation
- PromptHub records Plugin source identity and installed inventory
- PromptHub does not auto-distribute child assets to external agents

### Scenario: Distributing plugin child assets

When a user chooses to distribute child assets from an installed Plugin:

- Skills are first imported into My Skills, then distributed through the existing Skill batch distribution dialog
- MCP servers are first imported into My MCP, then distributed through the existing MCP batch distribution dialog
- Apps/connectors require explicit authorization or external setup
- conflicts and overwrites require explicit confirmation

### Scenario: Assistant-driven plugin operation

When the future Agent Assistant handles a natural-language request such as “install this plugin and distribute it to Codex and Claude”:

- the Assistant calls Plugin scan/install/distribute capabilities
- the same preview, confirmation, conflict, backup, and no-code-execution rules still apply
- the Assistant does not silently grant App auth or write target configs
