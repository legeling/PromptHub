# Provider Profile Duplicate Name Contract Conflict

## Record

- ID: `ISS-20260825-002`
- Status: local_done (release pending)
- Severity: medium provider-management contract mismatch
- Owning change: `spec/changes/active/agent-management-workbench/`
- First local triage: 2026-08-25
- Automated evidence:
  `apps/desktop/tests/e2e/agent-provider-workbench.spec.ts`

## Confirmed Phenomenon

In a real isolated Electron profile using canonical-file authority, creating the
first Claude Provider succeeds. The UI, public IPC result, export, and
`data/agents/<profile-id>/agent.json` all contain the expected public metadata
and model mappings, while `.claude/settings.json` remains byte-identical.

Creating a second active Claude Provider with the same display name but a
different endpoint and model fails. The inline editor remains open and the
workbench displays the exact alert:

`Provider operation failed`

The original profile remains selected and intact. The focused real-Electron
command reaches this failure deterministically:

`pnpm --dir apps/desktop exec playwright test tests/e2e/agent-provider-workbench.spec.ts --grep "keeps duplicate provider display names"`

## Root Cause

The accepted test plan and implemented persistence contract disagree:

- `spec/changes/active/agent-management-workbench/test-plan.md`
  `E2E-AGENT-003` requires duplicate display names to remain separate through
  stable profile IDs.
- `packages/db/src/schema.ts` defines
  `idx_agent_provider_profiles_active_name` as a case-insensitive unique index
  on `(platform_id, LOWER(name))` for active rows.
- `spec/changes/active/agent-management-workbench/implementation.md` records
  that unique-name index as intentional persistence behavior.
- `packages/db/src/agent-provider-profile.ts` inserts the requested name
  directly and relies on SQLite to reject the collision.
- `packages/core/src/canonical-storage-shadow.ts` also elects one active
  profile per case-insensitive `(platformId, name)` during SQLite rebuild and
  archives other stable IDs.
- `apps/desktop/src/main/ipc/agent-provider-profile.ipc.ts` converts the
  constraint failure to the generic
  `AGENT_PROVIDER_PROFILE_OPERATION_FAILED`, so the renderer cannot explain the
  actual conflict.

This is not a stale locator. The screenshot shows one valid existing profile,
the completed second form, and the product alert after Save.

## Confirmed Product Decision

`name` is a display label. Stable profile ID is the only Provider Profile
identity. Exact-case and case-only duplicate names are valid within one
platform and across archived records.

## Resolution

The fresh schema no longer creates
`idx_agent_provider_profiles_active_name`. Existing databases apply the
transactional `allow_duplicate_agent_provider_profile_names_v1` migration,
which drops only that obsolete index and preserves all profile graphs and
secret references. Provider creation, update, canonical publication, export,
and deletion continue to address records by stable ID. Canonical SQLite rebuild
now projects every profile's stored archive state without electing a
name-derived winner.

Traceability: `FR-AGENT-132 -> DES-AGENT-151 -> TEST-AGENT-213 ->
T-AGENT-222`, with defect record `ISS-20260825-002`.

## Required Verification

- Fresh and migrated databases allow exact-case and case-only duplicates.
- Rename and archived-name reuse keep each stable profile ID independent.
- Duplicate creation succeeds without the generic `Provider operation failed`
  alert and does not change the Agent's native provider file.
- Restart preserves all duplicate profiles and their canonical bundles.
- Canonical SQLite projection rebuild preserves duplicate labels and stable IDs.

## Verification

- `pnpm --dir apps/desktop exec vitest run tests/unit/main/agent-provider-profile-db.test.ts`
  passed: 14 DB and migration tests.
- `pnpm --dir packages/core exec vitest run tests/canonical-storage-shadow.test.ts`
  passed: 22 canonical projection and rebuild tests.
- Desktop and core TypeScript checks passed; `pnpm spec:traceability` passed.
- `pnpm --dir apps/desktop build` passed.
- `pnpm --dir apps/desktop exec playwright test tests/e2e/agent-provider-workbench.spec.ts`
  passed: 4 real Electron tests covering shared workbench behavior, Provider
  CRUD/restart/delete, credential rollback, and duplicate labels across restart.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`apps/desktop/tests/unit/main/agent-provider-profile-db.test.ts`。
- 场景与边界：`persists non-secret metadata and treats names as duplicate display labels`：真实 SQLite 中同名显示名具有不同稳定 ID，独立读写。
- 根目录命令：`pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/agent-provider-profile-db.test.ts`。
- 接入：所属 package 的常用 Vitest 入口；本次完整 DB 文件重跑通过：14 个用例；未重跑 Electron。
