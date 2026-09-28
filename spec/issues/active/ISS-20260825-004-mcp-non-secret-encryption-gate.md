# Non-Secret MCP Save Requires Device Encryption

## Record

- ID: `ISS-20260825-004`
- Status: local_done (release pending)
- Severity: high MCP lifecycle blocker
- Owning change: `spec/changes/active/agent-management-workbench/`
- First local triage: 2026-08-25
- Automated evidence:
  `apps/desktop/tests/e2e/agent-mcp-lifecycle.spec.ts`

## Confirmed Phenomenon

A real MCP manual-create attempt containing only non-secret stdio fields showed
a failed-create toast and created no library row. The main-process error was
`MCP_RESOURCE_SECRET_STORE_UNAVAILABLE`. A focused unavailable-encryption unit
test reproduced the same failure when `prepareUpdate` received no secrets.

## Root Cause

Canonical MCP publication always stages its secret-store companion so deleted
or superseded references can be removed atomically. The desktop canonical
secret-store implementation called `requireEncryption` before inspecting the
stage input. Therefore even `{ secrets: [], retainRefs: [] }` was rejected,
although writing an empty store or filtering existing ciphertext needs neither
encryption nor decryption.

## Resolution

The canonical secret store now requires device encryption only when the staged
input contains extracted secret values. Empty updates can participate in the
same atomic canonical transaction. Non-empty secrets still fail before the
stage file is written when encryption is unavailable.

Traceability: `FR-AGENT-134 -> DES-AGENT-153 -> TEST-AGENT-215 ->
T-AGENT-224`.

## Required Verification

- The previously failing unavailable-encryption empty update succeeds and
  writes no plaintext value.
- Existing non-empty secret tests continue to fail closed without encryption.
- A real canonical-authority Electron profile completes MCP create, read,
  update, restart, delete, and a final restart with exact durable assertions.

## Verification

- The focused secret-store suite passed: 5 tests.
- The canonical MCP library suite passed: 17 tests.
- Desktop typecheck, production build, Prettier, and change traceability passed.
- The real Electron lifecycle passed: create, durable read, update, canonical
  resource and manifest, restart recovery, delete, and final restart with no
  residual resource.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`apps/desktop/tests/unit/main/mcp-resource-secret-store.test.ts`。
- 场景与边界：`allows an empty canonical update when no secret needs encryption`：设备加密不可用时，无秘密更新仍写出正确 stage 内容；有秘密的写入必须失败且不能发布文件。
- 根目录命令：`pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/mcp-resource-secret-store.test.ts`。
- 接入：所属 package 的常用 Vitest 入口；本次完整文件重跑通过：5 个用例；未重跑 Electron。
