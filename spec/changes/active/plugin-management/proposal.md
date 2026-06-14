# Plugin Management

## Why

PromptHub 现在已经有 Prompts、Skills、Rules、MCP 管理和 Agent 平台分发能力，但还缺少一个更高一级的“插件级能力包”概念。像 HyperFrames 这类能力不只是一个 Skill，它可能同时包含工作流说明、MCP 配置、命令、资源、连接器或多项子能力；继续把它硬塞进 Skill 会让 Skill 的边界变得混乱。

OpenAI Codex 官方文档把 Skill 定义为可复用工作流说明，把 Plugin 定义为可安装的分发单位，Plugin 可以打包 skills、apps、MCP servers 等能力。PromptHub 应该把 Plugin 建模为和 Skill / MCP 一样的一等管理对象，但它的心智是“安装一个能力包”，不是“写一个任务工作流”。

这也自然服务后续 Agent Assistant：用户可以直接说“从这个链接安装插件，并把里面的 Skill / MCP 分发到 Codex、Claude、OpenCode”，Assistant 调用 PromptHub 内置安装和分发能力即可，不需要用户手动点一堆表单。

## Scope

- In scope:
  - 新增 Plugin 作为 PromptHub 规划中的一等分发面，和 Prompt / Skill / MCP / Rules 并列。
  - 明确 Plugin、Skill、MCP server、App/connector 的产品边界。
  - 规划 Plugin Store、Git/SSH/HTTP/本地目录安装、扫描预览、manifest 校验、安装、更新、卸载和回滚流程。
  - 规划 Plugin 内部 inventory：Skills、MCP servers、Apps/connectors、commands、assets、hooks 等子资产如何展示和分发。
  - 明确安全边界：扫描不执行代码，MCP/App 授权不自动启用，写入 agent 配置前必须预览和确认。
  - 为后续 Agent Assistant 调用插件安装和分发能力预留 contract。
- Out of scope:
  - 本轮不实现插件安装器、插件商店 UI、数据库迁移或 IPC。
  - 本轮不把 Codex 官方插件市场完整镜像到 PromptHub。
  - 本轮不自动执行插件脚本、安装依赖、启动 MCP server 或完成外部 App 授权。
  - 本轮不改变现有 Skill / MCP 已实现逻辑，只记录更高一级的产品边界。

## Risks

- Plugin 比 Skill 权限更宽，如果扫描阶段执行代码或自动写入 MCP/App 配置，会带来明显安全风险。
- Plugin 与 Skill/MCP 的关系容易混淆；文档和 UI 必须强调 Plugin 是分发包，Skill 是工作流，MCP 是工具/上下文。
- 官方插件生态仍在变化，PromptHub 不能把一个短期 marketplace 格式写死成唯一来源。
- 如果插件安装同时写 DB、文件系统和 agent 配置，必须有事务边界、回滚记录和 partial failure 处理，否则会留下半安装状态。
- SSH / HTTP / GitHub API 的拉取策略必须沿用 Skill 仓库安装的经验：SSH 走本地 git 和本地密钥，HTTP 可匿名但要解释 rate limit。

## Rollback Thinking

- 本轮是文档规划，没有生产代码或数据迁移；回滚时移除本 active change 和同步的稳定 knowledge 文档即可。
- 后续实现阶段应保证插件库的 source of truth 可被重建：本地 manifest、repo 目录和 PromptHub 管理记录之间必须有明确 rescan/recover 流程。
