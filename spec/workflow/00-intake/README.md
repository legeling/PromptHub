# PromptHub Workflow Intake

`spec/workflow/00-intake/README.md` 是 PromptHub 当前项目级 intake 主入口，主要回答“这件事为什么值得做”。

## 项目背景

PromptHub 是一个本地优先的 Prompt、Skill、Rules 与 AI 编程资产工作台，当前同时覆盖：

- Electron 桌面应用
- 自部署 Web 版本
- CLI
- Prompt / Skill / Rules / 项目级资产工作区
- 本地优先存储、同步、备份恢复、平台分发

它不是单一的 Prompt 编辑器，也不是单一的 Skill 商店，而是一个围绕 AI 工作流资产管理构建的本地工作区。

## 目标用户

- 需要长期维护 Prompt 与 Skill 的个人开发者
- 同时使用多个 AI 编程工具的重度用户
- 需要本地优先存储、版本历史、同步和备份能力的用户
- 想在项目上下文里管理 `.agents/skills`、Rules、Prompt 与其他 AI 资产的用户

## 当前核心价值

- 把分散在不同 AI 工具目录中的 Prompt / Skill / Rules 统一纳入一个工作区
- 用版本历史、分发、翻译、测试、同步、备份恢复等能力降低资产管理成本
- 让桌面端、本地项目和自部署 Web 形成一致的资产流转体验

## 当前非目标

- 不提供官方云托管服务
- 不把 Web 版本做成完全替代桌面端的云协作产品
- 不把 `spec-init` 接入变成一次性重写全部 `spec/` 文档的迁移工程

## 当前约束

- PromptHub 已有一套稳定的 `spec/knowledge/ + spec/changes/active/` 文档体系，不能再引入第二套并行主入口
- 桌面、Web、CLI 三端共享部分语义，但仍有各自边界
- 许多内部文档已经作为稳定真相源或历史记录被引用，需要兼容迁移

## 当前阶段建议入口

- 系统背景与总规范：`spec/knowledge/context/system.md`
- 桌面端：`spec/knowledge/behavior/desktop.md`
- Web：`spec/knowledge/behavior/web.md`
- Skills：`spec/knowledge/behavior/skills.md`
- 发布：`spec/releases/release-rules.md`

## 使用规则

- 项目级背景、目标、约束和非目标先写在 intake
- 单次改动的 proposal / delta spec 继续写进 `spec/changes/active/<change-key>/`
- 本入口承担 `specify` 的背景部分；影响范围、数据、权限、兼容性或发布语义的关键疑点进入 `clarify`，不得静默带入实现
