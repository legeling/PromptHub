# Proposal

## Why

`PUT /api/settings` accepts `promptTagCatalog` as an unbounded string array and persists it to the user's settings JSON/database rows. The catalog is later read by prompt creation/editing and sidebar flows, so oversized or empty tag entries can create unnecessary storage bloat and degrade UI rendering.

## Scope

- In scope:
  - Bound `promptTagCatalog` length and individual tag length in the Web settings route.
  - Reject empty tag entries after trimming.
  - Add a route regression proving rejected catalogs do not persist.
- Out of scope:
  - Normalizing or deduplicating accepted tags.
  - Changing prompt-level tag storage.
  - Auditing all other settings arrays and path fields.

## Risks

- Clients sending empty tags, extremely long tags, or more than the allowed catalog count will now receive `422 VALIDATION_ERROR`.
- Existing valid catalogs remain accepted.

## Rollback Thinking

Rollback removes the `promptTagCatalog` schema limits and regression test. No data migration is required.
