# Design

## Summary

Add a desktop-level platform visibility setting in `SkillSettings` and use it as a disabled-platform list for the entire agent/platform, not just Rules. The same Settings control should filter platform visibility across Skills, batch deploy/install flows, and Rules. In parallel, harden core rules workspace materialization so persisted global rule metadata self-heals when the derived target path changes.

## Key Decisions

- store disabled platforms in settings so the choice persists across sessions and Agent Management becomes the single source of truth across Skills and Rules
- keep desktop filtering in the renderer/store layer to avoid changing CLI output semantics
- still refresh core global metadata target paths inside `ensureGlobalRuleMaterialized(...)` so stale cached descriptors do not survive root path changes
- trigger a forced rules rescan when `customPlatformRootPaths` changes so the desktop renderer does not keep stale descriptor caches

## Affected Modules

- `packages/shared/types/settings.ts`
- `apps/desktop/src/renderer/stores/settings.store.ts`
- `apps/desktop/src/renderer/stores/rules.store.ts`
- `apps/desktop/src/renderer/services/platform-visibility.ts`
- `apps/desktop/src/renderer/components/skill/use-skill-platform.ts`
- `apps/desktop/src/renderer/components/skill/SkillListView.tsx`
- `apps/desktop/src/renderer/components/skill/SkillBatchDeployDialog.tsx`
- `apps/desktop/src/renderer/components/layout/Sidebar.tsx`
- `apps/desktop/src/renderer/components/settings/SkillSettings.tsx`
- `apps/desktop/src/main/ipc/settings.ipc.ts`
- `apps/desktop/src/main/services/skill-installer-utils.ts`
- `packages/core/src/rules-workspace.ts`
- sync/import-export settings schema files in desktop/web

## Validation Plan

- rules workspace test: persisted global meta updates `targetPath` when platform root changes
- desktop rules store/sidebar tests: scan results are filtered by settings-managed disabled platforms only
- platform visibility service tests: disabled platforms disappear consistently from shared platform lists used by Skills and batch deployment
- settings linkage test: changing `customPlatformRootPaths` forces a rules rescan and updates the displayed target path
