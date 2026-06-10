# Design

## Overview

Add an early `Content-Length` precheck in `apps/web/src/routes/import-export.ts`
before the route calls `json()`, `arrayBuffer()`, or `formData()`. The helper is
local to the import route because export does not read a caller-provided body.

## Affected Areas

- Data model:
  - No schema or persistence impact.
- API / contracts:
  - `POST /api/import` returns `400 BAD_REQUEST` for declared request bodies
    larger than 50 MiB.
  - Invalid `Content-Length` headers return `400 BAD_REQUEST`.
- Filesystem / sync:
  - Oversized imports are rejected before media, database, or workspace writes.
- UI / UX:
  - Users receive an immediate import error instead of a slow parse/import
    attempt.

## Tradeoffs

The precheck covers requests that declare `Content-Length`. It does not solve
all streaming/chunked body-size enforcement; that requires lower-level server or
middleware support and remains out of scope for this narrow route fix.
