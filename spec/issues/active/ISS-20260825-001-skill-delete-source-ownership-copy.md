# Skill Delete Source Ownership And Confirmation Mismatch

## Record

- ID: `ISS-20260825-001`
- Status: local_done (release pending)
- Severity: high destructive-action contract risk
- Owning change: `spec/changes/active/agent-management-workbench/`
- First local triage: 2026-08-25
- Automated evidence:
  `apps/desktop/tests/e2e/agent-skill-lifecycle.spec.ts`

## Confirmed Phenomenon

The real Electron lifecycle creates a manual Skill, edits metadata, creates and
edits `docs/note.txt`, edits `SKILL.md`, creates a snapshot, installs and
uninstalls a Codex symlink, closes Electron, and reopens the same isolated
profile. Before delete, all of these assertions pass:

- the nested file contains the exact saved bytes after uninstall and after the
  first Electron process has closed;
- the canonical Skill bundle contains the nested file after restart;
- the restarted IPC file inventory contains the nested file;
- metadata, version history, and the uninstalled Codex state survive restart;
- unrelated files below the Codex Skills root remain byte-identical.

The delete confirmation then states:

`Only removes this skill from the PromptHub library. Source files are preserved.`

After confirmation, the Skill row and version rows are deleted, but the
pre-delete managed `local_repo_path` no longer exists. The focused command

`pnpm --dir apps/desktop exec playwright test tests/e2e/agent-skill-lifecycle.spec.ts`

therefore fails at the source-preservation assertion. This is not a restart or
nested-file persistence failure; the strengthened boundary assertions prove
that those states survive until delete.

## Root Cause

The implementation and stable regression matrix agree that PromptHub-owned
managed storage is deleted, while the confirmation copy describes every Skill
as if it had an external source directory:

- `apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx` chooses
  `skill.deleteSourceOnlyHint` or `skill.deleteDistributedHint` only from
  distribution state. It does not classify source ownership.
- `apps/desktop/src/renderer/i18n/locales/en.json` says source files are
  preserved in both hints without distinguishing managed and linked sources.
- `apps/desktop/src/main/ipc/skill/crud-handlers.ts` explicitly deletes a
  managed variant container before deleting the DB row.
- `packages/core/src/canonical-skill-db.ts` routes canonical deletion through
  `deleteCanonicalSkill()` after the row is removed.
- `packages/core/src/canonical-skill-library.ts` deletes both the canonical
  bundle and its hydrated canonical workspace.
- `spec/knowledge/reference/skill-regression-test-matrix.md` `OP-013` requires
  managed repo and DB deletion for copy imports, while preserving linked
  external source directories.

The data mutation matches `OP-013`; the unconditional confirmation copy and the
current E2E plan do not. The risk is material because users cannot tell whether
Delete removes the only owned copy or merely detaches an external source.

## Confirmed Product Decision

Manually created and copied PromptHub Skills are PromptHub-owned packages.
Deleting them removes the PromptHub record, managed package, version history,
canonical bundle, and canonical workspace. A linked external source remains
user-owned and must stay untouched.

The existing deletion semantics remain authoritative. The confirmation copy and
regression assertions must describe that ownership boundary instead of
promising that every source directory is preserved.

## Resolution

The detail and batch dialogs now use one ownership-accurate contract across all
seven locales: deleting a Skill removes its PromptHub record, managed package,
and version history, while linked external source folders are preserved.
Distribution-specific copy and symlink policy remains separate.

The real Electron regression now asserts that a manually created managed Skill
loses its managed source path and canonical bundle after delete, stays deleted
after another restart, and does not alter unrelated files in the Agent Skills
root. Existing main-process coverage continues to assert that external source
paths never enter managed-container deletion.

Traceability: `FR-AGENT-131 -> DES-AGENT-150 -> TEST-AGENT-212 ->
T-AGENT-221`, with stable operation contract `OP-013` and defect record
`ISS-20260825-001`.

## Verification

- `pnpm --dir apps/desktop exec vitest run tests/unit/components/skill-detail-project-distribution.test.tsx tests/unit/main/skill-crud-ipc.test.ts`
  passed: 2 files, 23 tests.
- `pnpm --dir apps/desktop build` passed and refreshed the Electron `out/`
  artifacts used by Playwright.
- `pnpm --dir apps/desktop exec playwright test tests/e2e/agent-skill-lifecycle.spec.ts`
  passed: 1 real Electron lifecycle test, including two restarts and durable
  filesystem/database assertions.

## Required Verification

- Manual-created managed Skill: delete removes the DB row, versions, canonical
  bundle, canonical workspace, and selected distributions, while preserving
  unrelated Agent files.
- Linked external Skill: delete removes PromptHub metadata and selected
  distributions but preserves the external source directory byte-for-byte.
- Copy and symlink distributions follow their independent confirmation policy.
- Cancel leaves every DB row and file unchanged.
- Restart does not resurrect deleted managed Skills or lose retained external
  sources.
- Every confirmation string matches the ownership class and resulting durable
  side effects.

## 可重跑回归入口（2026-09-28 核对）

- 测试：`apps/desktop/tests/unit/main/skill-crud-ipc.test.ts`。
- 场景与边界：`honors copy retention while removing symlinks and the shared target`、`retains the canonical package and library record when uninstall fails, then supports retry`，覆盖 copy 保留与卸载失败保全。IPC 单元用例的替换依赖不能证明完整包删除；真实包与来源保全另见 `apps/desktop/tests/integration/skill-public-workflow.test.ts`。
- 根目录命令：`pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-crud-ipc.test.ts`。
- 接入：所属 package 的常用 Vitest 入口；本次完整 IPC 文件重跑通过：11 个用例；未重跑 Electron。
