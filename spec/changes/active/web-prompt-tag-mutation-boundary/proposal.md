# Proposal

## Why

Prompt create/update routes bound tag length and reject empty tags, but the Web
prompt tag management routes only require non-empty `oldTag`, `newTag`, and
`tag` values. A rename can therefore write an oversized tag into existing prompt
metadata, bypassing the normal prompt metadata boundary and increasing storage
and UI rendering risk.

## Scope

- In scope:
  - Reuse the prompt metadata tag schema for tag rename/delete route payloads.
  - Reject empty or oversized tag mutation payloads before service mutation.
  - Add route regressions proving rejected payloads do not mutate prompt tags.
- Out of scope:
  - Changing prompt tag normalization/deduplication semantics.
  - SQL-level prompt list filtering performance work.

## Risks

- Clients that previously sent oversized tag rename/delete payloads will now
  receive `422 VALIDATION_ERROR`.
- Existing valid tag management workflows remain unchanged.

## Rollback Thinking

Rollback restores the looser route schemas and removes the regression test. No
database migration is required.
