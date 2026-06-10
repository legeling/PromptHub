# Design

## Overview

Mirror the import route's declared body-size guard for `PUT /api/sync/data`. The sync route checks `Content-Length` before calling `parseJsonBody()`. The selected 50 MiB limit matches the Web import limit because direct sync snapshots and import snapshots share the same backup/sync payload family.

## Affected Areas

- Data model: no schema or migration impact.
- API / contracts: `PUT /api/sync/data` returns `400 BAD_REQUEST` for invalid or oversized declared `Content-Length`.
- Filesystem / sync: rejected oversized sync imports do not write media, database records, or workspace files.
- UI / UX: normal direct sync imports below the limit remain unchanged.

## Tradeoffs

- The guard covers clients that declare `Content-Length`; unknown-length streaming limits remain a server/middleware concern.
- Keeping the helper local avoids a broader parser refactor while preserving behavior consistency with `/api/import`.
