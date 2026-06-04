# Skill Lifecycle Matrix White-Box Audit

Audit date: 2026-06-02

## Scope

This audit checks the bounded Skill lifecycle matrix in
`spec/knowledge/reference/skill-regression-test-matrix.md` against the current
desktop implementation.

The audited surfaces are:

- Store / Remote Git
- Local Folder
- Project Skills
- Agent Skills
- My Skills
- External Symlink Target
- Platform Built-in
- Backup / Restore / Import

The audited operation classes are:

- create/import
- read/list
- update
- refresh/rescan
- install/distribute
- remove/uninstall
- delete
- backup/restore

## White-Box Findings

### Confirmed Implemented And Tested

- Project and Agent scanned Skill matching now share
  `apps/desktop/src/renderer/services/skill-scan-status.ts`.
- Project and Agent matching uses scanned `localPath`, `symlinkTargetPath`, and
  `directory_fingerprint`. It does not use display `name` as identity.
- Project copied folders that are not matched to My Skills by stable path,
  symlink target, or directory fingerprint show `External install`, not
  `Copy install`.
- Agent copied folders that are not matched to My Skills by stable path,
  symlink target, or directory fingerprint show `External install`, not
  `Copy install`.
- `Copy install` is reserved for PromptHub-managed/correlatable copy
  distributions.
- External or unknown symlinks show `External install`.
- PromptHub-managed symlinks show `Symlink install`.
- Cherry Studio built-in Skills are marked from platform DB metadata
  (`source='builtin'`, `builtin`, or `is_builtin`) and cannot be uninstalled
  from the Agent UI or platform service.
- Store imported state is source-identity based, with `source_id` checked before
  weaker source fields.
- Directory fingerprinting now ignores runtime/tooling cache files such as
  Python `__pycache__`, `.pyc`, `.pyo`, `.pytest_cache`, `.mypy_cache`,
  `.ruff_cache`, `.tox`, `.nox`, `.coverage*`, front-end/tool cache
  directories, package-manager caches, debug logs, editor temp files, and common
  OS sidecars.
- DB source identity is guarded by `idx_skills_source_id` and DB create/update
  duplicate checks.
- Platform-local uninstall validates target containment before deleting the
  platform folder or symlink.

## Partial / Not 100% Proven Rows

These are not necessarily current user-visible bugs, but they are places where
the implementation or tests are not exhaustive enough to claim complete coverage.

| Matrix Row | Status  | Reason                                                                                                                                                                            |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SO-002     | Partial | Local folder identity is path/fingerprint based. It is not Git branch-aware when the same local repo path switches branches.                                                      |
| OP-001     | Partial | Import exists for Store, local scan, Project, and Agent paths, but not every source origin has a full visible Import -> Open transition test.                                     |
| OP-002     | Partial | My Skills source labels are inferred through multiple code paths; not every source-origin label has a snapshot/regression test.                                                   |
| OP-005     | Partial | Managed Skill update/version behavior is implemented, but the lifecycle matrix does not yet exhaustively cover file editor/version restore.                                       |
| OP-013     | Partial | Single detail delete covers project distributions; CRUD delete covers platform installs. Batch My Skills delete project-distribution cleanup is not proven through the same path. |
| OP-014     | Partial | JSON metadata preservation is tested; full backup restore lifecycle is covered elsewhere and not re-run by this matrix suite.                                                     |

## Code Evidence

- `apps/desktop/src/renderer/services/skill-scan-status.ts`
- `apps/desktop/src/renderer/components/skill/SkillProjectsView.tsx`
- `apps/desktop/src/renderer/components/skill/SkillAgentsView.tsx`
- `apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx`
- `apps/desktop/src/renderer/components/skill/SkillManager.tsx`
- `apps/desktop/src/renderer/components/skill/store-remote-sync.ts`
- `apps/desktop/src/renderer/services/skill-store-update.ts`
- `packages/shared/utils/skill-identity.ts`
- `apps/desktop/src/main/services/skill-installer.ts`
- `apps/desktop/src/main/services/skill-installer-repo.ts`
- `apps/desktop/src/main/services/cherry-studio-skill-platform.ts`
- `apps/desktop/src/main/ipc/skill/crud-handlers.ts`
- `packages/db/src/skill.ts`

## Verification Run

Current matrix-specific verification:

```bash
pnpm --filter @prompthub/desktop exec vitest run \
  tests/unit/services/skill-scan-status.test.ts \
  tests/unit/services/skill-identity.test.ts \
  tests/unit/components/skill-agents-view.test.tsx \
  tests/unit/components/skill-projects-view.test.tsx
```

Current quality gates:

```bash
pnpm --filter @prompthub/desktop typecheck
pnpm --filter @prompthub/desktop exec eslint \
  src/renderer/services/skill-scan-status.ts \
  src/renderer/components/skill/SkillAgentsView.tsx \
  src/renderer/components/skill/SkillProjectsView.tsx \
  tests/unit/services/skill-scan-status.test.ts \
  tests/unit/components/skill-agents-view.test.tsx
```

## Follow-Up Tests Required Before Claiming Full Implementation Coverage

- Add a My Skills batch-delete regression that starts with project copy and
  project symlink distributions, then proves the confirmation choice preserves
  copied project folders and removes PromptHub-managed symlinks.
- Add source-label regression tests for every source origin in the matrix,
  especially Store/Gitea, local folder, Agent platform import, and restored
  source metadata.
- Add local-dir Git branch/worktree tests or explicitly keep local-dir
  branch-awareness out of scope in the stable behavior docs.
- Add full backup restore lifecycle coverage that restores same-name variants
  and then checks Store/My Skills/Project/Agent status labels after reload.
