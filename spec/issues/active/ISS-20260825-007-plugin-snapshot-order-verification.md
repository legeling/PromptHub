# Plugin Update Rejects Equivalent Multi-File Snapshot Order

## Record

- ID: `ISS-20260825-007`
- Status: local_done (release pending)
- Severity: high Plugin update blocker
- Owning change: `spec/changes/active/agent-management-workbench/`
- First local triage: 2026-08-25
- Automated evidence:
  `apps/desktop/tests/e2e/agent-plugin-lifecycle.spec.ts`

## Confirmed Phenomenon

After a local Plugin source update was detected in a real restarted Electron
profile, applying it failed with
`Canonical Plugin publication verification failed: versions`. The canonical
package remained on the prior revision because the transaction rolled back.

## Root Cause

`readPluginPackageSnapshot` emitted files in breadth-first filesystem traversal
order. Canonical resource publication sorts payload paths before writing and
reread therefore rebuilt the same snapshot bytes in lexical path order. A
multi-directory package produced equal files in a different array order, so
strict canonical verification rejected the equivalent snapshot.

## Resolution

Plugin package snapshots are sorted once by normalized relative path at their
shared creation boundary. Export, version creation, canonical publication, and
verification now consume the same deterministic order without re-sorting at
each caller.

Traceability: `FR-AGENT-136 -> DES-AGENT-155 -> TEST-AGENT-217 ->
T-AGENT-226`.

## Verification

- The existing snapshot export test now asserts the returned order directly
  instead of sorting the actual value and passes.
- The canonical local-source update test passes with root files, nested Skill,
  command, workflow, manifest, MCP, and unrelated files.
- Desktop and Core typechecks and the desktop production build passed.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`apps/desktop/tests/unit/main/plugin-library-validation-versions.test.ts`。
- 场景与边界：`exports and restores managed plugin package snapshots`：直接断言 snapshot 返回顺序，不先排序实际值掩盖问题；跨发布/更新验证另见 `packages/core/tests/canonical-plugin-library.test.ts`。
- 根目录命令：`pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/plugin-library-validation-versions.test.ts`。
- 接入：所属 package 的常用 Vitest 入口；本次完整 snapshot 文件重跑通过：15 个用例；共用 Core 文件的 14 个用例也通过，不重复计数。
