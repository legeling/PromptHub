# PromptHub 0.6.0 Version Alignment Design

> Completed change history. Current requirements: [owning topic](../../../releases/0.6.0.md). Earlier proposals and designs below are retained as evidence, not current instructions.

<!-- traceability: enforced -->

## `DES-REL-001`: Distribution Version Sources

Update `package.json`, each shipped app's `package.json`, and the Expo
`app.json`. Keep `packages/core`, `packages/db`, and `packages/shared` on their
independent private package versions.

## `DES-REL-002`: Public Stable Source

Use the pure release-metadata selector from the archived website boundary
change. It
scans explicit stable records plus dated changelog headings in `O(n + m)` time
and `O(1)` additional space. The generator uses that result for public badges
and download URLs instead of the root build version.

This preserves an explicit public truth source: a release becomes public only
when the release index marks it stable and the matching changelog entry is
dated. The root manifest remains the source for build artifacts, not
publication state. The implementation is recorded in the related archived
website boundary change.

## `DES-REL-003`: Preparation Records

Add a `0.6.0` release record with `Preparation` status and an `Unreleased`
changelog summary. Do not change localized README stable badges or fixed
download links until publication.

## `DES-REL-004`: Stable GHCR Alias Isolation

The Self-Hosted Web tag workflow always publishes immutable prerelease tags
such as `0.6.0-beta.1`, `v0.6.0-beta.1`, the source tag, and commit SHA. It
publishes the mutable `latest` alias only when `github.ref_name` has no semver
prerelease suffix. The decision is constant-time string classification and does
not change image contents, build inputs, registry authentication, or the
stable-versioned tags already present in GHCR.

## Affected Areas

- Data model: none
- IPC / API: none
- Filesystem / sync: manifest and generated documentation files only
- UI / UX: no runtime UI change; public website remains on the published stable
  release

## Tradeoffs

- An explicit stable release-index status becomes the publication switch. This
  prevents release-preparation builds and prematurely dated changelog entries
  from leaking into public download copy.
- The selector avoids a semver dependency because stable `major.minor.patch`
  comparison is small, deterministic, and covered by boundary tests.

## Failure And Rollback

- External boundary: website generation writes repository files only; it makes
  no network calls.
- Partial failure behavior: synchronization fails before publication when no
  dated stable changelog entry exists.
- Recovery/rollback: restore manifest versions and regenerate website metadata
  from the unchanged published stable record.

## Analyze Result

- Requirement links: `FR-REL-001`, `FR-REL-002`, `NFR-REL-001`
- Verification links: `TEST-REL-001` through `TEST-REL-005`
- Blocking conflicts: none; the existing `0.5.9` replacement change remains a
  historical publication record and does not own the next release version
- Unresolved `[待确认]`: none

## Traceability

| Requirement   | Design                       | Verification                                   | Task                     |
| ------------- | ---------------------------- | ---------------------------------------------- | ------------------------ |
| `FR-REL-001`  | `DES-REL-001`                | `TEST-REL-001`                                 | `T-REL-001`              |
| `FR-REL-002`  | `DES-REL-002`, `DES-REL-003` | `TEST-REL-002`, `TEST-REL-003`, `TEST-REL-005` | `T-REL-002`, `T-REL-003` |
| `NFR-REL-001` | `DES-REL-002`                | `TEST-REL-003`, `TEST-REL-004`                 | `T-REL-002`              |
| `FR-REL-003`  | `DES-REL-004`                | `TEST-REL-006`                                 | `T-REL-006`, `T-REL-007` |
