# Design

## Overview

Reuse the existing route-level prompt tag schema for `/api/prompts/meta/tags`
mutation payloads. This keeps tag bounds consistent across prompt creation,
prompt updates, settings catalog validation, and tag management workflows.

## Affected Areas

- `apps/web/src/routes/prompts.ts`
- `apps/web/src/routes/prompts.test.ts`

## Rules

- `oldTag`, `newTag`, and `tag` must be trimmed, non-empty strings.
- The maximum length must match the prompt metadata tag limit.
- Rejected tag mutation payloads must not write prompt records or sync the
  prompt workspace.

## Tradeoffs

- The service layer still assumes route validation for tag mutation payloads.
  Keeping this fix at the route boundary is consistent with the surrounding
  prompt metadata schemas and keeps the change small.
