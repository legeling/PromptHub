# Proposal

## Why

Skill version numbers are derived state owned by the versioning workflow. The
generic `PUT /api/skills/:id` route accepted `currentVersion`, allowing an
authenticated caller to overwrite the counter and make future version snapshots
jump to arbitrary numbers.

## Scope

- In scope:
  - Reject `currentVersion` in generic Skill updates.
  - Keep version counters managed by `POST /api/skills/:id/versions`.
  - Add a route regression proving rejected counter writes do not affect the
    next version number.
- Out of scope:
  - Changing Skill rollback semantics.
  - Changing persisted `skill_versions` schema.
  - Changing desktop Skill version APIs.

## Risks

- Any caller that previously used generic updates to alter `currentVersion`
  must stop doing so. That behavior corrupts the versioning invariant and is not
  a supported user workflow.

## Rollback Thinking

Rollback is limited to removing the schema rejection and regression test. No
database migration or stored data transformation is introduced.
