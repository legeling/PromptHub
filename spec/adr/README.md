# PromptHub ADR

`spec/adr/` 对齐 `spec-init` 的 ADR 边界，用来记录关键架构和工程决策。

在锁定的 `spec-init` 基线（`f83def1`）中，这一层属于 `records.decisions`。

PromptHub 当前稳定架构事实主要保存在：

- `spec/knowledge/structure/`

如果后续要把重大决策按独立 ADR 文档编号管理，可以从这个目录开始补充。

新 ADR 使用 `ADR-YYYYMMDD-NNN-<slug>.md`，从
`spec/adr/record-template.md` 开始，并按
`spec/rules/document-routing-rules.md` 更新本索引。现有稳定架构文档不因
此规则被追溯重命名。

## ADR Index

| ID               | Title                                    | Status     | Path                                                           | Related change/issue                                                   | Updated    |
| ---------------- | ---------------------------------------- | ---------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| ADR-20260801-001 | Web Agent server-host inventory boundary | Superseded | `spec/adr/ADR-20260801-001-web-agent-server-host-inventory.md` | `web-agent-management`                                                 | 2026-08-02 |
| ADR-20260802-001 | Self-hosted Web Agent service parity     | Accepted   | `spec/adr/ADR-20260802-001-web-agent-service-parity.md`        | `web-agent-service-parity`                                             | 2026-08-02 |
| ADR-20260811-001 | Storage authority and evolution          | Accepted   | `spec/adr/ADR-20260811-001-storage-authority-and-evolution.md` | `database-migration-safety`, `official-cloud-backup-and-saas-platform` | 2026-08-11 |
| ADR-20260820-001 | Desktop settings authority               | Accepted   | `spec/adr/ADR-20260820-001-desktop-settings-authority.md`      | `desktop-settings-authority-convergence`                               | 2026-08-20 |

## Routing Rule

- 重大架构或工程决策 -> `spec/adr/`
- 一般设计说明仍优先保留在 `spec/workflow/02-design/README.md`、`spec/knowledge/structure/` 或当前 change 的 `design.md`
