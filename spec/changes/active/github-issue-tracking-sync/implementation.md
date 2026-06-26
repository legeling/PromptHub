# Implementation

## Shipped

- 为 `spec/issues/` 增加了专门的导航入口 `spec/issues/README.md`，明确 active / archive 双层结构。
- 新增 `spec/issues/active/github-open.md`，记录当前 `legeling/PromptHub` 仓库的 open GitHub issues 快照。
- 新增 `spec/issues/archive/github-closed.md`，记录当前 `legeling/PromptHub` 仓库的 closed GitHub issues 快照。
- 更新 `spec/README.md`，把 `spec/issues/archive/` 和 `spec/issues/README.md` 纳入目录地图与职责说明。
- 更新 `spec/knowledge/context/system.md`，把 `spec/issues/archive/` 纳入稳定结构约束，并补充贡献者查看 issue 上下文的场景。
- 已在 `2026-05-27` 刷新 GitHub issue 快照：open issues 从 `34` 变为 `30`，closed issues 从 `90` 变为 `106`。
- 已在 `2026-06-24` 刷新 GitHub issue 快照：open issues 为 `31`，closed issues 为 `129`，且 open / closed 无重叠。
- 新增 `spec/issues/active/local-github-status.md`，把 GitHub 远端状态和 PromptHub 本地 delivery 状态拆开记录。
- 更新 `AGENTS.md`，明确本地 `local_done` / `release_pending` 不等于 GitHub closed；只有目标版本发布后才关闭 GitHub issue。

## Verification

- `gh repo view --json nameWithOwner,url`
- `gh issue list --state open --limit 200 --json number,title,state,labels,assignees,updatedAt,createdAt,closedAt,url`
- `gh issue list --state closed --limit 200 --json number,title,state,labels,assignees,updatedAt,createdAt,closedAt,url`
- `GitHub REST API /repos/legeling/PromptHub/issues?state=open&per_page=100`
- `GitHub REST API /repos/legeling/PromptHub/issues?state=closed&per_page=100`
- Open / closed overlap check: `0`

## Synced Docs

- `spec/issues/README.md`
- `spec/issues/active/github-open.md`
- `spec/issues/active/local-github-status.md`
- `spec/issues/archive/github-closed.md`
- `AGENTS.md`
- `spec/README.md`
- `spec/knowledge/context/system.md`

## Follow-ups

- 后续如果 issue 刷新频率变高，可以考虑引入脚本自动生成 open/closed snapshot，减少手工维护成本。
- 当前 issue snapshot 只记录列表级元数据；如果后续需要 triage 深度，可以再补“高优先级 issue 明细”文档。
