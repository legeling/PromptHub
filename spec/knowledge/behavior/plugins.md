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
- PromptHub 应内置 OpenAI 公开 `openai-curated` marketplace，源仓库为 `https://github.com/openai/plugins`，marketplace 文件为 `.agents/plugins/marketplace.json`，并在首版 Plugin Store 中作为默认聚焦的 Codex official source。
- PromptHub 应内置自己的 `prompthub-official` marketplace，源仓库为 `https://github.com/legeling/PromptHub`，marketplace 文件为 `.agents/plugins/marketplace.json`。
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
- 详细目标矩阵和证据源见 `spec/knowledge/reference/plugin-agent-adapter-matrix.md`。

### 6. Stable Internal Sources

- Plugin 当前 active change: `spec/changes/active/plugin-management/`
- Codex extension surface reference: `spec/knowledge/reference/codex-extension-surfaces.md`
- Existing Skill boundary: `spec/knowledge/behavior/skills.md`
- Existing MCP boundary: `spec/changes/active/mcp-management/`

### 7. Current Desktop MVP Boundary

- Desktop stores installed Plugin library metadata in `<userData>/config/plugin-library.json`.
- Desktop stores installed marketplace plugin package files under `<userData>/data/plugins/<plugin-id>/repo` when installation materializes a Git-backed package.
- Plugin Store includes OpenAI `openai-curated` and PromptHub `prompthub-official` built-in marketplace sources.
- Plugin Store defaults to the Codex official `openai-curated` source when it is available, while keeping an all-sources filter.
- Marketplace preview lazily reads the selected package manifest, shows inventory/classification/policy/source links, and does not execute plugin code.
- Marketplace install validates the selected package manifest and downloads Git-backed packages into PromptHub's managed plugin directory before writing My Plugins metadata.
- My Plugins entries open as full detail pages rather than modal dialogs. The detail page shows Plugin description, inventory, source metadata, local package path, source/manifest content, a Files tab backed by the installed local package path, and an Agent Plugin target-selection entry point.
- Uninstall removes only PromptHub-managed plugin package files and My Plugins metadata; it does not delete child Skills/MCP entries or user-owned external paths.
- Single-skill packages and single runtime hook/module packages fail the Plugin semantic gate and are not installed as Plugin bundles.
- Plugin Targets render enabled `Native` / `Adapter` targets and disabled `RuntimeOnly` / `Composite` / `Pending` targets. Disabled targets remain visible with an explicit reason.
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

- Skills follow Skill copy/symlink/package rules
- MCP servers follow MCP config projection and backup rules
- Apps/connectors require explicit authorization or external setup
- conflicts and overwrites require explicit confirmation

### Scenario: Assistant-driven plugin operation

When the future Agent Assistant handles a natural-language request such as “install this plugin and distribute it to Codex and Claude”:

- the Assistant calls Plugin scan/install/distribute capabilities
- the same preview, confirmation, conflict, backup, and no-code-execution rules still apply
- the Assistant does not silently grant App auth or write target configs
