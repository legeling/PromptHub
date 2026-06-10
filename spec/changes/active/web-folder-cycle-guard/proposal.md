# Proposal

## Why

Web folder update/direct restore paths validate parent visibility and owner
boundaries, but normal folder update does not currently prevent assigning a
folder's parent to itself or to one of its descendants. That can create folder
cycles in SQLite. Prompt workspace rebuild has defensive cycle truncation, and
sync import rejects cycles, but normal Web API writes should not be able to
create cyclic folder state in the first place.

## Scope

- In scope:
  - Reject self-parent and descendant-parent updates through normal Web folder
    update APIs.
  - Allow normal Web folder updates to clear `parentId` and move a nested folder
    back to the root.
  - Reject visibility-only updates that would leave a parent and child folder
    with mismatched visibility.
  - Add route regressions for direct self-parent, descendant cycles, and
    root-level moves, plus visibility-only mismatch paths.
  - Preserve existing folder visibility/owner rules and reorder behavior.
- Out of scope:
  - Import/direct-insert compatibility paths, which are used for restored
    snapshots and guarded by sync snapshot validation.
  - Database schema changes.
  - Desktop renderer tree behavior.

## Risks

- Existing cyclic folder rows created by older builds may still need recovery,
  but this change prevents new cycles through normal Web API updates.

## Rollback Thinking

Rollback is limited to removing the folder cycle guard and associated tests.
No migration or persistent schema delta is introduced.
