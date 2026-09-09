# PromptHub Submission and Traceability Rules

本规则定义 PromptHub 的提交、commit、文档编号和引用关联要求。它适用于人类贡献者和 AI agent。

## 1. 提交边界

- AI agent 不得自动 commit；只有用户明确要求“提交 / commit / 分批提交 / 推送”时才能执行 git 提交动作。
- 提交前必须先查看 `git status --short`，区分本轮改动、用户改动和其他 agent 改动。
- 不得 stage 或提交与本轮目标无关的脏文件。
- 每个 commit 必须是一个独立、可回滚的逻辑单元；不要把功能、bugfix、文档迁移和格式化混成一个提交。
- 大改动应按可验证边界分批提交，例如 `docs`、`test`、`fix`、`feat`、`refactor` 分开。
- 如果远端或工作区存在其他 agent 的并行改动，提交前必须再次确认 status，并只提交当前批次文件。

## 2. Commit Message

PromptHub 使用 Conventional Commits：

```text
<type>(optional-scope): <imperative summary>
```

常用类型：

- `feat`: 新功能或用户可见能力
- `fix`: bug 修复
- `docs`: 文档、spec、README、贡献指南
- `test`: 测试补充或测试基础设施
- `refactor`: 不改变外部行为的结构调整
- `perf`: 性能优化
- `chore`: 构建、脚本、依赖、发布辅助
- `style`: 纯格式或样式调整，且不改变行为

要求：

- summary 使用祈使语气，简短描述“做什么”，例如 `fix: skip web auth captcha when disabled`。
- scope 可选，但建议用于跨域仓库，例如 `fix(web): ...`、`docs(spec): ...`、`feat(desktop): ...`。
- 非 trivial commit 必须包含正文；只有 Conventional Commit 标题不算完整提交。
- 正文必须记录提交目的、已有主题、change 或 issue 关联（存在时）、实际验证命令和结果；影响范围或残余风险存在时也必须记录。
- 不要在 commit message 中写密钥、真实部署地址、私有路径或个人账号信息。

最低 body 格式：

```text
Summary:
<why this commit exists>

Refs:
- Topic or plan: <existing path, when present>
- Issue: #<issue-number> (when present)

Verification:
- <command>: passed
- <not-run check and reason, when applicable>
```

纯机械、单文件且不改变行为边界的 trivial commit 可以省略正文，但仍必须满足原子提交、工作区隔离和实际验证要求。任何关联 issue、active change、用户流程、公共契约、持久化、同步、安全或发布状态的提交都不属于 trivial commit。

只有在目标版本已经发布、且确实要关闭 GitHub issue 时，才使用 `Closes #<issue-number>`。本地实现完成但尚未发布时使用 `Refs #<issue-number>`，并在 `spec/issues/active/local-github-status.md` 标记本地状态。

## 3. 关联与提交前检查

文档投入、编号及生命周期遵循 [文档规则](document-routing-rules.md)。不为提交补建 change 或五件套；已有编号保持稳定，显式启用的追踪关系继续维护。

提交前检查工作区和暂存区归属、原子性、最低有效验证及未验证风险。非 trivial 正文必须说明目的和真实验证；有主题、计划、issue 或 ADR 时引用其现有路径，没有时直接说明问题及验收，不为了填引用创建空文档。受影响约定与本地交付状态应准确。

## 6. PR / 发布关联

- PR 描述应说明动机、影响范围、验证方式、残留风险和相关主题或计划（存在时）。
- PR 不应把 “local_done / release_pending” 的 GitHub issue 提前关闭。
- 版本发布后，才根据发布内容关闭对应 GitHub issue，并刷新 `spec/issues/active/github-open.md` 与 `spec/issues/archive/github-closed.md`。
- 发布型 commit 或 PR 应额外引用 `spec/releases/` 中的版本记录。
