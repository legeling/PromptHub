# Canonical Plugin Loses Its Local Update Source

## Record

- ID: `ISS-20260825-006`
- Status: local_done (release pending)
- Severity: high Plugin update blocker
- Owning change: `spec/changes/active/agent-management-workbench/`
- First local triage: 2026-08-25
- Automated evidence:
  `apps/desktop/tests/e2e/agent-plugin-lifecycle.spec.ts`

## Confirmed Phenomenon

After a real local Plugin import succeeded, changing the original package and
requesting update status failed with `writing-tools 没有可更新的本地来源`.
Import, canonical package publication, and renderer refresh had completed.

## Root Cause

The imported entry initially sets `source.url` to the absolute local package
path. Canonical Plugin publication deliberately removes local repository and
package paths and accepts only HTTP(S) values for `source.url`. The canonical
reread therefore returns a local source with no device-local location, while
`buildPreviewForLocalSource` requires that location for every update check.

## Resolution

The package remains durably owned by its canonical bundle under
`data/plugins/<plugin-id>`. The existing device projection now stores the
bounded absolute source locator by Plugin ID. Canonical reread overlays that
locator only for local Plugins; portable resources and version snapshots still
strip it. Legacy projection files without source locators remain readable, and
deletion removes the locator through the existing atomic publication.

Source roots are revalidated before comparison. Missing roots return
`MISSING_SOURCE`; symbolic-link roots and malformed projection paths fail
closed without changing the canonical bundle or versions.

Traceability: `FR-AGENT-136 -> DES-AGENT-155 -> TEST-AGENT-217 ->
T-AGENT-226`.

## Verification

- 19 canonical resource/library tests passed, including legacy projection,
  Unicode and special paths, malformed/relative/oversized paths, unknown IDs,
  canonical reread, update, snapshot, missing source, and symbolic-link source.
- 51 related Plugin validation, distribution, import, version, and source
  reconciliation tests passed.
- Core and Desktop typechecks, traceability, Prettier, and the desktop
  production build passed.
- The real Electron lifecycle passed import, durable canonical package checks,
  copy distribution/removal, restart, source update, previous-package snapshot,
  UI delete, and final restart absence while preserving an unrelated target
  file.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`packages/core/tests/canonical-plugin-library.test.ts`。
- 场景与边界：`persists a local source outside the canonical bundle and updates after reread`：重新读取服务后仍能从原来源发现并应用更新，核对实际包文件及版本。与 namespace 缺陷共享此流程，不复制一套测试。
- 根目录命令：`pnpm --filter @prompthub/core exec vitest run tests/canonical-plugin-library.test.ts`。
- 接入：所属 package 的常用 Vitest 入口；与 ISS-20260825-005 共用本次 Core 验证：14 个用例通过，不重复计数；未重跑 Electron。
