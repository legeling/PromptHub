# Skills Delta Spec: Package Boundary

## ADDED Requirements

### REQ-SKILL-PKG-001: Skill Package Definition

PromptHub MUST model a Skill as a directory-level package. `SKILL.md` is the required entrypoint inside that package, not the package itself.

#### Scenario: Single-file skill remains a package

Given a Skill has no supporting files
When PromptHub creates or imports it
Then the managed representation is still `<skill-root>/SKILL.md`
And all APIs must treat `<skill-root>` as the Skill identity and file boundary.

### REQ-SKILL-PKG-002: Import Preserves Full Directory

Any operation named import, install from store, install from Git/Gitea, install from local directory, sync from source, export, distribute, or deploy MUST preserve the full Skill directory tree except for explicit ignored entries such as `.git` and `.prompthub`.

#### Scenario: Custom Gitea skill with resources

Given a custom Gitea source contains:

- `SKILL.md`
- `scripts/setup.sh`
- `docs/guide.md`
- `assets/icon.png`

When the user installs that Skill from the store
Then the managed local repo contains those files with the same relative paths
And the directory fingerprint is computed from the full file inventory
And safety scan and file browser operate on the managed directory, not only `SKILL.md`.

### REQ-SKILL-PKG-003: Content-only Write Is Not Import

Content-only APIs that write a `SKILL.md` string MAY be used for new UI-authored Skills or editing the existing `SKILL.md` entrypoint. They MUST NOT be used as the final persistence path for any source that has, or may have, a package directory.

#### Scenario: Store entry has a remote package source

Given a registry entry carries `source_url`, branch/directory metadata, canonical path, or a directory fingerprint
When the user installs it
Then PromptHub must resolve and persist the source package directory
And a fallback to writing only `SKILL.md` must be treated as incomplete unless the source is explicitly single-file.

### REQ-SKILL-PKG-004: Installed Package Safety Scan Uses Managed Files

Safety scanning an installed Skill MUST scan the managed local package directory when it exists. Source URL validation MAY contribute provenance findings, but it MUST NOT prevent scanning an already-installed managed package.

#### Scenario: Installed custom Gitea package has an internal source host

Given a Skill was installed from a custom Gitea store
And the Skill has a managed local repo path with `SKILL.md` and nested resource files
And its `source_url` or `content_url` resolves to an internal or otherwise blocked address
When the user runs safety scan from the installed Skill or store detail
Then PromptHub scans the managed local package files with the configured AI model
And the blocked/internal source is surfaced as provenance context for review
And the scan does not fail with `SAFETY_SCAN_BLOCKED_SOURCE`.

#### Scenario: Remote pre-install scan has an internal source host

Given a store entry is not installed locally
And no managed local repo path is available
When its source URL resolves to an internal or otherwise blocked address
Then PromptHub blocks the pre-install scan before calling AI.

## MODIFIED Requirements

### Existing Skill File Contract

The existing `SKILL.md` contract is narrowed to mean entrypoint file contract. It must not be read as the full Skill persistence contract.

## Test Requirements

- Regression tests must use a full-repo fixture with nested files.
- Main-process package persistence tests must assert filesystem post-conditions by comparing relative file inventories.
- Renderer store orchestration tests must prove package-capable registry entries use the package import API and do not finish by writing only `SKILL.md`.
- For custom Git/Gitea sources, tests must cover non-GitHub clone-backed sources, not only GitHub raw file APIs.
- Safety scan and file browser tests must verify downstream consumers read the managed repository path and nested package files.
- Safety scan tests must distinguish remote pre-install source checks from installed managed-package scans.
