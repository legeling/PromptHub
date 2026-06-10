# Proposal

## Why

Web rule workspace import rewrites `.versions/<rule-id>/` by deleting the live
version directory before writing imported version files. If a version write
fails after that deletion, the managed rule can keep new content/metadata while
the previous version history is lost or left partial.

## Scope

- Make web rule version imports write into a sibling staging directory before
  replacing the live rule version directory.
- Preserve the previous readable version history when staging writes fail.
- Add regression coverage for interrupted version writes.

## Risks

- Directory replacement must not make the current rule body unreadable.
- Interrupted staging directories should not be treated as valid version
  histories.

## Rollback

Revert staged version directory writes and restore direct version directory
rewrites. The regression test will fail if this reintroduces version-history
loss.

## Impacted User Flows

- Web backup/import and sync imports that include rule records.
- Web rules project creation/import paths that persist version snapshots.
