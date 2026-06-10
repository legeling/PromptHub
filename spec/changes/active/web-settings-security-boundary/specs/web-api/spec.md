# Web API Delta Spec

## Modified Requirements

### Requirement: General settings updates must not persist security state

The normal Web settings update API MUST reject payloads that contain security
state fields. Security state is not a user preference and must not be toggled by
`PUT /api/settings`.

#### Scenario: Settings update includes security state

Given an authenticated user
When the user updates settings with `security.masterPasswordConfigured` or
`security.unlocked`
Then the API returns `422 VALIDATION_ERROR`
And the user's settings do not persist the submitted security state.

### Requirement: General settings updates must preserve supported preferences

The normal Web settings update API MUST continue to accept supported shared
preference fields even while rejecting security state.

#### Scenario: Settings update includes supported preferences

Given an authenticated user
When the user updates supported preferences such as tag filtering, background
image preferences, update channel, and startup preferences
Then the API returns `200`
And the submitted preferences are returned by the next settings read.

### Requirement: Persisted preference fields must be bounded

The normal Web settings update API and settings-bearing import APIs MUST reject
malformed persisted preference metadata instead of storing it or silently
dropping it during import.

#### Scenario: Settings update includes malformed persisted preference metadata

Given an authenticated user
When the user updates settings with a path-like `backgroundImageFileName`, a
background blur outside the renderer-supported range, a non-ISO
`lastManualBackupAt`, or an oversized `lastManualBackupVersion`
Then the API returns `422 VALIDATION_ERROR`
And the malformed values are not persisted.

#### Scenario: Import payload includes malformed persisted preference metadata

Given an authenticated user imports a JSON backup or sync payload
When `settings.backgroundImageFileName`, `settings.lastManualBackupAt`, or
`settings.lastManualBackupVersion` is malformed
Then the import API returns `422 VALIDATION_ERROR`
And the user's existing settings remain unchanged.

### Requirement: Nullable settings can be cleared

The normal Web settings update API MUST treat `null` for nullable settings as a
clear operation, not as a no-op.

#### Scenario: Settings update clears defaultFolderId

Given an authenticated user has `defaultFolderId` set
When the user updates settings with `defaultFolderId: null`
Then the API returns `200`
And the next settings read has no `defaultFolderId`.
