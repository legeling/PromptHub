# Mobile Behavior

## Product Boundary

- `apps/mobile` is an Expo React Native application with Prompt, Skill, Store,
  and Settings navigation surfaces.
- Mobile UI does not import Electron renderer components or desktop IPC APIs.
- Shared package types describe common entities, but do not imply that desktop
  storage adapters can run inside React Native.

## Prompt Storage

- Mobile Prompt records are stored durably in an Expo SQLite database inside
  the mobile application sandbox.
- The Settings capability declaration reports `sqlite` for this implemented
  storage boundary; it does not imply that deferred sync or Skill persistence exists.
- The mobile database has its own schema version and migration boundary.
- The mobile `prompthub.db` file is not interchangeable with the desktop
  database file; cross-device data exchange must use a defined sync or
  import/export contract.
- Existing unversioned mobile databases are adopted without deleting Prompt
  rows. Databases from a newer unsupported schema version are rejected rather
  than silently downgraded.
- Malformed stored metadata must degrade safely and must not prevent the Prompt
  workspace from loading.

## Prompt Workflow

- Prompt list search and filters operate on visible persisted records.
- Prompt detail reloads from SQLite whenever its route regains focus.
- Prompt deletion is permanent and requires explicit native or browser
  confirmation on every supported target.
- Loading, validation, empty, confirmation, and error states use the seven
  supported locale resources.
- Navigation, screen metrics, search labels and Prompt workflow messages must
  resolve in the selected locale. Locale resources must contain their translated
  messages rather than inherit English or Simplified Chinese workflow text.

## Deferred Boundaries

- WebDAV/cloud synchronization and conflict resolution are not yet implemented
  on mobile.
- Skill package persistence/import and MCP management remain future changes.
