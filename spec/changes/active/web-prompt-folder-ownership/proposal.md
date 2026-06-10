# Proposal

## Why

Web prompt APIs accept and manage durable metadata such as `folderId`, `images`,
`videos`, and tags directly. Folder routes already enforce visibility and owner
boundaries for folder nesting, and media upload routes already validate safe
filenames, but prompt writes and tag management must enforce the same
boundaries before storing or mutating metadata. Without this, prompts can point
at another user's private folder, mix shared/private folder visibility, persist
unsafe media filenames, or leak/mutate another user's private tags.

## Scope

- In scope:
  - Validate `folderId` on normal Web prompt create/update/copy flows.
  - Validate `images` and `videos` filenames on normal Web prompt create/update
    flows.
  - Keep private prompts under folders owned by the caller.
  - Keep shared prompts under shared folders.
  - Preserve admin-only shared prompt creation/update semantics.
  - Scope prompt tag list/rename/delete APIs to actor-visible or actor-writable
    prompts.
  - Add route regressions for cross-user and visibility-mismatch folder
    references, unsafe media references, and tag isolation.
- Out of scope:
  - Backup/import/direct-insert compatibility paths, which restore historical
    snapshots and are guarded by separate sync snapshot validation.
  - Database schema changes.
  - Desktop UI changes.

## Risks

- Existing invalid prompt/folder references created by older builds may remain
  until edited or rebuilt; this change prevents new invalid writes through the
  normal Web prompt APIs.
- Existing invalid media references created by older builds may still fail
  during export/sync until cleaned, but new normal API writes are guarded.
- Existing tags remain in place, but tag list/rename/delete now operate only on
  rows the current actor should see or modify.
- Shared prompt copy behavior needs care: copying a shared prompt into a normal
  user's private library must not retain a shared folder reference the user
  cannot own.

## Rollback Thinking

Rollback is limited to removing the new PromptService reference checks, scoped
tag operations, and associated tests. No migration or persistent schema delta is
introduced.
