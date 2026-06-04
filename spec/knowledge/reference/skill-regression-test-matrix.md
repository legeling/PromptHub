# Skill Regression Test Matrix

This matrix turns escaped user-reported skill bugs into required regression tests. It is a test-design contract, not a bug-fix plan.

For defect classification, start with `spec/knowledge/reference/skill-defect-taxonomy.md`. This matrix is the concrete regression layer after the bug has been typed.

## TDD Failure Pattern

The escaped bugs share these testing gaps:

- Tests asserted mocked API calls but not durable post-conditions.
- Tests covered `SKILL.md`-only fixtures but not full repo directory preservation.
- Tests covered install paths but not delete/uninstall cleanup paths.
- Tests validated detail views without checking that list, detail, project, and platform status use the same source of truth.
- Tests covered GitHub happy paths more than custom Git/Gitea paths.
- Tests did not include recursive file-browser behavior.
- Tests did not separate distributable Skill content from runtime/tooling cache
  files generated after install.

## Required Regression Matrix

| ID     | Escaped Bug                                                                                             | Missed Invariant                                                                                                      | Lowest Effective Test Layer                            | Required Test Item                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SR-001 | Claude Code store install does not show imported                                                        | Store cards must derive installed state from stable source identity, not only name or current detail state            | Component + store unit, backed by DB/source-id fixture | Install a Claude Code store skill, reload store entries, assert card badge/button shows imported and no duplicate import action appears                    |
| SR-002 | Custom Gitea store import keeps only `SKILL.md` and loses directories                                   | Custom Git/Gitea imports must preserve full repo directory content except explicit ignore rules                       | Main-process service unit + E2E smoke                  | Fixture repo contains `SKILL.md`, nested docs, scripts, assets; after import, managed repo contains all files and directory fingerprint reflects full tree |
| SR-003 | Deleting a skill does not remove platform symlink                                                       | Delete/uninstall must clean platform copy/symlink plus activation metadata                                            | Main-process service unit + integration                | Install by symlink, delete skill, assert platform symlink path removed, activation record cleared, status no longer installed                              |
| SR-004 | Custom Gitea skill safety scan blocked with `SAFETY_SCAN_BLOCKED_SOURCE`                                | Safety scan source policy must allow managed custom-store repos while still blocking unsafe external/internal sources | Main-process service unit                              | Custom Gitea managed repo with `localRepoPath` scans using repo files; internal URL remains blocked; report stores source metadata                         |
| SR-005 | Project skill distribution can install but cannot uninstall                                             | Project distribution is a bidirectional lifecycle, not install-only                                                   | Component integration + service unit                   | Distribute to project by copy and symlink; uninstall from same project; assert files/symlink and project status are removed                                |
| SR-006 | Official store tab shows 54 but header/card list shows 0                                                | Store tab count, header count, empty state, and cards must use the same filtered data source                          | Component unit                                         | Seed 54 official entries; assert side tab count, header count, and rendered cards agree; if official store is closed, tab count must also be 0 or hidden   |
| SR-007 | Installed skill detail shows installed but list card remains gray/uninstalled                           | List and detail installed status must share one selector/source of truth                                              | Store selector unit + component unit                   | Mark skill installed, render list and detail, assert both show installed state; update install status and assert both surfaces update                      |
| SR-008 | File browser cannot expand nested folders                                                               | Skill repo file browser must recursively load child directories                                                       | Component unit + IPC/service unit                      | Fixture tree includes nested folder; click folder, assert child files appear and read/list APIs receive normalized relative paths                          |
| SR-009 | Project tab does not show skills installed into project by symlink                                      | Project scan must include symlinked and copied project skills                                                         | Main-process scan unit + component integration         | Project deploy target contains symlinked skill and copied skill; scan returns both with mode/source metadata; project tab renders both                     |
| SR-010 | Missing agent-centric entry for all skills and project skills cannot tag/uninstall by copy/symlink mode | Agent/project skill inventory must expose copy/symlink mode, tag management, and uninstall actions                    | Requirement-level design + component integration + E2E | Given an agent/platform, list all copied and symlinked skills; tag each; uninstall each; assert status and tags update without affecting unrelated agents  |
| SR-011 | Running a Skill script creates `__pycache__` and makes PromptHub think the Skill changed or is external | Directory fingerprint must represent distributable Skill content, not runtime/tooling cache files                     | Shared identity unit + scan-status unit                | Compute fingerprints from clean files and from the same files plus Python cache/tooling cache; assert they match and scanned status stays `In My Skills`   |

## Required Fixtures

Every future skill install/distribution regression suite should include:

- `full-repo-skill`: `SKILL.md`, `README.md`, `docs/guide.md`, `scripts/setup.sh`, `assets/icon.png`
- `nested-file-skill`: at least two folder levels below the skill root
- `custom-gitea-source`: non-GitHub Git URL plus branch/directory metadata
- `same-name-variant`: two skills with same `name` but different `source_id`
- `copy-and-symlink-project`: one copied project skill and one symlinked project skill
- `runtime-cache-skill`: `SKILL.md`, `scripts/run.py`, generated
  `__pycache__/*.pyc`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`,
  front-end cache directories, coverage output, debug logs, and editor temp
  files

## Skill Lifecycle UI State Matrix

Skill lifecycle UI must be derived from stable identity and filesystem scan
metadata, not from display name alone. The shared identity order is:

1. scanned `localPath` matches library `local_repo_path` or `source_url`
2. scanned `symlinkTargetPath` matches library `local_repo_path` or `source_url`
3. scanned `directory_fingerprint` matches library `directory_fingerprint`
4. no match

`name` is display metadata only. Same-name Skills from different stores,
projects, agents, or folders must not be treated as the same managed Skill.

Directory fingerprints are package-content identities. They MUST ignore
runtime/tooling byproducts that users commonly create after install, including
Python bytecode caches (`__pycache__/`, `*.pyc`, `*.pyo`), Python analysis/test
caches (`.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `.tox/`, `.nox/`,
`.coverage*`), front-end/tool caches (`.cache/`, `.vite/`, `.vitest/`,
`.parcel-cache/`, `.turbo/`, `.next/`, `.nuxt/`, `.svelte-kit/`,
`.nyc_output/`, `.npm/`, `.pnpm-store/`, `.yarn/cache/`, `.sass-cache/`),
temporary directories (`tmp/`, `temp/`, `.tmp/`), debug logs, editor swap or
backup files, and OS sidecar files. They MUST NOT ignore lockfiles or broad
build output directories such as `dist/` or `build/` unless a future requirement
proves those directories are never valid Skill assets.

### Completeness Boundary

This matrix is the required Skill lifecycle status contract. It is not a claim
that every theoretical filesystem, Git, DB, sync, and UI permutation has already
been exhaustively implemented and tested.

Rows in this matrix are complete only when all three conditions are true:

1. the source/origin is named;
2. the operation has a required state transition;
3. the user-visible label, action, and negative rule are documented and tested.

If a future Skill bug or feature touches a row that is not listed here, the row
must be added before implementation. If the row exists but lacks a test, the bug
fix must add the missing regression test before changing production code.

### Source Origin Matrix

PromptHub uses source origin to explain where a Skill came from. Source origin is
separate from install mode. Install mode says how a scanned folder is present in
a target directory. Source origin says where the managed Skill or scanned Skill
was obtained.

| Origin ID | Source Origin             | Examples                                       | Stable Identity Inputs                                       | User-Facing Source Label                                                | Notes                                                                |
| --------- | ------------------------- | ---------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| SO-001    | Store / Remote Git        | official store, community GitHub, Gitea store  | `source_id`, `source_url`, branch, directory, skill path     | Store / repository source                                               | Refresh must preserve imported state by stable source identity       |
| SO-002    | Local Folder              | user scans or drags a local Skill folder       | normalized local path, directory fingerprint                 | Local folder                                                            | Same name is not identity                                            |
| SO-003    | Project Scan              | project `.agents/skills`, `.claude/skills`     | scanned local path, symlink target, directory fingerprint    | Project Skill                                                           | Project rows are filesystem snapshots, not the My Skills source      |
| SO-004    | Agent / Platform Scan     | Claude Code, Cherry Studio, Codex, custom      | platform id, scanned local path, symlink target, fingerprint | Agent/platform source, such as `Imported from Cherry Studio` when known | Agent rows are filesystem or platform DB snapshots                   |
| SO-005    | My Skills Managed Repo    | PromptHub-managed repo container               | DB skill id, source metadata, managed local repo path        | My Skills                                                               | This is the library source of truth                                  |
| SO-006    | External Symlink Target   | user-created symlink, third-party linked Skill | symlink target path, fingerprint when available              | External install                                                        | Must not be labeled PromptHub-managed unless matched by stable input |
| SO-007    | Platform Built-in         | Cherry Studio built-in Skills                  | platform DB builtin flag plus platform-local path            | Built-in                                                                | Deletion must be disabled in UI and rejected in platform service     |
| SO-008    | Backup / Restore / Import | PromptHub backup, JSON export/import           | restored source metadata, source id, fingerprint             | Restored / imported source metadata                                     | Restore must not collapse same-name variants                         |

### Lifecycle Operation Matrix

This table is the CRUD-style checklist for Skill management. UI rows below must
be evaluated through this operation matrix rather than one-off page logic.

| Operation ID | Operation                   | Source Origins In Scope                | Required Display / Labels                                                         | Required Action State                                                               | Required Durable State                                                                  |
| ------------ | --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OP-001       | Create/import to My Skills  | SO-001, SO-002, SO-003, SO-004, SO-008 | New library Skill appears in My Skills with source label                          | Scanned Project/Agent row changes from `Import to My Skills` to `Open in My Skills` | DB Skill row plus full managed repo directory                                           |
| OP-002       | Read/list My Skills         | SO-001, SO-002, SO-005, SO-008         | My Skills shows source/origin and distribution status                             | Open repo/detail/distribute actions reflect source state                            | Library state derived from DB plus managed repo                                         |
| OP-003       | Read/list Project Skills    | SO-003, SO-006                         | `Copy install`, `Symlink install`, `External install`, `In My Skills`             | Import/Open in My Skills/Distribute/Remove from Project                             | Filesystem scan only; does not create DB rows by scanning                               |
| OP-004       | Read/list Agent Skills      | SO-004, SO-006, SO-007                 | `Copy install`, `Symlink install`, `External install`, `Built-in`, `In My Skills` | Import/Open in My Skills/Uninstall; uninstall disabled for built-ins                | Filesystem scan plus platform metadata such as Cherry Studio DB builtin flag            |
| OP-005       | Update managed Skill        | SO-005                                 | My Skills version/source remain stable                                            | Detail/editor actions update library content                                        | DB row, version record, and managed repo content stay synchronized                      |
| OP-006       | Refresh Store               | SO-001                                 | Imported state remains stable after refresh                                       | Remote source URL opens; import/update action reflects installed status             | Store cache replaced by stable source identity, not temporary clone path                |
| OP-007       | Rescan Project / Agent      | SO-003, SO-004, SO-006, SO-007         | Labels recomputed from scan metadata and shared status helper                     | Rows appear/disappear based on current target directory                             | Scan state refreshes without mutating My Skills unless user imports                     |
| OP-008       | Install My Skill to Project | SO-005 -> SO-003                       | Target row shows `Copy install` or `Symlink install`                              | Project import modal prevents duplicate target installs                             | Full Skill directory copied or PromptHub symlink created in selected target             |
| OP-009       | Install My Skill to Agent   | SO-005 -> SO-004                       | Target row shows `Copy install` or `Symlink install`                              | Agent install modal prevents duplicate target installs                              | Full Skill directory copied or PromptHub symlink created in platform Skill directory    |
| OP-010       | Remove from Project         | SO-003, SO-006                         | Project row disappears after scan                                                 | Remove is always project-local                                                      | Deletes only project-local folder/symlink; My Skills source remains                     |
| OP-011       | Uninstall from Agent        | SO-004, SO-006                         | Agent row disappears after scan                                                   | Uninstall is platform-local                                                         | Deletes only platform-local folder/symlink and associated platform DB row when required |
| OP-012       | Block built-in uninstall    | SO-007                                 | `Built-in` badge remains                                                          | Delete/uninstall disabled and warning shown                                         | Platform service rejects builtin deletion even if UI is bypassed                        |
| OP-013       | Delete from My Skills       | SO-005                                 | Library row disappears; distributed target labels update on rescan                | User must choose copy preservation/cleanup behavior when distributed installs exist | Managed repo and DB row deleted; unrelated external folders are not silently deleted    |
| OP-014       | Backup / restore            | SO-008                                 | Restored Skills keep source labels where metadata exists                          | Same-name variants remain separate                                                  | Source metadata, source ids, and fingerprints survive export/import when available      |

### Source x Operation Applicability Matrix

Legend:

- `Y`: operation applies to this source origin.
- `N`: operation does not apply by design.
- `D`: operation applies only after the source has been imported into My Skills.
- `S`: operation applies only when the source is scanned on a Project or Agent surface.
- `P`: operation applies only through a platform-specific adapter.

| Operation ID | Store / Remote Git SO-001 | Local Folder SO-002 | Project Scan SO-003 | Agent / Platform Scan SO-004 | My Skills Repo SO-005 | External Symlink SO-006 | Platform Built-in SO-007 | Backup / Restore SO-008 |
| ------------ | ------------------------- | ------------------- | ------------------- | ---------------------------- | --------------------- | ----------------------- | ------------------------ | ----------------------- |
| OP-001       | Y                         | Y                   | Y                   | Y                            | N                     | Y                       | N                        | Y                       |
| OP-002       | D                         | D                   | D                   | D                            | Y                     | D                       | N                        | D                       |
| OP-003       | N                         | N                   | Y                   | N                            | N                     | S                       | N                        | N                       |
| OP-004       | N                         | N                   | N                   | Y                            | N                     | S                       | P                        | N                       |
| OP-005       | D                         | D                   | D                   | D                            | Y                     | D                       | N                        | D                       |
| OP-006       | Y                         | N                   | N                   | N                            | D                     | N                       | N                        | N                       |
| OP-007       | N                         | N                   | Y                   | Y                            | N                     | S                       | P                        | N                       |
| OP-008       | D                         | D                   | D                   | D                            | Y                     | D                       | N                        | D                       |
| OP-009       | D                         | D                   | D                   | D                            | Y                     | D                       | N                        | D                       |
| OP-010       | N                         | N                   | Y                   | N                            | N                     | S                       | N                        | N                       |
| OP-011       | N                         | N                   | N                   | Y                            | N                     | S                       | P                        | N                       |
| OP-012       | N                         | N                   | N                   | N                            | N                     | N                       | Y                        | N                       |
| OP-013       | D                         | D                   | D                   | D                            | Y                     | D                       | N                        | D                       |
| OP-014       | D                         | D                   | N                   | N                            | Y                     | N                       | N                        | Y                       |

### White-Box Implementation Audit

Audit date: 2026-06-02.

Legend:

- `Implemented`: code path exists and matches the contract.
- `Tested`: at least one regression test asserts the user-visible or durable post-condition.
- `Partial`: code exists for the main path, but not every listed entry point or cross-surface path is proven.
- `Gap`: contract row is documented but missing implementation or regression coverage.

| Contract Row | Implementation Status | Test Status | White-Box Evidence                                                                                                                                | Accuracy / Gap Note                                                                                                                              |
| ------------ | --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SO-001       | Implemented           | Tested      | `store-remote-sync.ts` builds `source_id`; `SkillStore.tsx` checks installed state via `findInstalledRegistrySkill()`                             | Local persisted stale remote cache cleanup remains a separate historical-cache concern.                                                          |
| SO-002       | Implemented           | Partial     | `scanLocalPreview()` and local-dir store mapping create path/fingerprint identity                                                                 | Local Git branch-aware identity is not part of current implementation; do not document branch separation for local-dir.                          |
| SO-003       | Implemented           | Tested      | `SkillProjectsView.tsx` scans project paths and uses `matchScannedSkillWithLookup()`                                                              | Project scan is a snapshot and does not mutate My Skills unless import is chosen.                                                                |
| SO-004       | Implemented           | Tested      | `SkillAgentsView.tsx` uses `getSkillScanStatus()`; `SkillInstaller.scanPlatformSkills()` returns platform-local scan metadata                     | Source labels for imported Agent folders are inferred by `detectAgentPlatformSkillSource()` when paths/labels match known platforms.             |
| SO-005       | Implemented           | Tested      | `packages/db/src/skill.ts` stores `source_id`, `local_repo_path`, fingerprints; managed repo helpers use container + `repo/` layout               | Durable source of truth is DB plus managed repo; UI must not infer identity from display name.                                                   |
| SO-006       | Implemented           | Tested      | `getScannedSkillInstallMetadata()` resolves symlink target and sets `isPromptHubManagedLink`; shared status marks external symlinks               | External symlink labels apply only on Project/Agent scanned surfaces.                                                                            |
| SO-007       | Implemented           | Tested      | Cherry Studio adapter reads `source='builtin'`, `builtin`, or `is_builtin`; Agent UI disables uninstall; platform service blocks builtin deletion | Built-in is a platform protection attribute. If the row is not matched to My Skills, it still shows `External install` plus separate `Built-in`. |
| SO-008       | Implemented           | Tested      | JSON export/import tests preserve `source_url` and `source_id`; DB accepts same-name variants through `source_id` uniqueness                      | Full backup/restore same-name matrix is covered in same-name active change; keep this row tied to source metadata preservation.                  |
| OP-001       | Implemented           | Partial     | Store, scan preview, Project, and Agent import paths call `importScannedSkills()` / install registry paths                                        | Component transition from Import to Open in My Skills is covered for scanned surfaces, but not every origin has a full UI transition test.       |
| OP-002       | Implemented           | Partial     | My Skills list/detail read from `useSkillStore.skills`; source metadata rendered by `getSkillSourceMeta()`                                        | Source label text has multiple inference paths; source-label snapshot tests are not exhaustive for all SO rows.                                  |
| OP-003       | Implemented           | Tested      | Project cards use shared lookup and `isExternalScannedSkillInstall()`                                                                             | Project card labels and same-name/fingerprint cases are covered.                                                                                 |
| OP-004       | Implemented           | Tested      | Agent cards use `getSkillScanStatus()` and built-in disabled action                                                                               | Agent external/copy/symlink/built-in rows are covered by component and main-process tests.                                                       |
| OP-005       | Implemented           | Partial     | CRUD update syncs frontmatter and platform rename paths; versioning exists in Skill DB                                                            | Matrix does not yet include every edit surface such as file editor/version restore; covered outside lifecycle label rows.                        |
| OP-006       | Implemented           | Tested      | Remote store `source_id` uses stable source inputs; installed lookup checks `source_id` first                                                     | Historical persisted remote entry cleanup before first refresh is not guaranteed by this row.                                                    |
| OP-007       | Implemented           | Tested      | Project/Agent rescan paths recompute rows from scan result and current library skills                                                             | Scan state is renderer/store state; no DB mutation should occur from scan alone.                                                                 |
| OP-008       | Implemented           | Tested      | `copyRepoByPathToDirectory()` supports copy/symlink and full directory copies                                                                     | Project target duplicate prevention and same-source guard are tested.                                                                            |
| OP-009       | Implemented           | Tested      | `installMd()` / `installMdSymlink()` and Cherry Studio adapter support platform install modes                                                     | Cherry Studio can request symlink through DB-backed adapter with fallback behavior.                                                              |
| OP-010       | Implemented           | Tested      | Project remove calls `deleteLocalFileByPath(localPath, ".")` and rescans project                                                                  | Removes only project-local folder/symlink.                                                                                                       |
| OP-011       | Implemented           | Tested      | `SkillInstaller.uninstallPlatformSkill()` validates target containment and delegates Cherry Studio DB cleanup                                     | Built-ins are blocked separately through OP-012.                                                                                                 |
| OP-012       | Implemented           | Tested      | Cherry Studio builtin metadata and uninstall guard tests exist                                                                                    | UI and main-process both enforce the guard.                                                                                                      |
| OP-013       | Partial               | Partial     | Detail delete removes project symlinks and optionally copies; CRUD delete removes platform symlinks/copies according to option                    | Batch My Skills delete does not prove project-distribution cleanup through the same path; keep as partial until covered by tests.                |
| OP-014       | Implemented           | Tested      | JSON export/import source metadata tests and same-name restore/change docs exist                                                                  | Full backup restore lifecycle is not re-run in this specific matrix test suite.                                                                  |

### Status Rows

| ID     | Surface       | Scan / Source State                          | My Skills Association                | Required Badge State                   | Primary Actions                                                                                                       | Negative Rule                                                                      |
| ------ | ------------- | -------------------------------------------- | ------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| SL-001 | Project Skill | copied folder                                | matched by path                      | `In My Skills` + `Copy install`        | Open folder, Open in My Skills, Distribute, Remove from Project                                                       | Must not show `Import to My Skills`; must not show `External install`              |
| SL-002 | Project Skill | copied folder                                | matched by directory fingerprint     | `In My Skills` + `Copy install`        | Open folder, Open in My Skills, Distribute, Remove from Project                                                       | Must not rely on matching `name`                                                   |
| SL-003 | Project Skill | copied folder                                | no stable match                      | `External install`                     | Open folder, Import to My Skills, Remove from Project                                                                 | Must not show `Copy install` unless it can be matched to My Skills                 |
| SL-004 | Project Skill | symlink, `isPromptHubManagedLink=true`       | optional stable match                | `Symlink install`                      | Open shortcut folder, Open source Skill folder when target exists, Open in My Skills if matched, Remove from Project  | Must not show `External install`                                                   |
| SL-005 | Project Skill | symlink target matches My Skills source      | matched by `symlinkTargetPath`       | `In My Skills` + `Symlink install`     | Open shortcut folder, Open source Skill folder, Open in My Skills, Remove from Project                                | Must not show `Import to My Skills`                                                |
| SL-006 | Project Skill | symlink, `isPromptHubManagedLink=false`      | no stable match                      | `External install`                     | Open shortcut folder, Open source Skill folder, Import to My Skills, Remove from Project                              | Must not show `Symlink install` as PromptHub-managed                               |
| SL-007 | Project Skill | symlink, managed flag unknown                | no stable match                      | `External install`                     | Open shortcut folder, Open source Skill folder, Import to My Skills, Remove from Project                              | Unknown symlink must not be counted as PromptHub symlink                           |
| SL-008 | Project Skill | same display name as a library Skill         | path/target/fingerprint differ       | `External install`                     | Import to My Skills remains available                                                                                 | Must not show `In My Skills`; must not show `Copy install` by name                 |
| SL-009 | Agent Skill   | copied folder                                | matched by path                      | `In My Skills` + `Copy install`        | Open folder, Open in My Skills, Uninstall from Agent                                                                  | Must not show `Import to My Skills`; must not show `External install`              |
| SL-010 | Agent Skill   | copied folder                                | matched by directory fingerprint     | `In My Skills` + `Copy install`        | Open folder, Open in My Skills, Uninstall from Agent                                                                  | Must not rely on matching `name`                                                   |
| SL-011 | Agent Skill   | copied folder                                | no stable match                      | `External install`                     | Open folder, Import to My Skills, Uninstall from Agent                                                                | Must not show `Copy install` unless it can be matched to My Skills                 |
| SL-012 | Agent Skill   | symlink, `isPromptHubManagedLink=true`       | optional stable match                | `Symlink install`                      | Open shortcut folder, Open source Skill folder when target exists, Open in My Skills if matched, Uninstall from Agent | Must not show `External install`                                                   |
| SL-013 | Agent Skill   | symlink target matches My Skills source      | matched by `symlinkTargetPath`       | `In My Skills` + `Symlink install`     | Open shortcut folder, Open source Skill folder, Open in My Skills, Uninstall from Agent                               | Must not show `Import to My Skills`                                                |
| SL-014 | Agent Skill   | symlink, `isPromptHubManagedLink=false`      | no stable match                      | `External install`                     | Open shortcut folder, Open source Skill folder, Import to My Skills, Uninstall from Agent                             | Must not show `Symlink install` as PromptHub-managed                               |
| SL-015 | Agent Skill   | symlink, managed flag unknown                | no stable match                      | `External install`                     | Open shortcut folder, Open source Skill folder, Import to My Skills, Uninstall from Agent                             | Unknown symlink must not be counted as PromptHub symlink                           |
| SL-016 | Agent Skill   | same display name as a library Skill         | path/target/fingerprint differ       | `External install`                     | Import to My Skills remains available                                                                                 | Must not show `In My Skills`; must not show `Copy install` by name                 |
| SL-017 | Agent Skill   | platform DB marks Skill as built-in          | no stable match                      | `External install` + `Built-in`        | Open folder, Import to My Skills                                                                                      | Uninstall must be disabled; main-process uninstall must also reject built-ins      |
| SL-018 | My Skills     | installed to one or more project/agent dirs  | library source of truth is DB + repo | distribution status derived from scans | Open source repo, Distribute globally, Distribute to project/agent, Delete from My Skills                             | Deleting My Skills must not silently delete unrelated copied project/agent folders |
| SL-019 | Store Skill   | remote entry source identity equals library  | matched by `source_id`               | Imported / installed                   | Open detail, open remote source URL, update/uninstall where applicable                                                | Refresh must not lose Imported due to temporary clone paths or same display name   |
| SL-020 | Store Skill   | same display name, different source identity | no `source_id` match                 | not imported                           | Import remains available                                                                                              | Must not collapse variants by name                                                 |
| SL-021 | Store Skill   | nested source selected from expanded sidebar  | selected source id                   | Store view active                      | Click child source such as personal store                                                                             | Must switch main view to Store even if user is currently on My Skills              |
| SL-022 | Store Skill   | custom Git/Gitea cloned package install       | cloned repo `SKILL.md` content       | pristine installed baseline            | Install, enter detail, check update                                                                                   | Immediate update check must not report local modifications from install-time sync  |

### Operation Rows

| Operation                         | Required State Transition                                                                                             | Required Tests                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Scan Project / Agent              | Recompute rows from filesystem scan metadata and current My Skills library identity                                   | Black-box component tests for managed copy, unmanaged copy, managed symlink, external symlink, same-name different identity |
| Import scanned Skill to My Skills | Create/update managed Skill from scanned folder, then rescan/reload status so `Import` changes to `Open in My Skills` | Store/service test for durable repo import; component test for visible badge/action transition                              |
| Install My Skill to Project/Agent | Copy or symlink full Skill directory into selected target, then rescan and show `Copy install` or `Symlink install`   | Filesystem/service test for full directory; component test for copy/symlink badges                                          |
| Remove from Project               | Delete only the project-local folder or symlink and refresh project scan                                              | Filesystem/service test plus component test that project row disappears and My Skills source remains                        |
| Uninstall from Agent              | Delete only the platform-local folder/symlink and refresh agent scan; built-ins are blocked                           | Main-process test for path/built-in guard plus component test for disabled built-in uninstall                               |
| Delete from My Skills             | Remove managed PromptHub repo/DB row; prompt about distributed copies/links according to copy/symlink mode            | Service/UI test for copy preserve prompt, PromptHub symlink cleanup, and external symlink non-deletion                      |
| Refresh Store                     | Recompute remote entries with stable source identity and preserve Imported state                                      | Source-id stability test with different clone roots plus component test for Imported after refresh                          |
| Select Store Source               | Selecting a nested source changes both `selectedStoreSourceId` and the main Skill view to Store                       | Sidebar component test starting from My Skills with the Store source group already expanded                                 |
| Install Git Package               | Clone/copy package, sync from repo, then set installed content hash from the synced `SKILL.md` baseline               | Store test where repo sync returns content different from cached registry content                                           |

### Shared Selector Rule

Project and Agent Skill list/detail/status surfaces must use the same selector
or pure helper for:

- matching scanned Skills to My Skills;
- deciding whether an install is external;
- deciding the copy/symlink/external/built-in badge;
- deciding whether `Import to My Skills` or `Open in My Skills` is visible.

Component-local forks of this logic are regression risks and require a matrix
test before they are allowed.

## Package Boundary Test Rule

For any path named import, install, sync, export, distribute, or deploy, the test fixture must be a Skill directory, not a bare `SKILL.md` file. A single-file Skill fixture is allowed only when the test explicitly verifies the single-file compatibility case, and the expected result must still be a directory containing `SKILL.md`.

The minimum file-inventory assertion for package fidelity is:

```text
SKILL.md
docs/guide.md
scripts/setup.sh
assets/icon.png
```

The test must compare relative paths in the managed repo after the operation. Asserting `writeLocalFile("SKILL.md")` or `saveToRepo` was called is not sufficient.

## Coverage and Harness Rule

Skill package-boundary changes require 100% line, function, branch, and condition coverage for new or changed production code. The harness must include:

- black-box filesystem assertions against the managed repo inventory
- white-box branch coverage for GitHub raw-content vs custom Git/Gitea clone-backed paths
- IPC validation for malformed inputs and missing skills
- failure/rollback coverage for clone, copy, sync, and persistence errors
- adversarial path coverage for `../`, absolute paths, hidden internal directories, symlinks, and missing `SKILL.md`
- stress coverage for large package inventories

If a legacy file cannot reach 100% overall in one change, the active change must list the unrelated uncovered branches and still prove every new/changed branch and condition.

## Test Acceptance Rules

A test item from this matrix is not complete until it asserts the user-visible post-condition:

- persisted DB row or status field when persistence is involved
- actual managed repo files when import/copy/symlink is involved
- platform filesystem state when platform install/uninstall is involved
- rendered list/detail/project/store state when UI status is involved
- no stale status after reload or rescan when derived state is involved

Mock call counts alone do not satisfy this matrix.
