# Design

## Overview

Tighten the Web settings schema for custom agent objects while keeping the same persisted settings keys. The route remains the live settings mutation boundary and rejects malformed custom agent payloads before `SettingsService.set()` writes database rows or JSON settings files.

## Affected Areas

- Data model: no SQLite schema change.
- API / contracts: `PUT /api/settings` returns `422 VALIDATION_ERROR` for empty, overlong, or oversized custom agent payloads.
- Filesystem / sync: rejected live settings updates do not write settings JSON or database settings rows.
- UI / UX: valid custom agent configs continue to persist through the same route.

## Tradeoffs

- This route-level schema rejects malformed data instead of silently trimming/filtering so clients receive actionable feedback.
- The fix only validates size and required shape; path existence and platform-specific path semantics remain owned by desktop/runtime consumers.
