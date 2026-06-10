# Design

## Overview

Keep the filesystem safety checks in `rule-workspace.ts` as the durable storage
guard, and add Web route-level handling so unsafe user input is rejected with the
correct API contract. Project ids use a conservative single-segment whitelist.
Import-record validation errors from the workspace layer are mapped to
`422 VALIDATION_ERROR`.

## Affected Areas

- Data model:
  - No database or file layout change.
- IPC / API:
  - `POST /api/rules/projects` rejects unsafe `id` values before service calls.
  - `POST /api/rules/import-records` maps unsafe snapshot errors to `422`.
  - Duplicate project roots map to `409 CONFLICT`.
- Filesystem / sync:
  - Unsafe route inputs do not create managed rule directories or version files.
- UI / UX:
  - API callers receive actionable validation errors instead of generic 500s.

## Tradeoffs

- The route accepts a narrower explicit project-id character set than the
  type-level ``project:${string}`` shape. This is intentional for user-supplied
  route payloads; imported backup records still rely on the workspace snapshot
  validator for compatibility.
