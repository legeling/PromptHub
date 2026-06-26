# PromptHub Documentation Sync Rules

## 基本原则

- 代码、测试、README 和内部 spec 必须一起演进。
- 文档不是发布后补写的说明书，而是实现前后的工作约束。

## 同步要求

- 需求变化：更新 `spec/workflow/01-requirements/README.md`
- 设计变化：更新 `spec/workflow/02-design/README.md`
- 长期稳定业务、结构或规则变化：更新 `spec/knowledge/`
- 实施节奏变化：更新 `spec/workflow/03-implementation/README.md`
- 验证策略变化：更新 `spec/workflow/04-verification/README.md`
- 任务拆解变化：更新 `spec/workflow/05-tasks/README.md`
- 新需求、bugfix、重构：更新 `spec/changes/active/` 或归档位置
- 版本发布变化：更新 `spec/releases/` 以及对外 release surface
- 项目结构变化：同步更新 `README.md`、`AGENTS.md`、`spec-init.topology.yml` 和 `spec/rules/document-routing-rules.md`

## 审查问题

- 这次改动还能否回链到 `FR -> DES -> TEST -> T`
- 是否产生了新的 `[待确认]`
- 是否有新规则只停留在聊天里，尚未沉淀进 `spec/rules/`
- 是否只改了 workflow，却忘记同步 knowledge 或 changes
- commit / PR 是否引用了对应 active change、issue、本地验证结果和发布状态
