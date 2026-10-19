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
| `ISS-20260809-001` | Remaining Open Issues Roadmap | open | `active/ISS-20260809-001-remaining-open-issues-roadmap.md` | 42 reports reviewed; 6 closed, 36 remain open | 2026-10-19 |
| `ISS-20260820-001` | Rules Restore Conflict Data Loss | open   | `spec/issues/active/ISS-20260820-001-rules-restore-conflict-data-loss.md` | `rules-managed-copies`, #209, #210        | 2026-08-20 |
| `ISS-20260902-001` | Git Transport Resilience Parity  | open   | `spec/issues/active/ISS-20260902-001-git-transport-resilience-parity.md`  | `skills-issue-211-git-http-fallback`      | 2026-09-02 |
| `ISS-20260806-001` | MCP Issues 200-202 Triage        | closed | `spec/issues/archive/ISS-20260806-001-mcp-issue-triage.md`                | `0.6.0-beta.1`, #200, #201, #202          | 2026-08-20 |
| `ISS-20261013-001` | Antigravity Adaptation Audit | open | `spec/issues/active/ISS-20261013-001-antigravity-adaptation-audit.md` | #220, #226, #197, #212, #190, #203 | 2026-10-13 |
| `ISS-20261013-002` | Codex / Claude Adaptation Audit | open | `spec/issues/active/ISS-20261013-002-codex-claude-adaptation-audit.md` | #190, #194, #196, #197, #209, #210, #212 | 2026-10-13 |

## GitHub vs Local State

GitHub issue state and PromptHub local delivery state are intentionally separate:

- `github-open.md` / `github-closed.md` only mirror remote GitHub state.
- `local-github-status.md` records local statuses such as `untriaged`, `accepted`, `in_progress`, `local_done`, `release_pending`, `released`, `wontfix`, and `duplicate`.
- Issue closure follows [the issue-management rules](../rules/issue-management-rules.md): a complete verified fix may close independently of release; partial work remains open.
- Verify remote state before refreshing snapshots. Publication or local audit alone does not authorize remote comments or closure.

This separates implementation, issue closure and publication instead of treating any one as proof of the other two.

## Sync Note

- Latest capture: **2026-10-19**, via GitHub CLI; **36 open / 181 closed / 217 total**.
  The two snapshots are disjoint and exclude pull requests.
- Compared with 2026-10-16, #240–#243 are new. Following isolated Electron
  reproduction, #241/#216/#210/#191/#188 were commented on and closed with
  explicit user authorization; GitHub closure was verified.
- [The complete 42-report release review](active/ISS-20260809-001-remaining-open-issues-roadmap.md)
  compares the original open reports with the **published** 0.6.0 commit `36401160`,
  not current main or the stale local tag.
- The original seven-fix conclusion is corrected: published 0.6.0 scans all Claude
  files but drops same-platform entries from the sidebar. Follow-up `f1faa73f`
  repairs #196 and its push automatically closed the issue; this is not a release.
  #239 stays open pending native Windows verification. The original 35-item
  classification remains historical; #240/#242/#243 now have committed repairs
  with their remaining native acceptance recorded in the roadmap.
- [The local overlay](active/local-github-status.md) now records completed
  0.6.0 work as released while preserving scoped test evidence and unverified
  platform/reporter boundaries.
- The authorized split commits were pushed to main on 2026-10-19. No tag or
  release was created; issue closure does not publish a binary fix.
- If only local implementation changes, update the overlay; do not infer a new
  remote status for either snapshot.

## Routing Rule

- 未解决问题、风险、技术债、外部 issue 快照 -> `spec/issues/`
- 单次变更的实施细节和验证不写在这里，应写回 `spec/changes/active/<change-key>/`
