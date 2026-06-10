# Desktop Spec Delta

## Modified Requirements

### Settings Secret Handling

The desktop renderer must not persist the raw `githubToken` into zustand localStorage snapshots. The token may be displayed in settings UI only after being loaded from the main-process settings source.

If an existing same-version zustand snapshot already contains `githubToken`, renderer hydration must clear the in-memory token and scrub the persisted `githubToken` field from localStorage instead of relying on `migrate`.

### CLI Dependency Boundary

Desktop CLI entry points must not acquire a runtime dependency on Electron merely by importing `SkillInstaller`.

### Startup Settings Sync

After renderer settings hydration completes, the desktop app must reconcile startup-related settings from the main-process settings source before continuing normal initialization.

### Renderer UI Settings Hydration

Current-version renderer settings snapshots must normalize user-visible appearance and accessibility fields before they can affect DOM classes, CSS variables, motion attributes, i18n language, or shortcut handling. This normalization must run during zustand `merge`, not only during version migration.

Prompt workflow settings restored from renderer localStorage must normalize creation mode, translation mode, close behavior, image-reference defaults, and source history before they affect prompt creation menus, skill translation prompts, Electron close behavior, or source suggestion rendering.

Main-process shortcut mode configuration must normalize persisted files and IPC payloads before saving or registering shortcuts, so malformed values cannot disable default global shortcuts or introduce unknown shortcut actions.
