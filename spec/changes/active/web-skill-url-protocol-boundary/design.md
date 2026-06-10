# Design

## Boundary

This change treats Skill URL metadata as durable untrusted input. Validation
must happen before values are written through live routes, service methods, or
sync/import payloads.

## Approach

- Add small pure URL validators in the Web service layer:
  - `source_url` and `content_url`: `http:` or `https:`.
  - `icon_url`: `http:`, `https:`, or `data:image/*;base64,...`.
- Reuse those validators in route schemas and `SkillService` defensive checks.
- Reuse them in `sync-snapshot.ts` so `/api/import`, ZIP import, direct sync
  import, and WebDAV pull reject unsafe imported Skill metadata before
  `BackupService.import()` runs.

## Compatibility

Existing persisted records are not rewritten. Future writes/imports with unsafe
protocols fail validation.

## Verification

Use route tests for live API behavior, service tests for direct callers, and
import/sync tests for snapshot boundaries.
