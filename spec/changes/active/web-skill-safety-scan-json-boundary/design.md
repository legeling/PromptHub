# Design

## Overview

Add a small optional JSON parser inside `apps/web/src/routes/skills.ts` for the
legacy `POST /api/skills/:id/safety-scan` route. The parser treats an empty body
as `{}` but returns the standard `400 BAD_REQUEST` response when a non-empty
body is not valid JSON.
As a follow-up, the shared safety scan input schema also bounds the request
fields that are sent into the AI prompt or AI provider config.

## Affected Areas

- Data model:
  - No data impact.
- API / contracts:
  - Malformed JSON on `POST /api/skills/:id/safety-scan` returns
    `400 BAD_REQUEST`.
  - Empty-body scans keep the existing route behavior.
  - Oversized safety scan inputs on both direct and legacy scan routes return
    `422 VALIDATION_ERROR` before contacting the AI provider.
- Filesystem / sync:
  - No filesystem or sync impact.
- UI / UX:
  - Client errors become clearer and no AI request is attempted for malformed
    JSON.

## Tradeoffs

The route keeps a local parser instead of using `parseJsonBody()` directly
because this endpoint intentionally permits an empty body as a no-override scan
request.
The size checks live in the shared route schema so direct scans and legacy
stored-skill scans enforce the same limits.
