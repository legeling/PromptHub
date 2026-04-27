# Refactor Regression Checklist

Use this checklist whenever a structural refactor touches shared UI, persistence, or IPC code. The goal is to keep behavior stable while module boundaries improve.

## Automated Checks

Run these after each refactor batch, not only at the very end:

- `pnpm typecheck`
- `pnpm test:run`
- target the closest affected unit tests before expanding scope

## Manual Flows

Validate the flows that are most likely to regress when reorganizing state, services, and IPC handlers:

- App launch: existing data loads, startup does not stall, settings hydrate normally
- Prompt flows: create, edit, delete, favorite, pin, search, import, clipboard import, version history
- Skill flows: create, edit, import, platform install, local file read/write, version create, version restore
- Settings flows: AI provider/model save, WebDAV config save, backup export, backup restore
- Layout flows: sidebar switching, folder/tag filtering, shortcuts, update dialog open/close

## Refactor Guardrails

- Keep external props, store action names, IPC channel names, and persisted payload shapes stable during internal moves.
- Extract pure helpers first, then shared workflow modules, then container cleanup.
- Delete old implementations only after all call sites have switched and checks are green.
- Treat behavior changes as explicit bug fixes with their own test coverage.

## Hotspot Queue

Current priority order for structural cleanup:

1. `src/renderer/components/settings/AISettings.tsx`
2. `src/renderer/components/prompt/CreatePromptModal.tsx`
3. `src/renderer/components/skill/SkillFullDetailPage.tsx`
4. `src/renderer/components/layout/Sidebar.tsx`
5. `src/renderer/components/layout/MainContent.tsx`
6. `src/main/services/skill-installer.ts`
7. `src/preload/index.ts`

## Review Notes

When reviewing a refactor PR, confirm:

- the new module boundary is easier to extend than the original file
- duplicated logic was centralized rather than copied
- tests cover the seam that was introduced
- manual checks were performed for the impacted user flows
