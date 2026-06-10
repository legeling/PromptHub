# Proposal

## Why

`packages/core/src/rules-workspace.ts` owns the shared Rules workspace used by
desktop and CLI flows. It writes managed rule files, `_rule.json`, version
snapshots, and version indexes directly with `writeFile`. If a write is
interrupted, durable Rules truth under `data/rules/` can be left as truncated
JSON or partial Markdown.

## Scope

- Add atomic same-directory publication for shared Rules workspace files under
  `data/rules/`.
- Preserve existing target-file sync behavior and rule descriptor contracts.
- Add regression coverage for interrupted managed-rule writes.
- Sync stable Rules persistence behavior documentation.

## Risks

- Atomic publication changes the write path for managed workspace files by
  introducing temporary sibling files before rename.
- External target rule writes are not changed in this pass to avoid altering
  user-managed path semantics such as symlinks.

## Rollback

Revert the atomic write helpers and restore direct `writeFile` calls. The
regression test should fail if interrupted managed writes can again replace the
previous readable rule content.

## Impacted User Flows

- Desktop Rules saves and conflict resolution.
- CLI/shared Rules workspace saves.
- Rules backup import and version history publication.
