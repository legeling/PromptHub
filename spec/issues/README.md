# Spec Issues

`spec/issues/` 用于存放 PromptHub 内部 SSD 视角下的问题跟踪，而不是对外 issue 模板或零散聊天记录。

在最新 `spec-init` 拓扑中，这一层属于 `records.issues`。

## Structure

- `active/`：当前仍在跟踪的问题，包括内部质量跟踪与当前 open GitHub issues 快照。
- `archive/`：已关闭或仅保留历史参考价值的问题记录。

## Current Records

- `active/quality.md`：内部质量与工具链问题跟踪。
- `active/github-open.md`：当前 `legeling/PromptHub` 仓库 open issues 快照。
- `archive/github-closed.md`：当前 `legeling/PromptHub` 仓库 closed issues 快照。

## Sync Note

- 当前 GitHub issue 清单通过 `gh issue list` 手工同步到仓库。
- 本轮同步时间：`2026-06-03`。
- 如果 GitHub issue 状态发生明显变化，或某个 active change 依赖 issue 上下文，应优先刷新这里的快照。

## Routing Rule

- 未解决问题、风险、技术债、外部 issue 快照 -> `spec/issues/`
- 单次变更的实施细节和验证不写在这里，应写回 `spec/changes/active/<change-key>/`
