# Release Version Delta

> Completed change history. Current requirements: [owning topic](../../../../../releases/0.6.0.md). Earlier proposals and designs below are retained as evidence, not current instructions.

## Added Requirements

### `FR-REL-001`: Product Version Alignment

The root manifest owns the current build identity on the `0.6.0` release line.
Every shipped application distribution and the standalone CLI runtime must
report that exact candidate version. The published stable version is `0.6.0` as of 2026-10-18;
subsequent main-branch changes remain explicitly unreleased. Contribution-branch version labels must
not change this identity merely because their commits were merged.

#### `AC-REL-001`

Desktop, CLI, self-hosted Web, Cloudflare Worker, Mobile package, Expo metadata,
and CLI runtime all match the root manifest. Public READMEs distinguish that
development identity and unreleased changes from stable downloads and historical
published previews.

### `FR-REL-002`: Published Stable Isolation

Preparing `0.6.0` must not cause public website badges, introduction copy, or
download URLs to claim that `0.6.0` is published.

#### `AC-REL-002`

Website release synchronization selects the highest version explicitly marked
`stable record` in `spec/releases/README.md`, ignoring preparation records,
`[Unreleased]`, and prerelease entries.

#### `AC-REL-003`

Once `0.6.0` is marked as a stable record and has a matching dated changelog
entry, the same synchronization path selects `0.6.0`.

### `NFR-REL-001`: Deterministic Linear Selection

Release metadata selection must scan the release index and changelog linearly,
use bounded working memory, and fail explicitly when the published stable
record or its dated changelog entry is missing.

### `FR-REL-003`: Prerelease GHCR Isolation

Self-Hosted Web prerelease tags MUST publish versioned GHCR images without
moving the mutable stable `latest` alias.

#### `AC-REL-004`

Given a tag such as `v0.6.0-beta.1`, the workflow emits prerelease-version and
commit-specific image tags but does not emit `latest`. Given a stable tag such
as `v0.6.0`, the same workflow emits `latest` in addition to versioned tags.

## Verification

- `TEST-REL-001`: read the candidate identity from the root manifest, assert the
  `0.6.0` release line, and verify all product manifests and CLI runtime match;
  also verify development/stable README separation and website changelog sync.
- `TEST-REL-002`: assert a preparation record does not replace the published
  stable record.
- `TEST-REL-003`: assert the highest explicitly published stable semver is
  selected.
- `TEST-REL-004`: assert missing stable records and missing dated changelog
  entries fail explicitly.
- `TEST-REL-005`: run website synchronization and verify generated public
  metadata remains on the latest published stable version.
- `TEST-REL-006`: assert the Self-Hosted Web workflow gates the raw `latest`
  image tag on a stable ref name and rejects the previous any-`v*` condition.
