# Proposal

## Why

Web folder reorder accepts an ordered list of folder ids. Duplicate ids make the requested order ambiguous and can produce inconsistent `sort_order` writes through the database reorder helper. The API should reject duplicate reorder identities before any durable mutation or workspace sync.

## Scope

- In scope:
  - Reject duplicate ids in `FolderService.reorder()`.
  - Add a route-level regression test proving the API returns validation error and preserves the existing folder order.
  - Document the API and storage boundary for this fix.
- Out of scope:
  - Changing folder schema, migrations, or sort-order storage.
  - Changing folder drag-and-drop UI behavior.
  - Refactoring shared `FolderDB.reorder()` semantics for CLI or desktop.

## Risks

- Clients that accidentally send duplicate folder ids now receive `422 VALIDATION_ERROR` instead of a successful but ambiguous reorder.
- Existing valid reorder payloads must continue to work unchanged.

## Rollback Thinking

The change is service-level validation only. Rollback removes the duplicate-id guard and regression test; no data migration or compatibility cleanup is required.
