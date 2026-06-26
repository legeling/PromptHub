# Skills Spec

## Purpose

本规范定义 PromptHub Skill 体系的稳定真相源，包括 Skill 文件格式、仓库同步、版本管理与相关设计入口。

## Stable Requirements

### 1. Skill Package Contract

- Skill 是目录级 package；`SKILL.md` 是 package 内的必需入口文件，不是 Skill 的完整边界。
- 只有一个 `SKILL.md` 的 Skill 仍然合法，但它仍然必须被视为 `<skill-root>/SKILL.md` 形式的目录包。
- 导入、商店安装、Git/Gitea 安装、本地目录安装、同步、导出、项目分发和平台分发必须保留整个 Skill 目录树，除非命中显式忽略规则（例如 `.git` 与 `.prompthub`）。
- Skill package fingerprint 必须使用显式忽略规则，而不是笼统忽略所有隐藏文件。PromptHub 内部目录（`.prompthub/`）、VCS 元数据、依赖目录、缓存、日志、临时文件、本地环境密钥（例如 `.env` / `.env.local`）、虚拟环境与运行态 pid/socket 文件不参与 fingerprint；可分发模板文件（例如 `.env.example` / `.env.sample` / `.env.template`）仍然参与 fingerprint。
- 仅写入 `SKILL.md` 内容的 API 只适用于新建 UI 原生 Skill 或编辑入口文件；不得作为已有包来源导入/安装的最终持久化路径。

### 1.1 Skill File Contract

- Skill 采用 `SKILL.md` 文件与 YAML frontmatter。
- `name` 为必填字段，且必须符合小写短横线命名规则。
- Skill 元数据与正文分工明确：UI 展示元数据与版本信息由数据库维护，说明正文与指令正文由 `SKILL.md` 持有。

### 2. Sync Contract

- PromptHub 必须支持 DB 与本地 Skill 仓库之间的双向同步。
- UI 编辑元数据后，需要同步 frontmatter；文件系统变更后，需要同步回 DB。

### 3. Versioning Contract

- Skill 版本历史属于稳定产品能力。
- 版本快照、恢复、差异对比与平台分发属于 Skill 域内关键流程。

### 3.1 Platform Distribution Feedback Contract

- 当用户选择符号链接方式分发 Skill 到平台目录时，PromptHub 必须明确区分“真实 symlink 成功”和“因权限/文件系统限制而回退为 copy 安装”。
- 如果主进程回退为 copy 安装，渲染层必须收到结构化结果，并向用户显示包含受影响平台与原因的警告提示。
- 回退 copy 安装仍属于成功分发，但不得伪装成普通 symlink 成功。

### 3.2 Project-Local Distribution Contract

- PromptHub 必须支持将项目级 Skill 直接分发到当前项目内的本地目录，而不强制要求先纳入 `My Skills`。
- PromptHub CLI 必须支持从现有 `My Skills` 中选择一个 Skill，并直接安装到当前项目的本地 Skill 目录，而不强制要求先在桌面端登记项目。
- 项目级分发默认目标为当前项目的 `.agents/skills`，并允许用户额外选择多个目标目录。
- 项目级分发必须复制整个 Skill 目录到 `<target>/<skill-name>/`，而不是只写单个 `SKILL.md` 文件；这是全局 Skill package contract 在项目分发场景下的具体要求。

### 4. Translation Contract

- Skill 详情页的 AI 翻译结果属于可恢复的本地用户状态。
- 翻译结果不得改写原始 `SKILL.md`，应作为 sidecar 文档保存在 Skill 本地 repo 的 `.prompthub/translations/` 目录下。
- 翻译是否仍然有效必须基于当前 `SKILL.md` 内容 fingerprint 判断，而不是仅凭页面内存态。
- 当 `SKILL.md` 变化导致旧译文失效时，UI 必须回退原文并提供明确的重翻入口。
- `.prompthub/` 目录属于 PromptHub 内部文件空间，默认不参与普通文件树、导出和分发流程。

### 5. Stable Internal Sources

- Skill 体系设计见 `spec/knowledge/structure/skill-system-design.md` 与 `spec/knowledge/structure/skill-system-design-zh.md`
- Skill 商店需求见 `spec/knowledge/structure/skill-store-requirements.md` 与 `spec/knowledge/structure/skill-store-requirements-zh.md`
- 历史测试演进与状态记录保存在 `spec/changes/legacy/docs-08-todo/`

## Stable Scenarios

### Scenario: Defining a new Skill workflow

When Skill behavior changes materially:

- contributors create a delta spec under `spec/changes/active/<change-key>/specs/skills/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: Persisting translated Skill content

When a user has already translated a Skill detail page:

- reopening the same Skill with unchanged `SKILL.md` content restores the saved sidecar translation by default
- changing `SKILL.md` content invalidates the old translation and requires a fresh translation before it is shown again

### Scenario: Recovering Skill knowledge

When historical Skill plans or test rounds are still useful but no longer current source of truth:

- they remain readable under `spec/changes/legacy/`
- they are not deleted or replaced with git-history placeholders
