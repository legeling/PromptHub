# PromptHub 0.6.0 Version Alignment

## Phase And Status

- Phase: converge
- Status: release-pending
- Primary requirement: `FR-REL-001`
- Exit condition: all product distributions report the selected `0.6.0`-line
  candidate from the root manifest, while public
  stable-facing surfaces continue to advertise the latest published stable
  version until `0.6.0` is explicitly promoted to a stable release record.

## Why

PromptHub is preparing the `0.6.0` release line. The current build identity is
`0.6.0-beta.2` across Root, Desktop, CLI, Web, Worker, Mobile, and Expo. The
root manifest owns that candidate identity; contribution branches named
`0.6.3` or `0.6.4` do not advance the mainline release version.

The website release generator previously treated the root package version as an
already-published release. That boundary is now hardened by the related website
stable-metadata change, so this version bump can prepare build artifacts without
advertising nonexistent `0.6.0` downloads.

## Scope

- In scope:
  - align product distribution manifests and CLI runtime to the selected
    `0.6.0`-line candidate; stable promotion uses `0.6.0`
  - align the project context version in `AGENTS.md`
  - record `0.6.0` as a release preparation
  - keep public stable downloads and badges on the latest explicit stable
    release record
  - publish and verify prerelease Web images under versioned GHCR tags without
    moving the stable `latest` image
  - verify the explicit public stable release boundary
- Out of scope:
  - creating or pushing a `v0.6.0` tag
  - publishing the stable `v0.6.0` GitHub Release, container alias, or package
    registry versions
  - changing historical `0.5.9` release records and download history
  - changing the independent private package versions under `packages/*`

## Risks

- A missed product manifest could produce artifacts with inconsistent versions.
- Premature website synchronization could create broken `0.6.0` download links.
- A prerelease tag could overwrite GHCR `latest` and silently move stable
  self-hosted deployments onto a beta image.
- The dirty worktree contains unrelated feature work; release edits must remain
  isolated and must not rewrite those files.

## Rollback Thinking

Documentation reconciliation can be reverted without changing manifests or
published beta records. A future candidate identity rollback uses the previous
candidate's release record while retaining public stable metadata. No database,
filesystem, or user-data migration is introduced by version alignment.

## Related Records

- Release rules: `spec/releases/release-rules.md`
- Release index: `spec/releases/README.md`
- Previous stable record: `spec/releases/0.5.9.md`
- Website boundary:
  `spec/changes/archive/2026/07/2026-07-30-website-release-metadata-stable-boundary/`
