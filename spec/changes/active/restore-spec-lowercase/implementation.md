# Implementation

## Shipped

- 恢复并重建了小写 `spec/` 体系
- 从 `HEAD` 恢复内部文档原文并完成迁移
- 补齐了稳定 specs、active changes、archive、legacy、issues、templates
- 将稳定 specs 从最初的 `system / web / skills` 扩展到 `desktop / sync / data-recovery / release / prompt-workspace`
- 把关键历史主题整理为更标准的 archive change 目录，包括 monorepo migration、server API design、web self-hosted plan、web data-layout migration、test infrastructure evolution、yolo evolution
- 为 `spec/changes/_templates/` 增加了 README，明确 PromptHub 如何对齐 OpenSpec 的 stable specs / delta specs / archive 逻辑
- 更新了仓库关键入口，使 `docs/` / `spec/` 职责更清晰

## Verification

- 通过 `git show HEAD:<path>` 对照恢复原文
- 通过仓库搜索检查旧大写目录 canonical 引用
- 通过 `docs/` 目录核对其仅保留对外文档

## Synced Docs

- `README.md`
- `docs/README.md`
- `docs/contributing.md`
- `AGENTS.md`
- `spec/README.md`
- `spec/specs/*`

## Follow-ups

- 若后续继续推进旧变更归档，可继续把剩余 legacy 文档逐步提升为更标准的 archived changes
- 如未来领域继续扩大，可把 `spec/specs/` 按更细 domain 继续拆分
