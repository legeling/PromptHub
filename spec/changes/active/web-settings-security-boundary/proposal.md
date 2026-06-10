# Proposal

## Why

The Web settings update route accepts a `security` object with
`masterPasswordConfigured` and `unlocked` booleans. Those fields represent
security state, not ordinary user preference. Letting a normal settings PUT
persist them lets a client claim that private content is unlocked or that a
master password exists without going through a dedicated security flow.

## Scope

- In scope:
  - Reject `security` in normal `PUT /api/settings` requests.
  - Add a route regression that proves rejected security updates do not persist.
  - Preserve `null` as a clear signal for nullable live settings such as
    `defaultFolderId`.
  - Preserve existing settings read, partial preference update, and sync config
    validation behavior.
- Out of scope:
  - Desktop security IPC and desktop settings store behavior.
  - Import/export or sync snapshot compatibility for historical settings
    payloads.
  - Introducing a Web master-password implementation.

## Risks

- Existing clients that incorrectly sent `security` through general settings
  will now get a validation error and must stop sending that field.
- Settings clears must delete stale SQLite KV rows and workspace JSON fields
  rather than merely returning a transient cleared value.

## Rollback Thinking

Rollback is limited to re-allowing the `security` field in the Web settings
update schema and removing the regression. No schema migration is introduced.
