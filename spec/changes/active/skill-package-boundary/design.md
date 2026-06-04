# Skill Package Boundary Design

## Current Findings

The implementation has two different persistence concepts:

- Directory/package path: `saveToLocalRepo`, `saveToRepo`, `copyRepoByPathToDirectory`, `scanLocalPreview`, `copyRepoToPlatform`.
- Content-only path: `saveContent`, `saveContentToLocalRepo`, `writeLocalFile("SKILL.md")`, `installFromSkillContent` without `repoSourceDir`.

That split is valid only if call sites preserve the semantic distinction:

- Create/edit `SKILL.md` content: content-only write is acceptable.
- Import/install/sync a Skill from any external source: directory/package copy is required.

The escaped Gitea issue appears because `scanRemoteGithub` clones a non-GitHub Git/Gitea source into a temporary directory, scans full Skill folders, then returns only registry metadata plus `content` and no durable local package source. Later `installRegistrySkill` creates the DB row and writes `SKILL.md`; `syncRemoteGitHubSkillRepo` only handles GitHub raw/tree APIs, so Gitea cannot recover the rest of the folder tree.

## Boundary Decision

PromptHub's internal canonical Skill storage is always a package directory:

```text
<managed-skill-root>/
├── SKILL.md
├── scripts/
├── docs/
└── assets/
```

`SKILL.md` is the required entrypoint and content source. It is not the complete package boundary.

## API Ownership Implications

- `packages/shared` owns cross-process Skill fields that identify package sources: `source_id`, `source_url`, `source_branch`, `source_directory`, `canonical_skill_path`, `local_repo_path`, `directory_fingerprint`.
- Main-process services own filesystem persistence and must provide package-level import/sync APIs for Git/Gitea sources.
- Renderer store may orchestrate user flows, but should not decide package fidelity by falling back to `writeLocalFile("SKILL.md")` when source metadata indicates a package.
- Public store adapters must surface package-level sources when the upstream site exposes them:
  - `skills.sh` entries are Git package installs. Standard repositories named `skills` may expose `skills/<skill-name>` directly; other repositories must not guess that layout and instead let the main-process installer clone the repo and match the target `SKILL.md` by frontmatter name / directory name.
  - `ClawHub` entries use the official `/api/v1/download?slug=<slug>` zip package URL.
  - Marketplace JSON entries may expose `package_url`, `zip_url`, or `download_url`; these must install as complete packages, not as `SKILL.md` only.

## Required TDD Before Code Fix

1. Main-process package import test:
   - create a temp Git/Gitea-style repo fixture with `SKILL.md`, `scripts/setup.sh`, `docs/guide.md`, `assets/icon.png`
   - install/import through the same non-GitHub store path
   - assert the managed repo file inventory equals the source inventory minus explicit ignored entries

2. Store install persistence test:
   - install a registry skill whose source has directory metadata and fingerprint
   - assert final `local_repo_path` points to a managed package directory
   - assert only writing `SKILL.md` is insufficient and fails the test

3. Safety/file-browser coupling test:
   - after import, safety scan and file listing must see nested resource files
   - this prevents a later fix that copies files but leaves downstream consumers bound to `SKILL.md` only

4. Public store package fidelity tests:
   - `skills.sh` install must call Git package sync. Standard `owner/skills/<skill>` entries pass the derived directory; non-standard repositories omit the directory so the main process resolves the matching package after cloning.
   - `ClawHub` install must download and extract the zip package into the managed repo.
   - zip imports must reject path traversal and clean temporary extraction directories.

## Design Conflict To Avoid

Do not solve this by saying “Gitea does not support raw tree sync, so single-file install is acceptable.” That would contradict the package definition. If direct remote tree sync is not available, the design must use clone-backed package persistence or block installation as incomplete.
