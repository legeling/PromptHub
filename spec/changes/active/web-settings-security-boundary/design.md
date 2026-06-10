# Design

## Overview

Remove `security` from the normal Web settings update payload and make the
route reject unknown keys. The route explicitly lists supported live preference
fields so the Web desktop bridge can still round-trip existing shared settings
without letting security state slip through the general persistence path. Shared
persisted preference metadata is bounded consistently across live settings
updates and settings-bearing backup/sync imports.

## Affected Areas

- Data model: no SQLite schema change; nullable settings clears delete the
  corresponding `user_settings` KV row.
- IPC / API: `PUT /api/settings` returns `422 VALIDATION_ERROR` when the
  request contains `security`.
- Filesystem / sync: no settings file layout change. Sync snapshot settings
  parsing now validates the persisted background image filename and manual
  backup metadata fields instead of silently accepting or dropping malformed
  imported values.
- UI / UX: malformed or over-broad clients get an explicit validation error
  instead of silently persisting security state.

## Rules

- General settings updates may persist preferences such as theme, language,
  tag filtering, background image preferences, platform paths, sync
  configuration, device sync cadence, update channel, and startup preferences.
- General settings updates must not persist `security.masterPasswordConfigured`
  or `security.unlocked`.
- Rejected security updates must leave existing settings unchanged.
- `defaultFolderId: null` clears the setting from SQLite and the workspace JSON
  settings file.
- `backgroundImageFileName` must be a bounded filename, not a path, control
  character payload, or traversal-like value.
- `lastManualBackupAt` must be a bounded ISO datetime string.
- `lastManualBackupVersion` must be a bounded non-empty string without control
  characters.
- JSON import and sync import must reject malformed persisted preference fields
  before mutating user settings.

## Tradeoffs

- A strict object schema catches `security` and any future accidental top-level
  settings fields. This is more explicit than silently stripping the field,
  because clients should know they are using the wrong contract.
- Existing shared preference fields are listed explicitly to avoid turning
  `strict()` into a UX regression for the Web desktop compatibility bridge.
- Sync snapshot validation reuses the same field-level schemas for persisted
  preference metadata to avoid one import path accepting values the live API
  rejects.
- `SettingsService.set` treats `null` and `undefined` in an explicit patch as a
  key clear so the route does not need one-off deletion logic per nullable
  field.
