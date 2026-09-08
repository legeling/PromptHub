# Skill package durability and lossless snapshots

## Scope

Fix the three defects confirmed by the September 8 Skill review:

- Missing working caches must not erase authoritative package files during metadata updates.
- Managed package edits, renames and deletions must survive workspace reconstruction.
- Version snapshots and JSON/Gzip backups must preserve file bytes instead of preview placeholders.

Owners: shared persistence workflows in `packages/core`, shared snapshot contracts in
`packages/shared`, desktop IPC and backup adapters in `apps/desktop`. SQLite remains
a projection; canonical bundles remain authoritative. No release, remote operation,
live-profile migration or unrelated foundation refactor is authorized.

## Status

Completed locally and archived on 2026-09-08; unreleased. Existing
text history remains readable; new binary history requires updated consumers and
explicit capability boundaries. See `design.md` for the accepted decision.

Related changes: `foundation-integrity-redesign` owns canonical publication outcomes;
`skill-canonical-prompthub-bundle-recovery` owns inventory validation;
`webdav-skill-backup-observability` owns backup reporting. Preserve their dirty work.
