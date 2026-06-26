# Plugin Management

## Why

PromptHub 现在已经有 Prompts、Skills、Rules、MCP 管理和 Agent 平台分发能力，但还缺少一个更高一级的“插件级能力包”概念。像 HyperFrames 这类能力不只是一个 Skill，它可能同时包含工作流说明、MCP 配置、命令、资源、连接器或多项子能力；继续把它硬塞进 Skill 会让 Skill 的边界变得混乱。

OpenAI Codex 官方文档把 Skill 定义为可复用工作流说明，把 Plugin 定义为可安装的分发单位，Plugin 可以打包 skills、apps、MCP servers 等能力。PromptHub 应该把 Plugin 建模为和 Skill / MCP 一样的一等管理对象，但它的心智是“安装一个能力包”，不是“写一个任务工作流”。

这也自然服务后续 Agent Assistant：用户可以直接说“从这个链接安装插件，并把里面的 Skill / MCP 分发到 Codex、Claude、OpenCode”，Assistant 调用 PromptHub 内置安装和分发能力即可，不需要用户手动点一堆表单。

## Scope

- In scope:
  - 新增 Plugin 作为 PromptHub 规划中的一等分发面，和 Prompt / Skill / MCP / Rules 并列。
  - 明确 Plugin、Skill、MCP server、App/connector 的产品边界。
  - 建立 PromptHub 自己的官方 marketplace 入口，作为默认预制官方商店和后续官方插件分发链接。
  - 将 OpenAI 公开 `openai-curated` marketplace 作为 PromptHub 内置 Codex 官方插件商店源，用户可直接浏览、预览 manifest 并下载公开插件包。
  - 实现桌面端 Plugin MVP：My Plugins、Plugin Store、Plugin Targets 三个视图，复用 Skill/MCP 的模块入口和卡片式管理风格。
  - 使用 `data/plugins/library.json` 作为首版本地 source of truth，避免在商店/目标矩阵 MVP 阶段引入 SQLite 迁移；旧版 `config/plugin-library.json` 仅作为兼容读取路径。
  - 通过 IPC/preload/core service 暴露插件库读取、商店读取、manifest 预览、商店安装、删除和目标矩阵能力。
  - 规划 Plugin Store、Git/SSH/HTTP/本地目录安装、扫描预览、manifest 校验、安装、更新、卸载和回滚流程。
  - 规划 Plugin 内部 inventory：Skills、MCP servers、Apps/connectors、commands、assets、hooks 等子资产如何展示和分发。
  - 规划 Agent Plugin Targets：只启用有真实插件/扩展/power/package bundle 机制的目标；单 Skill、单 hook/function 或没有单一整合包机制的目标首版可见但置灰。
  - 明确安全边界：扫描不执行代码，MCP/App 授权不自动启用，写入 agent 配置前必须预览和确认。
  - 为后续 Agent Assistant 调用插件安装和分发能力预留 contract。
- Out of scope:
  - 本轮不做 SQLite 迁移，不自动写入外部 Agent 配置。
  - 本轮不把 Codex 官方插件市场完整镜像到 PromptHub。
  - 本轮安装 marketplace plugin 到 PromptHub 管理目录和 PromptHub library；不把 child Skills/MCP 自动复制进 My Skills/My MCP。
  - 本轮不实现 Git/SSH/HTTP source 的独立预览确认页；直接导入入口先复用静态扫描和语义 gate，完整 scan-preview-confirm 体验保留在后续任务中。
  - 本轮不自动执行插件脚本、安装依赖、启动 MCP server 或完成外部 App 授权。
  - 本轮不改变现有 Skill / MCP 已实现逻辑，只在 Plugin 层记录和展示更高一级的产品边界。

## Risks

- Plugin 比 Skill 权限更宽，如果扫描阶段执行代码或自动写入 MCP/App 配置，会带来明显安全风险。
- Plugin 与 Skill/MCP 的关系容易混淆；文档和 UI 必须强调 Plugin 是分发包，Skill 是工作流，MCP 是工具/上下文。
- 官方插件生态仍在变化，PromptHub 不能把一个短期 marketplace 格式写死成唯一来源。
- 如果插件安装同时写 DB、文件系统和 agent 配置，必须有事务边界、回滚记录和 partial failure 处理，否则会留下半安装状态。
- SSH / HTTP / GitHub API 的拉取策略必须沿用 Skill 仓库安装的经验：SSH 走本地 git 和本地密钥，HTTP 可匿名但要解释 rate limit。

## Rollback Thinking

- 本轮没有数据库迁移；回滚时移除新增 Plugin IPC/preload/core/renderer 文件、`data/plugins/library.json` 本地记录和同步的文档即可。
- PromptHub 官方 marketplace 入口是仓库内 `.agents/plugins/marketplace.json`；若后续改为独立仓库，应保留重定向说明或在应用内继续兼容旧源。
- 后续实现阶段应保证插件库的 source of truth 可被重建：本地 manifest、repo 目录和 PromptHub 管理记录之间必须有明确 rescan/recover 流程。
