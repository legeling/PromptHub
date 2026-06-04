# Design

## Boundary

The install mode boundary is:

1. Batch deploy dialog mode selection.
2. `syncSkillsToPlatforms(..., installMode)`.
3. Preload `window.api.skill.installMd` or `installMdSymlink`.
4. Main-process `installSkillMd` or `installSkillMdSymlink`.
5. Filesystem operation: `fs.cp` for copy, `fs.symlink` for symlink.

## Intended Behavior

- Selecting copy must call `installMd` and must not call `installMdSymlink`.
- Selecting symlink must call `installMdSymlink` and must not call `installMd`.
- Symlink failure may fall back to copy only through a structured result with `requestedMode: "symlink"` and `effectiveMode: "copy"`.
- PromptHub-managed `data/Skills` repositories are backup source data and must always be real directories/files, never symlink roots.
- Symlink mode is allowed only for distribution targets, such as platform, project, and agent Skill directories.
- Existing managed repo symlinks must be materialized into real directories before normal repo reads/writes continue.

## Verification

- Component black-box test for the batch deploy dialog: click Copy and Symlink and assert the effective API call.
- Existing renderer service tests assert service-level API routing and fallback collection.
- Existing main-process tests assert `installSkillMd` copies and `installSkillMdSymlink` symlinks or returns fallback.
- Filesystem tests assert managed `data/Skills` copy/import paths materialize symlinked sources and legacy managed symlink repos.
