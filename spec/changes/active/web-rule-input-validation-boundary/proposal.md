# Proposal

## Why

Web Rules project creation and backup-record import both write to the managed
rules workspace. The workspace service already rejects unsafe path segments, but
the Web routes let those service errors escape as `500 INTERNAL_ERROR`. Malformed
user input should return a validation error and must not be reported as an
internal server fault.

## Scope

- In scope:
  - Reject unsafe project rule ids in `POST /api/rules/projects`.
  - Convert unsafe imported rule record errors from `POST /api/rules/import-records`
    into `422 VALIDATION_ERROR`.
  - Add route regressions proving unsafe input does not create rule records or
    workspace files.
- Out of scope:
  - Changing the managed rules workspace layout.
  - Changing backup/sync payload shape.
  - Changing desktop Rules IPC behavior.

## Risks

- Existing callers that provide custom project ids with path separators or
  control characters will now get `422`. Generated ids and UUID-like ids remain
  accepted.

## Rollback Thinking

Rollback is limited to removing route validation/error mapping and the route
regressions. No schema migration or stored data transformation is introduced.
