# Proposal

## Why

Web skill workspace export removes `data/skills` before rewriting skill
metadata, `SKILL.md`, versions, and restored sidecar files. If any write fails
after the removal, the previous usable skill workspace can disappear or become
partial even though the database remains updated.

## Scope

- Make web skill workspace exports write to a sibling staging directory before
  replacing the live workspace.
- Preserve the previous live skill workspace when staging writes fail.
- Ensure interrupted export scratch directories are ignored by workspace import
  scans.
- Add regression coverage for interrupted `SKILL.md` writes.

## Risks

- Directory replacement must preserve restored sidecar files and version files.
- Temporary staging or backup directories may remain after process crashes and
  must not be treated as valid skill directories.

## Rollback

Revert staged skill workspace exports and return to direct `data/skills`
rewrites. The regression test will fail if this reintroduces workspace loss.

## Impacted User Flows

- Web skill create/update/version operations that trigger workspace sync.
- Web import/sync flows that rebuild skill workspace files from restored
  database records and `skillFiles`.
