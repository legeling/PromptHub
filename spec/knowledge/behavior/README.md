# PromptHub Knowledge Behavior

`spec/knowledge/behavior/` 对齐最新 `spec-init` 的 knowledge/behavior 边界，用于沉淀 PromptHub 长期稳定的关键流程、状态流转、规则与异常路径。

## 长期稳定行为示例

### 1. Rules 是工作区，不是平台探测器

PromptHub 的 `Rules` 模块是一个集中管理规则文件的工作区：

- 左侧分为全局规则和项目规则
- 不以“识别到哪些平台”为主要产品心智
- 规则正文真相源位于文件系统工作区，而不是只存在数据库里

### 2. Skill 以目录为单位，而不是单文件错觉

PromptHub 当前对 Skill 的长期行为约束是：

- Skill 的正文契约以 `SKILL.md` + frontmatter 为核心
- 安装、分发、项目级部署的单位应是包含 `SKILL.md` 的 skill 目录
- GitHub 仓库安装不能默认把整个 repo 根误当成一个 skill

### 3. 同步语义必须以可恢复对象为中心

PromptHub 的同步不应围绕临时 UI 状态，而应围绕可恢复的数据对象与稳定数据布局：

- 支持上传、下载、恢复、周期同步
- 桌面端可启用多个手动备份目标
- 自动同步同一时刻只允许一个 provider 驱动

### 4. 变更必须先进 change，再回写稳定层

非 trivial 变更的长期行为规则是：

- 先进入 `spec/changes/active/<change-key>/`
- 完成后再同步回长期稳定真相源
- 历史变更进入 archive 或 legacy，而不是删除

### 5. 项目级文档与单次变更必须分层

PromptHub 在接入 `spec-init` 后，项目级 workflow / knowledge 文档与单次 change 工作区必须分层：

- `spec/workflow/*` 与 `spec/knowledge/*` 用来表达项目级持续真相
- `spec/changes/active/<change-key>/` 用来表达单次改动的原因、设计调整、验证和任务
- 不应把单次 patch 说明直接写进长期 knowledge 层

### 6. Plugin 是插件级能力包，不是单个 Skill

PromptHub 对 Plugin 的长期行为约束是：

- Plugin 是可安装分发单位，可以包含 Skills、MCP servers、Apps/connectors、commands、hooks、assets 等子能力
- Skill 是可复用工作流说明；MCP 是工具/上下文；App/connector 是外部服务连接；这些可以被 Plugin 打包，但不能互相替代
- Plugin 安装必须先静态扫描和预览 inventory，不得在扫描阶段执行代码、安装依赖或启动 MCP server
- Plugin 安装不等于自动把子能力分发到 agent 目标，也不等于自动授权外部 App

## 主要映射来源

- `spec/knowledge/context/system.md`
- `spec/knowledge/behavior/skills.md`
- `spec/knowledge/behavior/plugins.md`
- `spec/knowledge/behavior/sync.md`
- `spec/knowledge/behavior/rules-workspace.md`
