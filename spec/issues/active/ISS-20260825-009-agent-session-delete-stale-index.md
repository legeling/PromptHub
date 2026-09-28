# ISS-20260825-009: Deleted Agent session returns after restart

- Status: resolved locally
- Severity: high
- Owner: `agent-management-workbench`
- Verification: `E2E-AGENT-010`

## Phenomenon

Deleting a Claude session removed its native JSONL file and immediately removed
the row from the Agent Sessions UI. Relaunching Electron with the same profile
showed the deleted row again. Opening it displayed `Failed to read this session.`

## Root Cause

`createAgentSessionIndexService().delete()` delegated only to the native session
reader. When local session indexing was enabled, the matching
`agent_session_index` row stayed `present`, so the next launch projected stale
metadata instead of the now-empty native source.

## Resolution

After a successful native deletion, remove the exact `(source_id, external_id)`
row from the rebuildable local index. Native deletion remains first so a failed
native operation cannot hide an existing session from the index.

## Verification

- Database coverage asserts exact-row deletion, sibling preservation, repeat
  deletion, and malformed identity rejection.
- Service coverage asserts both index-disabled and index-enabled deletion.
- Real Electron coverage asserts the native file is absent immediately and the
  deleted session remains absent after restart.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`apps/desktop/tests/unit/main/agent-session-index-service.test.ts`。
- 场景与边界：带本 issue ID 的两条用例：真实磁盘 SQLite 与原生 JSONL，删除后关闭并重开数据库，不先 refresh，确认首屏列表无已删除行且兄弟会话未变；注入原生删除失败后重开，确认文件与索引均保留。不是 Electron 进程重启验收。
- 根目录命令：`pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/agent-session-index-service.test.ts -t ISS-20260825-009`。
- 接入：所属 package 的常用 Vitest 入口；本次完整 service 文件通过：20 个用例（含新增的两条带 issue ID 回归）；未重跑 Electron。
