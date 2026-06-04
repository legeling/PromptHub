# Implementation

## Investigation Notes

- `SkillBatchDeployDialog` stores the selected mode in `installMode` and passes it directly to `syncSkillsToPlatforms`.
- `syncSkillsToPlatforms` calls `installMdSymlink` only when `installMode === "symlink"`; otherwise it calls `installMd`.
- Main-process `installSkillMd` copies the skill directory through `fs.cp`.
- Main-process `installSkillMdSymlink` creates a directory symlink through `fs.symlink`, with structured fallback to copy only for unsupported symlink errors.
- The direct UI/service mode chain was not reversed.
- A real filesystem bug was reproduced: when the copy source directory itself is a symlink, Node `fs.cp(sourceSymlink, target, { recursive: true })` creates a symlink target. This made copy mode behave like symlink mode for Skills whose PromptHub local repo was a symlink.

## Changes

- Copy-mode platform installs now copy from `fs.realpath(sourceDir)` instead of the root symlink path.
- Project/agent copy distribution through `copyRepoByPathToDirectory()` now copies from `fs.realpath(sourceDir)`.
- Local library imports through `saveToLocalRepo()` and `saveToLocalRepoBySkillId()` now always materialize real files in `data/Skills`, even when the caller requests symlink mode.
- Cherry Studio copy registration now copies from `fs.realpath(sourceDir)`.
- Symlink mode remains unchanged: it creates a symlink to the canonical source directory.
- `materializeManagedRepoSymlink()` replaces legacy managed repo symlink roots with copied real directories.
- `ensureLocalRepoPath()`, `resolveRepoPath()`, and `resolveManagedRepoPath()` trigger lazy materialization for existing managed symlink repos.
- Variant sidecar metadata now records managed repo storage as `copy` for local library imports because `data/Skills` no longer supports symlink storage.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-batch-deploy-dialog.test.tsx tests/unit/services/skill-platform-sync.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-platform.test.ts tests/unit/main/cherry-studio-skill-platform.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts --testNamePattern "copyRepoByPathToDirectory|saveToLocalRepo"`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer-repo.test.ts`
