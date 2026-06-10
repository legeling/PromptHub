# Web Settings Nested Merge Boundary

## Modified Requirements

### Requirement: Nested settings patches preserve saved sibling fields

The Web settings update API MUST treat `sync` and `device` as partial nested
patches. Updating one nested field MUST NOT clear already saved sibling fields.

#### Scenario: Partial sync patch keeps existing WebDAV details

- Given a user has saved a WebDAV sync configuration
- When the user updates only `sync.lastSyncAt`
- Then the saved endpoint, username, password, remotePath, provider, enabled,
  and autoSync fields remain unchanged
- And `lastSyncAt` is updated

#### Scenario: Partial device patch keeps existing cadence settings

- Given a user has saved device sync cadence settings
- When the user updates only `device.storeAutoSync`
- Then the saved sync cadence and store cadence remain unchanged
- And `storeAutoSync` is updated
