# Proposal

## Why

`POST /api/skills/:id/safety-scan` accepted malformed JSON request bodies as an
empty override object. That let damaged or malformed client requests continue
into the safety scan flow and return `AI_NOT_CONFIGURED` instead of the shared
`Invalid JSON request body` contract used by other Web JSON routes.

## Scope

- In scope:
  - Reject malformed JSON on the legacy Skill safety scan route with
    `400 BAD_REQUEST`.
  - Preserve empty-body behavior for callers that scan a stored Skill without
    overrides.
  - Add a route regression proving malformed JSON does not trigger AI fetch.
- Out of scope:
  - Changing the direct `POST /api/skills/safety-scan` route.
  - Changing Skill safety report persistence.
  - Changing the AI safety scanner.

## Risks

Clients that accidentally send malformed JSON now receive an earlier 400 error
instead of the previous misleading validation error. Valid empty requests remain
compatible.

## Rollback Thinking

Rollback is limited to restoring the previous permissive JSON parse behavior and
removing the regression assertion. No schema or data migration is involved.
