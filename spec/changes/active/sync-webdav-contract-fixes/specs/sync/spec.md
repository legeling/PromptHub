# Delta Spec

## Modified

- WebDAV `pull` fallback may only treat `404` as "backup missing". Authentication, authorization, connectivity, and server failures must remain diagnostically visible to clients.
- WebDAV structured backups on web must remain recoverable snapshots, including referenced media files for prompts.
- When web writes structured WebDAV backups, `manifest.json` is part of the success contract. A failed manifest upload means the sync operation failed.
- Web sync clients must treat unified `summary` as the stable response surface for `PUT /sync/data`, `POST /sync/push`, and `POST /sync/pull`.
- Web sync config updates must validate the effective merged settings, not only the request patch. Switching from another provider with an HTTP endpoint to `webdav` without replacing the endpoint must be rejected.
- Imported sync and backup payload settings must enforce the same WebDAV endpoint and remote-path safety policy as live sync config updates.
- Live sync config, settings updates, backup imports, and direct sync imports must enforce bounded sync settings fields: endpoint, username, password, remotePath, and `lastSyncAt`. `lastSyncAt` must be an ISO datetime when supplied.
- WebDAV endpoint settings are collection base URLs. They must be absolute HTTPS URLs without query strings or fragments so backup file paths cannot be appended into query or fragment semantics.
- WebDAV-only endpoint rules must not reject non-WebDAV providers such as `self-hosted` when they use their own supported endpoint scheme.

## Scenarios

- Scenario: WebDAV auth failure during pull
  - Given the remote WebDAV endpoint returns `401`
  - When the web sync route executes `POST /sync/pull`
  - Then the route returns a validation-style sync error with the HTTP 401 context intact
  - And it does not rewrite the error as "no backup found"

- Scenario: WebDAV push misses manifest upload
  - Given `data.json` upload succeeds but `manifest.json` upload fails
  - When the web sync route executes `POST /sync/push`
  - Then the operation fails
  - And `lastSyncAt` is not advanced as if the backup were complete

- Scenario: WebDAV backup with prompt media
  - Given prompts reference image and video files that exist in the workspace
  - When the web sync route pushes to WebDAV
  - Then the remote backup contains `data.json`, `manifest.json`, and the referenced media payloads
  - And a later pull restores both prompt records and their media files

- Scenario: WebDAV provider switch inherits insecure endpoint
  - Given sync config currently uses a non-WebDAV provider with an HTTP endpoint
  - When the user updates only `provider` to `webdav`
  - Then the config update is rejected with a validation error
  - And the HTTP endpoint is not accepted as an effective WebDAV endpoint

- Scenario: Imported settings contain insecure WebDAV endpoint
  - Given an import or sync payload contains `settings.sync.provider = webdav`
  - And `settings.sync.endpoint` uses `http://`
  - When the payload is imported through `/api/import` or `/api/sync/data`
  - Then the import is rejected with `422 VALIDATION_ERROR`
  - And the insecure endpoint is not persisted in user settings

- Scenario: Sync settings fields exceed supported bounds
  - Given a user submits sync settings through `/api/sync/config`, `/api/settings`, `/api/import`, or `/api/sync/data`
  - And endpoint, username, password, or remotePath exceeds the supported field length
  - Or `lastSyncAt` is not an ISO datetime where the field is accepted
  - Then the API rejects the request with `422 VALIDATION_ERROR`
  - And the oversized settings are not persisted

- Scenario: WebDAV endpoint contains query or fragment
  - Given a user configures WebDAV sync with an HTTPS endpoint containing `?token=...` or `#fragment`
  - When the config is validated or a WebDAV target URL is built
  - Then the endpoint is rejected before any WebDAV request is made
  - And the backup file name is not appended into the endpoint query or fragment.

- Scenario: Self-hosted endpoint remains provider-specific
  - Given a user configures `provider = self-hosted`
  - And the endpoint uses an HTTP URL supported by that provider contract
  - When the config is saved
  - Then WebDAV-only HTTPS base URL validation is not applied.
