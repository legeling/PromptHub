# Implementation

## Summary

Polished two desktop warning/error surfaces: the About settings preview-channel area now stays within the standard setting-row description pattern, and the Skill Store rate-limit error now gives accurate retry/network guidance without referencing a nonexistent GitHub token setting.

## Delivered Changes

- Removed the extra standalone preview-channel notice block in `AboutSettings` and kept the enabled-state message inside the normal setting-row description.
- Kept the blocking preview opt-in modal as the primary high-emphasis warning step.
- Restructured the Skill Store remote-error banner into a clearer title/body/action layout.
- Updated GitHub rate-limit guidance in `SkillStore` and `CreateSkillModal` to recommend retrying later or switching networks.
- Added shared GitHub store error mapping for three user-facing cases: rate limit, network failure, and invalid/missing repository.
- Synced all 7 locale files for the new update-channel active-state copy and the corrected rate-limit message.
- Added regression tests covering the new remote-store error categories and ensuring the UI no longer tells users to configure a GitHub token in settings.

## Verification

- Commands run:
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/about-settings.test.tsx tests/unit/components/skill-store-remote.test.tsx tests/unit/components/update-dialog.test.tsx`
- `pnpm --filter @prompthub/desktop lint`
- Tests passed:
- `tests/unit/components/about-settings.test.tsx`
- `tests/unit/components/skill-store-remote.test.tsx`
- `tests/unit/components/update-dialog.test.tsx`
- Build / lint status:
- Desktop lint passed

## Follow-Up

- Consider adding a dedicated “network / upstream unavailable” error code mapping layer if more remote store providers are added later.
