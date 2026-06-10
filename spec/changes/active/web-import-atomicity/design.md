# Design

## Overview

Wrap the existing `BackupService.import` database mutation sequence in the
database adapter transaction helper. Keep snapshot and media validation before
the transaction, keep final workspace sync after successful database writes, and
write pulled media only after the import succeeds.

## Affected Areas

- Data model: no schema change.
- IPC / API: failed `POST /api/import` returns the same error response shape but
  no longer leaves partially inserted DB records.
- Filesystem / sync: prompt and skill workspace sync still runs only after a
  successful import. Pulled media is validated before import and written only
  after successful DB import.
- UI / UX: failed imports leave the user's library in the previous state.

## Rules

- If any DB write inside import throws, inserted folders/prompts/versions/skills,
  rules, and settings from that import must roll back.
- If import fails after media payload validation, pulled media files from that
  import must not be written.
- Successful imports keep the existing merge and timestamp replacement rules.
- Route-level preflight validation stays outside the transaction.

## Tradeoffs

- The transaction is scoped to DB writes, so media rollback is handled by
  ordering rather than by including filesystem writes inside the DB transaction.
- Workspace sync remains after the transaction so generated workspace files
  reflect committed DB state only.
