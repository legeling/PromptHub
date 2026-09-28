# Rules Restore Conflict And History Loss

## Record

- ID: `ISS-20260820-001`
- Status: open
- Severity: critical data-loss risk
- GitHub issues: #209, #210
- Owning change: `spec/changes/active/rules-managed-copies/`
- First local triage: 2026-08-20

## Confirmed Defect And Local Resolution

- `packages/core/src/rules-workspace.ts` detects managed/target drift through
  `inspectRuleSyncState()` during ordinary reads and materialization.
- The released `0.5.8`/`0.5.9` path and the pre-fix Core importer bypassed that
  conflict boundary by writing imported content to both managed and external
  targets before replacing Rule history.
- The local #210 fix makes the shared Core importer managed-only, derives target
  state without writing it, merges recoverable history within 20 versions, and
  rolls back partial per-Rule publication. Desktop IPC fallback and CLI
  Rules/workspace/sync restore reuse this contract.
- The accepted Rules delta spec and design explicitly require restore to avoid
  silent external-target overwrite and to leave a missing or divergent target
  awaiting explicit deployment or conflict resolution.
- The accepted no-silent-overwrite contract is now implemented locally but is
  not yet released. GitHub #210 must remain open until a containing version is
  published.

## Triage Boundary

- #210 directly identifies the confirmed backup-import path and simultaneous
  loss of the external edit and locally recoverable version history.
- #209 reports overwrite after reopening PromptHub. Ordinary Rule
  materialization does not write an existing target, so the startup sequence
  needs a current-build reproduction to determine whether deferred WebDAV,
  self-hosted sync, or another restore caller reaches the #210 path.
- Do not mark the reports duplicate until that caller evidence exists.
- Do not close either issue based on the `0.6.0-beta.1` publication; that
  published candidate predates the local #210 fix.

## Required Resolution Evidence

- A failing Core regression must prove that importing a record whose external
  target differs leaves the target byte-for-byte unchanged and reports a
  conflict or pending-deployment state.
- Empty imported content must not truncate an existing external target.
- A symlink target must not be followed by the import path without a separate
  explicit conflict-resolution action.
- Failure injection must prove the prior managed body and recoverable Rule
  history survive a partial import.
- Desktop backup restore plus CLI workspace and sync restore must exercise the
  shared fixed contract rather than bypass it.
- The #209 reopen sequence must identify the exact trigger and prove that an
  external edit remains present after restart.

## Confirmed Data Decision

Successful replace imports merge incoming and existing versions by content
identity, capture the pre-import managed body when it is not already present,
and retain the newest recoverable entries within the existing 20-version limit.
The fix reuses the current Rule history surface instead of introducing a second
safety-snapshot layout and lifecycle.

## Local Verification Coverage

- Core filesystem and SQLite regressions cover divergent, empty, symlink, and
  missing targets; bounded history selection; duplicate version identities;
  failed version publication; failed DB publication; rollback path validity;
  and delayed replace cleanup.
- CLI regressions cover direct Rules import and workspace sync pull while an
  external target contains newer content.
- The dedicated Core importer has 100% line, function, branch, and statement
  coverage for its managed-only import, bounded history, rollback, and cleanup
  behavior. The focused Desktop and CLI suites pass 42 and 8 tests respectively.
- #209's exact current-build reopen trigger is not part of the completed #210
  implementation and remains open for independent reproduction.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`apps/desktop/tests/unit/main/rules-workspace-import.test.ts`。
- 场景与边界：`preserves divergent, empty, symlinked, and missing targets` 与 `rolls back managed and history files when version staging fails` 等用例检查导入目标、历史保全与失败恢复；只对应 #210 已定位边界。#209 的原始重新打开触发仍待复现，不能用此测试替代。
- 根目录命令：`pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/rules-workspace-import.test.ts`。
- 接入：所属 package 的常用 Vitest 入口；本次完整文件重跑通过：13 个用例；未执行 #209 的真实重启复现。
