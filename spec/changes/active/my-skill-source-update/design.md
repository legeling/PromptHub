# Design

## Boundary

The store remains the owner of installed skill source update decisions because it already owns registry skill comparison, install fingerprints, and local repo synchronization.

## Source Candidate Resolution

For an installed skill id:

1. Prefer a cached `RegistrySkill` candidate matched by `source_id`, `content_url`, or `source_url`.
2. If none exists, derive a temporary `RegistrySkill` candidate from the installed skill metadata.
3. For GitHub tree URLs, derive `content_url` as `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<directory>/SKILL.md`.
4. Keep fallback metadata conservative: installed name, description, author, category, source fields, and `version` as `"source"` because the raw GitHub file alone does not provide a reliable remote version.

## Update Semantics

The installed-source path reuses `getRegistrySkillUpdateStatus()`. Applying an update follows the existing registry update flow:

- create a version snapshot
- update SQLite skill fields and install fingerprint
- sync the managed local repo from the remote skill package where supported
- return the same status family as registry updates

## Source Package Update Boundary

Installed-source updates must preserve the original package source semantics. If an installed Skill has package-level metadata such as `source_directory`, `canonical_skill_path`, `directory_fingerprint`, `package_url`, or a managed `local_repo_path`, the update action treats it as a package update, not as a raw `SKILL.md` rewrite.

For Git/GitHub/Gitea package sources, the update action uses the recorded `source_url`, `source_branch`, and package directory to refresh the managed repo through `saveRemoteGitToRepo()` and `syncFromRepo()`. This means an original SSH source such as `git@github.com:owner/repo.git` remains the update transport source instead of being converted into a raw HTTPS download. `content_url` remains useful for checking the entrypoint hash, but it must not force package updates through per-file raw HTTP downloads.

Raw `content_url` update remains valid only for explicit single-file sources that do not advertise package metadata.

## Local Modification Detection Source

For installed package Skills with a managed `local_repo_path`, the managed repo `SKILL.md` is the local package source of truth. Before checking installed-source update status, PromptHub should sync the DB row from the managed repo so stale or previously truncated DB content does not masquerade as a user edit.

Repo-to-DB sync must preserve the complete `SKILL.md` content. Import sanitization may trim surrounding whitespace and reject malformed field types, but it must not silently truncate Skill content, metadata fields, tags, prerequisites, or compatibility entries. Any future size cap belongs at an explicit validation boundary that rejects the payload with a visible error instead of mutating persisted Skill data.

## Package Freshness Detection

Installed package Skills are not fresh merely because the local and remote `SKILL.md` entrypoints match. When package metadata records a full package boundary, the update check must compare the installed `directory_fingerprint` with a remote package fingerprint computed by the same local package algorithm: clone or download the package into a temporary directory, read the package files, ignore the standard generated/internal entries, hash each file's bytes, build the normalized manifest, and compute the directory fingerprint from that manifest.

PromptHub must not compare Git provider tree/blob identifiers directly against local `directory_fingerprint`. GitHub tree or blob SHA values are provider object identifiers, not PromptHub package fingerprints. Mixing them can create false positives where an already-updated local package still appears out of date.

The package fingerprint ignore list is explicit, not a blanket "ignore every hidden file" rule. It excludes PromptHub-owned metadata such as `.prompthub/`, VCS metadata such as `.git/`, dependency folders, cache/build/test byproducts, logs, editor temporary files, OS sidecars, virtual environments, local environment secrets such as `.env` / `.env.local`, and runtime state such as `*.pid` / `*.sock`. It keeps distributable package assets, including hidden template files such as `.env.example`, `.env.sample`, and `.env.template`.

For package Skills, version labels are secondary metadata. A registry or source version label change must not create an `update-available` status when the current local package fingerprint equals the freshly computed remote package fingerprint and the entrypoint content hash also matches. In that case PromptHub may refresh the installed baseline metadata, but the user-facing status remains `up-to-date`.

A changed asset, script, reference, example, or agent config file must report `update-available` even when `SKILL.md` content and `installed_content_hash` are unchanged. After update and repo sync, if the local package fingerprint equals the current remote package fingerprint, the source status is `up-to-date`.

## UI

The My Skills detail header gets a compact source update action for non-project/non-agent details. A first click checks. If an update is available, the next action applies it. Conflict/local-modified results are surfaced by toast and do not overwrite content by default.

## Compatibility

No schema or IPC contract changes are required. Existing skills without source metadata simply do not expose the source update action.
