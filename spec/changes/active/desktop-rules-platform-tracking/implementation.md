# Implementation

## Status

Implementation landed and targeted verification passed.

## Notes

- moved the visibility control to the platform display-order section and upgraded it from a Rules-only toggle to a platform-level enable/disable switch
- `disabledPlatformIds` is now the canonical settings field for hidden platforms, while legacy `trackedRulePlatformIds` is still read and migrated for compatibility; Rules, Skills integration surfaces, and batch deployment all render `detected platforms - disabled platforms`
- added a compatibility migration that resets the broken allow-list state introduced during the earlier iteration so existing users do not lose every Rules entry after rescanning
- changing `customPlatformRootPaths` now invalidates main-process platform-path caches and forces the renderer rules store to rescan, so the Rules UI picks up the new target path immediately
- core `ensureGlobalRuleMaterialized(...)` now refreshes stored global meta `targetPath` and template metadata from the current platform root, preventing stale cached OpenCode/Claude paths from lingering after root overrides change
- rules selection was hardened so force-refresh falls back to the first visible descriptor if the previously selected rule has just been hidden by tracking changes

## Verification

- `pnpm exec vitest run tests/unit/stores/settings-rules-sync.test.ts tests/unit/stores/rules.store.test.ts tests/unit/components/skill-settings.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/main/rules-workspace.test.ts`
- `pnpm lint`
