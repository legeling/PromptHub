# PromptHub Workflow Design

`spec/workflow/02-design/README.md` 是 PromptHub 当前项目级 design 主入口，回答“PromptHub 怎么交付这些能力”。

## 当前系统级设计轮廓

### 1. 多端结构

PromptHub 当前由三类主要运行面组成：

- `apps/desktop`：Electron 本地优先桌面应用
- `apps/web`：自部署 Web 版本
- `apps/cli`：命令行入口

### 2. 长期稳定真相源分层

PromptHub 当前把长期设计事实拆成以下几层：

- `spec/workflow/*`：项目级目标、需求、设计、验证与任务入口
- `spec/knowledge/context/`：稳定业务背景与产品边界
- `spec/knowledge/structure/`：长期架构约束与模块设计说明
- `spec/knowledge/behavior/`：长期业务行为与规则语义
- `spec/knowledge/reference/`：平台矩阵、固定资源、canonical 约定
- `spec/releases/`：发布规则与交付摘要

### 3. 主题设计

设计归属和投入见 [文档规则](../../rules/document-routing-rules.md)。本入口只导航，不保存另一套需求。高风险变化的所有权、兼容和恢复设计可放在主题内；已有专项设计保留独有内容。

## 当前设计入口建议

- 桌面端长期设计事实：`spec/knowledge/behavior/desktop.md` 与 `spec/knowledge/structure/`
- Skill 体系：`spec/knowledge/behavior/skills.md` 与 `spec/knowledge/structure/skill-system-design.md`
- Web 边界：`spec/knowledge/behavior/web.md`
- Rules 逻辑：`spec/knowledge/behavior/rules-workspace.md`
- Agent 平台矩阵：`spec/knowledge/reference/agent-platforms.md`
