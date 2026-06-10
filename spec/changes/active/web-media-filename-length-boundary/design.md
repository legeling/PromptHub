# Design

## Overview

Keep the media boundary centralized in
`apps/web/src/services/media-filename.ts`. The existing helper already rejects
empty names, traversal, path separators, and control characters before routes
join the name into the per-user media directory. Add a byte-length check there
so every caller receives the same validation result.

The selected limit is 240 UTF-8 bytes. It leaves room below common 255-byte path
segment limits while keeping PromptHub-generated UUID media names unaffected.

## Affected Areas

- Data model:
  - No SQLite schema or stored record change.
- IPC / API:
  - Web media routes now return `400 BAD_REQUEST` for oversized `:filename`
    parameters instead of falling through to missing-file behavior.
- Filesystem / sync:
  - No directory layout, import/export payload, backup, or sync format change.
  - The guard prevents invalid path segments before filesystem access.
- UI / UX:
  - No UI surface changes. API clients receive a clearer validation error.

## Tradeoffs

- A conservative 240-byte limit is slightly stricter than some filesystems, but
  it avoids platform-specific edge cases and keeps route behavior predictable.
- The guard lives in a web service helper rather than shared packages because
  this change only hardens `apps/web` media routes and does not redefine
  desktop or CLI media contracts.
