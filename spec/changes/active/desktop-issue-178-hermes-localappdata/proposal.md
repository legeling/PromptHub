# Desktop Issue 178 Hermes Windows Path

## Problem

GitHub issue #178 reports that Hermes Agent on Windows Native stores its
configuration under `%LOCALAPPDATA%\hermes`, but PromptHub's built-in Hermes
agent path points to `%USERPROFILE%\.hermes` and the main-process platform path
resolver does not expand `%LOCALAPPDATA%`.

## Scope

- Correct the built-in Hermes Agent Windows root template.
- Expand `%LOCALAPPDATA%` in platform path templates and user overrides.
- Expand `%LOCALAPPDATA%` in the desktop `shell:openPath` helper so UI open
  actions work for the same template.
- Keep this change limited to path resolution and platform metadata.
- Update the stable agent platform reference so future platform work does not
  reintroduce the wrong Hermes Windows path.

## Non-Goals

- No changes to MCP target projection shapes.
- No storage migration.
- No Hermes runtime integration or process execution.

## Risks

- Existing users who manually configured Hermes to `%USERPROFILE%\.hermes`
  should keep their override because explicit settings still win over built-in
  defaults.
- Windows fallback behavior must remain deterministic when `LOCALAPPDATA` is
  absent.

## Rollback

Reverting the platform metadata and resolver expansion returns PromptHub to the
previous built-in Windows path behavior. No durable data migration is involved.
