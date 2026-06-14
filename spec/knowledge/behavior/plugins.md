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
- Plugin 安装只表示能力包进入 My Plugins；子能力是否导入 My Skills / My MCP 或分发到 agent target，必须由用户明确选择。

### 2. Store and Source Contract

- Plugin Store 必须能表达来源和可信级别：official、verified、community、custom。
- Store entry 的安装状态不得只按展示名匹配；必须使用稳定 identity，例如 manifest id、source URL、revision/version 或 source fingerprint。
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

### 5. Stable Internal Sources

- Plugin 当前 active change: `spec/changes/active/plugin-management/`
- Codex extension surface reference: `spec/knowledge/reference/codex-extension-surfaces.md`
- Existing Skill boundary: `spec/knowledge/behavior/skills.md`
- Existing MCP boundary: `spec/changes/active/mcp-management/`

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
