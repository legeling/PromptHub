# Proposal

## Why

`PUT /api/settings` accepts `skillProjects` as persisted project skill-management state. The current Web schema requires only rough field types and leaves the project count and path arrays unbounded. Large or empty project records can bloat settings storage and degrade the desktop project skills UI that reads this list.

## Scope

- In scope:
  - Bound `skillProjects` count.
  - Require non-empty trimmed `id`, `name`, and `rootPath`.
  - Bound `scanPaths`, `deployTargets`, and individual path string lengths.
  - Add route regressions proving invalid project settings do not persist.
- Out of scope:
  - Changing project skill import/deploy semantics.
  - Validating filesystem existence.
  - Deduplicating or normalizing accepted project path arrays.

## Risks

- Over-broad clients that send empty or very large skill project settings now receive `422 VALIDATION_ERROR`.
- Existing reasonable project settings remain accepted.

## Rollback Thinking

Rollback removes the skill project schema limits and route regression. No schema or data migration is required.
