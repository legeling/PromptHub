# Tasks

- [x] Unify web import/export snapshot parsing and normalization with the sync snapshot contract.
- [x] Make desktop `import-with-prompthub.json` embed a full re-importable snapshot.
- [x] Preserve compatibility for PromptHub backup/export envelopes and legacy `versions` payloads.
- [x] Preserve `skillFiles` across web import/export, sync pull/push, and desktop self-hosted sync flows.
- [x] Make web `/api/sync/data` and `/api/sync/pull` reuse the canonical `parseSyncSnapshot()` path instead of maintaining a second schema/normalizer.
- [x] Align missing imported settings fallback across web `/api/import` and `/api/sync/*` with the shared `DEFAULT_SETTINGS` contract.
- [x] Implement desktop S3-compatible storage connection, manual upload/download, startup sync, interval sync, and save-triggered sync.
- [x] Refactor desktop WebDAV and S3 sync to share one provider-agnostic backup/sync core for legacy upload/download, incremental sync, and auto-sync timestamp decisions.
- [x] Implement desktop WebDAV save-triggered sync as a debounced upload path wired only to real user save actions.
- [x] Allow multiple desktop backup targets to stay enabled while constraining automatic sync to one explicit `syncProvider` at a time.
- [x] Rename desktop cloud-backup submenu entries to provider-oriented labels and show enabled state directly in the menu.
- [x] Add regression tests that catch invalid persisted `syncProvider` state and stale save-sync timers when the active provider changes.
- [x] Add regression tests that catch periodic auto-sync timers not updating when users change sync settings after the app has already started.
- [x] Add regression tests for JSON import/export, ZIP import payloads, media/settings consistency, and skill workspace file preservation.
- [x] Align desktop full backup UI with the ZIP export contract while keeping restore compatible with legacy `.phub.gz` backups.
- [x] Align the update-dialog manual backup action with the same desktop full ZIP backup contract instead of the legacy JSON-only backup flow.
- [x] Run relevant lint, typecheck, targeted tests, and build verification.
