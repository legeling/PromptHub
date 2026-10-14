# Spec Issues

`spec/issues/` 用于存放 PromptHub 内部 SSD 视角下的问题跟踪，而不是对外 issue 模板或零散聊天记录。

在锁定的 `spec-init` 基线（`f83def1`）中，这一层属于 `records.issues`。

## Structure

- `active/`：当前仍在跟踪的问题，包括内部质量跟踪与当前 open GitHub issues 快照。
- `archive/`：已关闭或仅保留历史参考价值的问题记录。

## Current Records

- [Codex / Claude 适配核查](active/ISS-20261013-002-codex-claude-adaptation-audit.md)：MCP 原生字段、Plugin 包识别与加载、Provider 协议、配置根、Rules 及相关 issue 状态。
- [Antigravity 适配核查](active/ISS-20261013-001-antigravity-adaptation-audit.md)：CLI/IDE 目录、MCP 导入/认证/脱敏、Plugin 生命周期、Rules 与原生验收差异；关联 #220/#226。

- `active/quality.md`：内部质量与工具链问题跟踪。
- `active/github-open.md`：当前 `legeling/PromptHub` 仓库 open issues 快照。
- `active/local-github-status.md`：本地 triage / delivery 状态覆盖层，用于记录已实现但尚未发布的问题。
- `active/ISS-20260710-001-spec-governance-debt.md`：spec-init 对齐后发现的 active-change、生命周期和索引治理欠账。
- `active/ISS-20260809-001-remaining-open-issues-roadmap.md`：当前 open GitHub issues 的真实剩余工作分类、优先级与 authoritative change 路由。
- `active/ISS-20260820-001-rules-restore-conflict-data-loss.md`：#209/#210 Rules 恢复静默覆盖外部文件并损失可恢复历史的关键数据风险。
- `active/ISS-20260902-001-git-transport-resilience-parity.md`：Skill #211 修复后，Plugin、CLI 与显式 Git 操作仍需分别决定 archive fallback 或明确 Git 前置条件。
- `archive/github-closed.md`：当前 `legeling/PromptHub` 仓库 closed issues 快照。

## Internal Record Index

| ID                 | Title                            | Status | Path                                                                      | Related change/issue                      | Updated    |
| ------------------ | -------------------------------- | ------ | ------------------------------------------------------------------------- | ----------------------------------------- | ---------- |
| `ISS-20260710-001` | Spec Governance Debt             | open   | `spec/issues/active/ISS-20260710-001-spec-governance-debt.md`             | `2026-07-10-spec-init-upstream-alignment` | 2026-07-10 |
| `ISS-20260809-001` | Remaining Open Issues Roadmap    | open   | `spec/issues/active/ISS-20260809-001-remaining-open-issues-roadmap.md`    | Multiple routed active changes            | 2026-10-03 |
| `ISS-20260820-001` | Rules Restore Conflict Data Loss | open   | `spec/issues/active/ISS-20260820-001-rules-restore-conflict-data-loss.md` | `rules-managed-copies`, #209, #210        | 2026-08-20 |
| `ISS-20260902-001` | Git Transport Resilience Parity  | open   | `spec/issues/active/ISS-20260902-001-git-transport-resilience-parity.md`  | `skills-issue-211-git-http-fallback`      | 2026-09-02 |
| `ISS-20260806-001` | MCP Issues 200-202 Triage        | closed | `spec/issues/archive/ISS-20260806-001-mcp-issue-triage.md`                | `0.6.0-beta.1`, #200, #201, #202          | 2026-08-20 |
| `ISS-20261013-001` | Antigravity Adaptation Audit | open | `spec/issues/active/ISS-20261013-001-antigravity-adaptation-audit.md` | #220, #226, #197, #212, #190, #203 | 2026-10-13 |
| `ISS-20261013-002` | Codex / Claude Adaptation Audit | open | `spec/issues/active/ISS-20261013-002-codex-claude-adaptation-audit.md` | #190, #194, #196, #197, #209, #210, #212 | 2026-10-13 |

## GitHub vs Local State

GitHub issue state and PromptHub local delivery state are intentionally separate:

- `github-open.md` / `github-closed.md` only mirror remote GitHub state.
- `local-github-status.md` records local statuses such as `untriaged`, `accepted`, `in_progress`, `local_done`, `release_pending`, `released`, `wontfix`, and `duplicate`.
- A locally completed issue remains open on GitHub until the target release has shipped.
- After a release ships, close the GitHub issue publicly, then refresh both snapshots.

This prevents the project from closing user-reported issues before users can download a build that contains the fix.

## Sync Note

- 当前 GitHub issue 清单通过 GitHub CLI 手工同步到仓库。
- 本轮同步时间：`2026-10-03`。远端当前为 42 个 open issue、155 个 closed issue，
  两份快照无重叠。
- 相比上次快照新增 #212、#215、#216、#217、#218、#219、#220、#221；
  #211 已在远端关闭。PR #222/#223 不计入 issue 数量。
- 当前逐项核查与实施顺序由 `active/ISS-20260809-001-remaining-open-issues-roadmap.md`
  维护；远端列表同步不代表本地实现或发布验收完成。
- #187、#200、#201、#202 已随 `0.6.0-beta.1` 发布并关闭；#199 已链接
  #198 后按 duplicate 关闭；#207 因不属于 PromptHub 产品仓库范围关闭。
- 新增 #204、#205 的本地未分类记录；#209、#210 作为 Rules 恢复数据风险
  路由到 `rules-managed-copies`，不因 Beta 发布而关闭。
- #203 仍为 `in_progress`，对应 active change 为
  `mcp-version-history-and-projection-safety`。
- 2026-10-03 起逐项核查当前 42 个未关闭问题，先处理升级阻塞、数据安全和
  现有功能缺陷，再核验已有实现与补齐增量功能。移动端、Windows 签名、
  云端协作、外部商店和 Git 远端备份仍须明确外部依赖与验收条件。
- MCP issue triage 已在发布后归档到
  `archive/ISS-20260806-001-mcp-issue-triage.md`。
- 如果 GitHub issue 状态发生明显变化，或某个 active change 依赖 issue 上下文，应优先刷新这里的快照。
- 如果只是本地实现状态变化，更新 `active/local-github-status.md`，不要手改 GitHub 快照文件。

## Routing Rule

- 未解决问题、风险、技术债、外部 issue 快照 -> `spec/issues/`
- 单次变更的实施细节和验证不写在这里，应写回 `spec/changes/active/<change-key>/`
