# System Spec

## Purpose

本规范定义 PromptHub 当前系统级稳定真相，覆盖仓库文档分层、内部 SSD 流程、核心产品边界与稳定入口约束。

## Stable Requirements

### 1. Documentation Split

- `docs/` 只承载对外说明、部署说明、贡献说明、多语言 README 与公开图片资源。
- `spec/` 是内部 SSD/spec 系统的唯一归属。
- 内部 proposal、spec、design、tasks、implementation、architecture、issues、archive、legacy 文档不得再放回 `docs/`。

### 2. OpenSpec-Aligned Structure

- 稳定规格必须存放在 `spec/specs/`。
- 活跃变更必须使用 `spec/changes/active/<change-key>/specs/<domain>/spec.md` 表达 delta specs。
- 变更完成后必须进入 `spec/changes/archive/`，而不是直接删除。
- 历史内部文档若暂不适合改写为稳定规格，必须保存在 `spec/changes/legacy/`。

### 3. Internal Workflow

- 非 trivial 变更应先创建变更目录。
- 变更目录至少包含 `proposal.md`、`design.md`、`tasks.md`、`implementation.md` 与一个 delta spec。
- 真实落地后，稳定行为同步回 `spec/specs/`，长期架构结论同步回 `spec/architecture/`。

### 4. Content Preservation

- 迁移内部文档时必须保留原始内容，不得用“见 git 历史”代替。
- 已删除的内部文档应优先从 `HEAD` 恢复后再迁移。

## Stable Scenarios

### Scenario: Contributor needs internal truth

When a contributor needs current internal behavior or workflow guidance:

- they start from `spec/README.md`
- they locate the stable domain spec in `spec/specs/`
- they inspect `spec/changes/active/` for work in progress
- they inspect `spec/architecture/` for long-lived technical constraints

### Scenario: External reader needs public docs

When a repository visitor needs public-facing information:

- they start from `README.md` or `docs/README.md`
- they do not need to traverse internal SSD folders to onboard or deploy

## Notes

- 该规范参考 OpenSpec 的稳定 specs / delta specs / archive / iterative workflow 思想，但仍保留 PromptHub 自己的 `legacy` 与 `issues` 分层，以容纳历史内部文档与持续质量跟踪。
