# Proposal

## Why

Web import writes folders, prompts, versions, skills, rules, settings,
workspace files, and pulled media in sequence. Preflight validation catches many
invalid payloads, but a write-time failure can still happen after earlier
records have already been inserted. That can leave a partially imported library,
or media files without matching records, and confuse recovery.

## Scope

- In scope:
  - Make `BackupService.import` database writes atomic.
  - Validate imported media before DB writes and write media only after a
    successful import.
  - Add a regression that simulates a write-time failure after records are
    inserted and proves records and pulled media are rolled back.
- Out of scope:
  - Reworking import payload schema or merge semantics.
  - Rewriting workspace sync internals.

## Risks

- Wrapping import in a transaction changes failure behavior from partial success
  to rollback. This is the intended recovery behavior.

## Rollback Thinking

Rollback is limited to removing the import transaction and regression. No schema
or migration change is introduced. The route-level media write ordering can be
rolled back independently if needed.
