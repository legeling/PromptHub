# Delta Spec

## Modified

- PromptHub export, backup, and sync entry points must share a recoverable snapshot contract for prompts, folders, versions, rules, skills, settings, and referenced media.
- PromptHub export, backup, and sync entry points must preserve the complete current-format user-owned agent asset set: My Skills, My MCP, My Plugins, custom store source lists, and the managed `data/mcp` plus `data/plugins` file snapshots.
- `import-with-prompthub.json` inside desktop ZIP exports must itself be importable without needing ZIP side-channel reconstruction.
- Web `/api/import` must accept PromptHub backup/export envelopes and normalized sync snapshots with equivalent semantics.
- When an imported snapshot omits `settings`, web import and sync routes must apply the shared web `DEFAULT_SETTINGS` contract rather than route-local fallback values.
- Web import and sync snapshot parsing must preserve the same supported shared settings preferences that the live web settings API accepts, instead of silently stripping fields during restore.
- Desktop sync settings must keep unavailable capabilities visible but clearly disabled when the backing feature is not implemented.
- Desktop may keep multiple backup targets enabled for manual backup/restore, but automatic sync must execute against only one active sync source at a time.
- Desktop cloud-backup navigation must use provider-oriented labels and expose whether each provider is enabled without requiring the user to open every panel.

## Scenarios

- Scenario: Desktop ZIP export is re-imported on web
  - Given desktop generates a selective ZIP export with `import-with-prompthub.json`
  - When web `/api/import` ingests that ZIP
  - Then the embedded JSON is sufficient to restore the exported records and settings without depending on undocumented ZIP-only reconstruction rules

- Scenario: Update dialog manual backup reuses desktop full backup contract
  - Given a desktop user clicks the manual backup action from the update dialog
  - When PromptHub prepares the pre-upgrade backup artifact
  - Then it creates the same local upgrade snapshot as before
  - And the user-facing exported backup uses the desktop full ZIP backup contract instead of the legacy JSON-only backup download

- Scenario: Snapshot fields stay aligned across flows
  - Given a workspace contains media references, rules, skills, and `settingsUpdatedAt`
  - When the user exports a backup, uploads to self-hosted sync, or imports through web
  - Then those flows preserve the same logical snapshot fields and timestamp semantics

- Scenario: User syncs agent asset libraries
  - Given a desktop workspace contains My Skills, My MCP servers, My Plugins, and custom Skill/MCP/Plugin store sources
  - When the user exports a backup or syncs through WebDAV, S3, or self-hosted Web
  - Then the snapshot contains the skill data, MCP library, plugin library, managed plugin package files, custom store source selections, and complete managed file snapshots for `data/mcp` and `data/plugins`
  - And restoring the snapshot recreates those current-format user libraries without relying on legacy MCP or Plugin formats

- Scenario: Imported snapshot omits settings
  - Given a valid sync snapshot does not include a `settings` object
  - When web `/api/import` or `/api/sync/data` imports it
  - Then the resulting settings use the shared web default settings contract instead of route-specific fallback values

- Scenario: Import restores supported settings preferences
  - Given a backup contains supported settings preferences such as tag filtering, background image tuning, platform paths, custom agents, skill projects, backup metadata, update channel, and startup behavior
  - When web `/api/import` or `/api/sync/data` imports the snapshot over different local settings
  - Then the imported supported preferences replace the local values
  - And malformed values still fail validation before settings are mutated

- Scenario: Desktop settings expose unfinished sync providers
  - Given a desktop sync capability is not wired to a real execution path yet
  - When the user opens the corresponding settings section
  - Then PromptHub keeps the controls visible for consistency but disables them and explains that the capability is not available yet

- Scenario: Multiple backup targets remain enabled but only one auto-sync source runs
  - Given desktop has more than one cloud backup target enabled
  - When startup sync, periodic sync, or save-triggered sync is evaluated
  - Then PromptHub runs automatic sync only for the selected `syncProvider` and leaves the other enabled targets available for manual backup and restore actions

- Scenario: Cloud-backup submenu reflects provider state
  - Given one or more desktop cloud backup providers are enabled
  - When the user opens the data settings submenu
  - Then the submenu labels use provider-oriented names and each enabled provider shows an enabled indicator directly in the menu

- Scenario: Same-version desktop settings hydration sanitizes background image preferences
  - Given renderer localStorage contains a current-version settings snapshot with
    an unsafe background image file name or out-of-range background image
    opacity/blur values
  - When the desktop settings store hydrates
  - Then the store state normalizes those fields before applying CSS variables
  - And the unsafe background image source is not retained for later
    persistence or sync

- Scenario: Same-version desktop settings hydration sanitizes automatic sync timing
  - Given renderer localStorage contains a current-version settings snapshot with
    negative, malformed, or out-of-range startup sync delays or periodic sync
    intervals
  - When the desktop settings store hydrates
  - Then startup sync delays are clamped to the same 0-60 second range as the
    settings UI
  - And malformed or negative periodic sync intervals are normalized before
    startup sync or periodic auto-sync timers are registered
