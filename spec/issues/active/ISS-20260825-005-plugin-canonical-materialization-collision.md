# Plugin Import Collides With Canonical Bundle Namespace

## Record

- ID: `ISS-20260825-005`
- Status: local_done (release pending)
- Severity: high Plugin lifecycle blocker
- Owning change: `spec/changes/active/agent-management-workbench/`
- First local triage: 2026-08-25
- Automated evidence:
  `apps/desktop/tests/e2e/agent-plugin-lifecycle.spec.ts`

## Confirmed Phenomenon

A real local Plugin import showed `The Plugin package failed validation. Its
manifest, size, or file paths are invalid`. The main-process error was
`resource bundle manifest is missing`; My Plugins remained empty and no
canonical Plugin bundle survived. A focused canonical service test reproduced
the same error before any renderer assertion.

## Root Cause

The legacy package materializer and the canonical Plugin library both owned
`data/plugins`. Import first copied the source to
`data/plugins/<normalized-plugin-id>/package`. The subsequent canonical read
treated every visible child of `data/plugins` as a completed resource bundle,
so it tried to read `manifest.json` from that not-yet-published package copy and
failed. Normalizing `:` to `-` also made this staging path capable of colliding
with another stable canonical ID.

## Resolution

Canonical-mode package materialization now uses the bounded cache workspace.
Canonical publication consumes that copy, rereads the resulting stable-ID
bundle, returns canonical package paths to the caller, and removes the consumed
workspace. Legacy metadata mode retains its existing layout.

Traceability: `FR-AGENT-135 -> DES-AGENT-154 -> TEST-AGENT-216 ->
T-AGENT-225`.

## Required Verification

- The focused canonical import test changes from the exact missing-manifest
  failure to a single published stable-ID bundle with no sibling staging entry.
- Existing canonical Plugin publication, rollback, migration, version, and
  deletion tests continue to pass.
- A real Electron profile completes UI import, Codex distribution and removal,
  restart, UI delete, and final restart while preserving an unrelated target
  file.

## Verification

- The focused canonical Plugin suite passed: 14 tests.
- Related import, distribution, validation, version, and source reconciliation
  suites passed: 51 tests.
- Core and desktop typechecks, Prettier, traceability, and the desktop
  production build passed.
- The real Electron lifecycle passed UI import with success Toast, canonical
  package assertions, Codex copy distribution and removal, restart, UI delete,
  and final restart while preserving an unrelated target file.
- Local source update remains blocked by the separately recorded device
  projection issue `ISS-20260825-006`.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`packages/core/tests/canonical-plugin-library.test.ts`。
- 场景与边界：`persists a local source outside the canonical bundle and updates after reread`：真实导入完整多文件包，检查 managed 目录、来源和重新读取后的更新。
- 根目录命令：`pnpm --filter @prompthub/core exec vitest run tests/canonical-plugin-library.test.ts`。
- 接入：所属 package 的常用 Vitest 入口；本次完整 Core 文件重跑通过：14 个用例；未重跑 Electron。
