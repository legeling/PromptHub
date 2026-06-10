# Design

## Overview

Add a uniqueness guard at the web service boundary before folder rows are loaded or mutated. This keeps the route schema focused on JSON shape while making direct service callers receive the same validation behavior.
As a follow-up, bound the route-level reorder payload before it reaches the
service: the request can contain at most 500 ids and each id can be at most 200
characters.

## Affected Areas

- Data model: no schema or migration change.
- IPC / API: `PUT /api/folders/reorder` now rejects duplicate `ids` with `422 VALIDATION_ERROR`.
- IPC / API: `PUT /api/folders/reorder` rejects oversized `ids` arrays and
  overlong ids with `422 VALIDATION_ERROR` before service-level row loading.
- Filesystem / sync: invalid duplicate reorder payloads do not call `FolderDB.reorder()` and do not trigger prompt workspace sync.
- UI / UX: no direct UI changes.

## Tradeoffs

- Service-level validation protects both the Hono route and any future internal web caller.
- The route schema still trims and validates id shape; ownership, visibility, and uniqueness remain in `FolderService.reorder()` because they are domain rules.
- Keeping size limits in the route avoids turning malformed bulk payloads into
  many database lookups. The service remains responsible for domain validation.
