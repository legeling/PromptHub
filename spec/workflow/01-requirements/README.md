# PromptHub Workflow Requirements

`spec/workflow/01-requirements/README.md` 是 PromptHub 当前项目级 requirements 主入口，回答“PromptHub 要交付什么”。

## 项目级需求轮廓

### FR-001 统一管理 AI 工作流资产

PromptHub 必须让用户在同一工作区中管理 Prompt、Skill、Rules 与项目级 AI 资产，而不是依赖多个工具目录分散维护。

### FR-002 本地优先 + 可恢复

PromptHub 必须默认以本地优先方式保存用户数据，并提供同步、备份、恢复、迁移与版本历史能力。

### FR-003 支持多平台 Skill 分发

PromptHub 必须支持把同一份 Skill 分发到多个 AI 工具平台，并允许用户控制平台目录、分发模式和项目级目标。

### FR-004 支持桌面端与自部署 Web 协同

PromptHub 必须支持桌面端作为主工作区，同时允许 Web 作为浏览器访问入口和同步目标。

### FR-005 文档与实现必须可追踪

需求与验收直接关联实际测试、命令或人工步骤；文档投入及计划规则见 [文档规则](../../rules/document-routing-rules.md)。

## 非功能需求轮廓

### NFR-001 本地数据安全

本地数据能力必须覆盖加密、主密码、迁移安全、升级恢复与备份边界。

### NFR-002 跨平台可用性

桌面端必须持续支持 macOS / Windows / Linux。

### NFR-003 文档体系可演进

内部 `spec/` 体系必须允许长期演进，并能兼容 `spec-init` 文档边界与现有 PromptHub change workflow。

## 当前稳定需求真相源

- `spec/workflow/00-intake/README.md`
- `spec/knowledge/context/system.md`
- `spec/knowledge/behavior/desktop.md`
- `spec/knowledge/behavior/web.md`
- `spec/knowledge/behavior/skills.md`
- `spec/knowledge/behavior/sync.md`
- `spec/releases/release-rules.md`

## 使用规则

按 [文档规则](../../rules/document-routing-rules.md) 原位维护本主题，其他入口只引用其权威定义。
