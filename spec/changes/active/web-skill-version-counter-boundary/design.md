# Design

## Overview

Treat `currentVersion` as a system-managed field at the Web API route boundary.
The generic Skill update schema now rejects the field and points callers to the
versioning route, which already owns counter increments.

## Affected Areas

- Data model:
  - No schema change. `skills.current_version` remains the persisted counter.
- IPC / API:
  - `PUT /api/skills/:id` rejects `currentVersion` with `422 VALIDATION_ERROR`.
  - `POST /api/skills/:id/versions` remains the counter mutation path.
- Filesystem / sync:
  - No direct change.
- UI / UX:
  - No direct UI change.

## Tradeoffs

- `versionTrackingEnabled` remains accepted because it is a user-facing setting
  rather than the counter itself. If that setting later proves system-owned too,
  it should get its own regression and boundary record.
