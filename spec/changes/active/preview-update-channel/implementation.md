# Implementation

## Summary

Implemented a guarded desktop preview-update opt-in flow. Stable remains the default channel, and users must explicitly confirm preview risks and backup guidance before PromptHub switches update checks to prerelease builds.

## Delivered Changes

- Added a confirmation modal to `AboutSettings` before enabling the preview update channel.
- Kept switching back to the stable channel immediate and one-click.
- Added explicit risk, backup, and consent copy to all 7 desktop locale files.
- Added component tests covering preview opt-in confirmation and fallback to stable.
- Synced the stable release spec with the new desktop update-channel contract.

## Deviations From Plan

- No updater main-process change was required because the current renderer and updater call chain already passes `updateChannel` through manual and background update checks.

## Verification

- Commands run:
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/about-settings.test.tsx tests/unit/components/update-dialog.test.tsx tests/unit/main/updater.test.ts`
- `pnpm --filter @prompthub/desktop lint`
- Tests passed:
- `tests/unit/components/about-settings.test.tsx`
- `tests/unit/components/update-dialog.test.tsx`
- `tests/unit/main/updater.test.ts`
- Build / lint status:
- Desktop lint passed

## Synced Specs And Docs

- Updated `spec/specs/release/spec.md`

## Follow-Up

- None yet.
