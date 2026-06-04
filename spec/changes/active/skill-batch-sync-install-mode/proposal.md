# Skill Batch Sync Install Mode Verification

## Why

Users reported that selecting symlink in one-click Skill sync produced copy installs, and selecting copy produced symlink installs. This is a severe filesystem semantic boundary because copy and symlink installs have different update, deletion, and rollback behavior.

## Scope

- Verify the batch Skill sync UI forwards the selected install mode correctly.
- Verify the renderer service calls the matching platform installation API.
- Verify the main-process installer still maps copy to directory copy and symlink to directory symlink, with structured copy fallback only when symlink is unavailable.

## Non-Goals

- Redesign Skill installation UI.
- Change platform detection or scan behavior unless the investigation proves the mode is actually reversed.

## Risk

Incorrect fixes can damage user skill directories by replacing independent copies with links, or links with stale copies. Tests must assert the selected mode and effective filesystem operation rather than only checking success toasts.
