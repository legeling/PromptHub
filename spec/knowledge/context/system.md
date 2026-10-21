# System Spec

## Purpose

本规范定义 PromptHub 当前系统级稳定真相，覆盖仓库文档分层、内部 SSD 流程、核心产品边界与稳定入口约束。

## Stable Requirements

### 1. Documentation Split

- `docs/` 只承载对外说明、部署说明、贡献说明、多语言 README 与公开图片资源。
- `spec/` 是内部 SSD/spec 系统的唯一归属。
- 内部 proposal、spec、design、tasks、implementation、architecture、issues、archive、legacy 文档不得再放回 `docs/`。

### 2. Stable Documentation Structure

- 项目级稳定文档必须存放在 `spec/workflow/*`、`spec/knowledge/*`、`spec/rules/`、`spec/releases/`、`spec/adr/`。
- 现行需求原位维护；是否需要独立变更目录及其文件数量由 [文档规则](../../rules/document-routing-rules.md) 决定。
- 完成或被替代的计划更新终态并从 active 移入 completed，合并有效设计、修正引用和索引；较早日期归档保留原位。
- 历史内部文档若暂不适合改写为稳定规格，必须保存在 `spec/changes/legacy/`。
- `spec/issues/active/` 必须保存当前仍在跟踪的问题记录，`spec/issues/archive/` 必须保存已关闭或仅保留历史参考价值的问题记录。

### 3. Internal Workflow

- 按风险更新受影响的权威主题；跨会话工作按需保留一份计划，不要求五文件骨架或逐阶段登记。
- 真实落地后，稳定结果同步回 `spec/workflow/*`、`spec/knowledge/*`、`spec/rules/`、`spec/releases/` 或 `spec/adr/`。

### 4. Content Preservation

- 迁移内部文档时必须保留原始内容，不得用“见 git 历史”代替。
- 已删除的内部文档应优先从 `HEAD` 恢复后再迁移。

## Stable Scenarios

### Scenario: Contributor needs internal truth

When a contributor needs current internal behavior or workflow guidance:

- they start from `spec/README.md`
- they locate the stable project doc in `spec/workflow/` or `spec/knowledge/`
- they inspect `spec/changes/active/` for work in progress
- they inspect `spec/knowledge/structure/` for long-lived technical constraints
- they inspect `spec/knowledge/behavior/` and `spec/knowledge/reference/` when they need durable rules, matrices, or canonical source mappings
- they inspect `spec/issues/active/` and `spec/issues/archive/` when they need current issue context or historical issue records

### Scenario: External reader needs public docs

When a repository visitor needs public-facing information:

- they start from `README.md` or `docs/README.md`
- they do not need to traverse internal SSD folders to onboard or deploy

## Notes

- 该规范参考 OpenSpec 的稳定 specs / delta specs / archive / iterative workflow 思想，但仍保留 PromptHub 自己的 `legacy` 与 `issues` 分层，以容纳历史内部文档与持续质量跟踪。
