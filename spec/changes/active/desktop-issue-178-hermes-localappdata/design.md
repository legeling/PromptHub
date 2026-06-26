# Design

## Boundary

- Source of truth: `packages/shared/constants/platforms.ts` owns built-in agent
  platform root templates.
- Main-process path resolution:
  `apps/desktop/src/main/services/skill-installer-utils.ts` owns expansion for
  platform templates before filesystem operations.
- Main-process open-path resolution:
  `apps/desktop/src/main/shell-open-path.ts` owns expansion for renderer
  `shell:openPath` requests before checking or opening paths.
- Renderer settings previews consume the shared templates and display the same
  built-in defaults, but they do not perform filesystem checks directly.

## Approach

1. Update the Hermes Agent Windows root template from
   `%USERPROFILE%\.hermes` to `%LOCALAPPDATA%\hermes`.
2. Extend `resolvePlatformPath()` to expand `%LOCALAPPDATA%` case
   insensitively.
3. Extend `expandShellOpenPath()` to expand `%LOCALAPPDATA%` using the same
   local-app-data concept for UI open actions.
4. Keep fallback behavior local to the resolver:
   `LOCALAPPDATA || path.join(home, "AppData", "Local")`.
5. Preserve explicit user overrides. If settings contain a Hermes root path,
   that path still takes precedence over the built-in template.

## Verification

- Main-process unit test for `%LOCALAPPDATA%` placeholder expansion.
- Main-process unit test for the built-in Hermes Windows root and derived
  Skills path.
- Main-process unit test for `shell:openPath` `%LOCALAPPDATA%` expansion.
- Renderer unit test for the shared Hermes Windows template so Settings preview
  cannot drift back to `%USERPROFILE%\.hermes`.
- Focused typecheck/lint/diff checks where practical for touched files.
