# Proposal

## Why

`PUT /api/settings` accepts `customAgents` as unbounded objects with unbounded strings. These records are persisted to settings storage and later interpreted by desktop renderer/main code as user-defined agent platforms. Empty or oversized custom agent records can create invalid platform entries, bloat settings storage, and slow agent/platform rendering.

## Scope

- In scope:
  - Bound `customAgents` count.
  - Require non-empty `id`, `name`, and `rootPath` values after trimming.
  - Bound custom agent asset path fields and `configRelativePaths`.
  - Add route regressions proving invalid custom agent settings do not persist.
- Out of scope:
  - Changing desktop custom agent migration behavior.
  - Validating filesystem existence or absolute/relative path semantics.
  - Normalizing or deduplicating accepted custom agents.

## Risks

- Over-broad clients that send empty or very large custom agent configs now receive `422 VALIDATION_ERROR`.
- Existing reasonable custom agent settings remain accepted.

## Rollback Thinking

Rollback removes the custom agent schema limits and route regression. No schema or data migration is required.
