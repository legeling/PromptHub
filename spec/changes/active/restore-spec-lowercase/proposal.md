# Proposal

## Why

仓库发生了一次大小写不敏感文件系统上的迁移事故：删除旧大写目录时连同新建的小写 `spec/` 一起删掉，导致内部 SSD/spec 体系丢失了工作区文件。

这次变更的目标不是简单重建目录壳子，而是完整恢复并完成原本想要的小写 `spec/` 方案：

- `spec/` 成为内部 SSD 唯一归属
- `docs/` 只保留对外文档
- 从 `HEAD` 恢复原本被删的内部文档原文
- 对齐 OpenSpec 核心结构，并补齐上一版缺失的能力

## Scope

- In scope:
  - 重建顶层 `spec/`
  - 恢复 `docs/architecture/*`
  - 恢复 `docs/08-TODO/*`
  - 恢复 `docs/09-问题追踪/active/*`
  - 更新 `AGENTS.md`、`README.md`、`docs/README.md`、`docs/contributing.md`
  - 消除对旧大写目录的 canonical 引用
- Out of scope:
  - 代码逻辑变更
  - 提交 git commit

## Risks

- 历史文档迁移时若只恢复目录结构，可能造成真实内容丢失
- 若入口文档未同步，贡献者会继续把内部文档写回 `docs/`

## Rollback Thinking

- 这次变更仅修改工作区文档结构；如需回滚，可通过 git diff 回退本次工作区改动
