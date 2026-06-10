# Proposal

## Why

Web Skill safety reports have a dedicated `PUT /api/skills/:id/safety-report`
route with a strict schema. The generic `PUT /api/skills/:id` route also
accepted `safetyReport` as `z.any()`, which let callers persist forged or
malformed safety state without using the dedicated validation boundary.

## Scope

- In scope:
  - Reject `safetyReport` in generic Skill updates.
  - Keep explicit safety report writes on `PUT /api/skills/:id/safety-report`.
  - Add a route regression proving generic updates cannot persist a report.
- Out of scope:
  - Changing AI safety scan behavior.
  - Changing Skill source metadata import/update behavior.
  - Changing desktop Skill APIs.

## Risks

- Any caller that writes safety reports through the generic update route must
  move to the dedicated safety-report endpoint. The Web client already exposes
  that endpoint.

## Rollback Thinking

Rollback is limited to removing the schema rejection and regression test. No
database schema, migration, or stored data transformation is introduced.
