# Design

## Overview

Tighten the Web settings route schema for `skillProjects` while preserving the same settings storage keys. The route rejects malformed project payloads before `SettingsService.set()` writes database rows or JSON settings files.

## Affected Areas

- Data model: no SQLite schema change.
- API / contracts: `PUT /api/settings` returns `422 VALIDATION_ERROR` for empty, overlong, or oversized skill project payloads.
- Filesystem / sync: rejected live settings updates do not write settings JSON or database settings rows.
- UI / UX: valid project skill settings continue to persist through the same route.

## Tradeoffs

- This route-level validation rejects malformed data rather than silently filtering it, matching recent Web settings hardening.
- Path existence and deployment semantics remain owned by desktop project skill workflows.
