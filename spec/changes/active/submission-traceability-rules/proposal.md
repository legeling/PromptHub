# Proposal

## Why

PromptHub 已经有 `spec-init` 文档体系、active change 工作流和 Conventional Commits 约定，但提交要求、文档编号、引用关联和 issue 关闭时机仍散落在 `AGENTS.md`、`docs/contributing.md` 和若干历史 change 中。

这会导致贡献者和 agent 在提交前不确定：

- 是否可以自动 commit
- 一个 commit 应该包含哪些文件
- `FR / DES / TEST / T` 编号如何使用
- commit message 是否应该引用 issue、active change 或验证命令
- 本地完成和 GitHub issue 关闭之间如何区分

## Scope

In scope:

- 新增长期规则文档，定义提交、commit、编号和引用关联要求。
- 更新 `spec/rules` 索引和相关完成定义。
- 更新对外贡献文档，使贡献者能找到同一套规则。

Out of scope:

- 修改 git hook 或 CI。
- 改变现有发布流程。
- 重写历史 active change 的编号格式。

## Risks

- 如果规则写得太重，会让小修复提交成本过高。
- 如果规则只写在内部文档，对外贡献者仍然看不到。

## Rollback Thinking

规则文档可以独立回滚；不会影响运行时代码或数据。
