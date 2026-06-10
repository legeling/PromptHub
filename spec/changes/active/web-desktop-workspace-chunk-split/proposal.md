# Proposal

## Why

The self-hosted web client embeds the desktop renderer for the authenticated
workspace. After the setup/login shell was split from the workspace, the
authenticated `DesktopWorkspace` chunk still exceeded Vite's default 500 kB raw
warning threshold. Inspection showed that the shared desktop `App.tsx` eagerly
imports desktop-only modal surfaces that are not visible during the normal web
authenticated workspace render.

## Scope

- Keep web setup/login and authenticated workspace behavior unchanged.
- Lazy-load desktop-only and rarely opened modal surfaces from the shared desktop
  renderer shell.
- Preserve desktop Electron startup, update, recovery, backup import, and close
  dialog behavior.

## Non-Goals

- No data model, sync payload, API, IPC, or storage contract changes.
- No redesign of the desktop renderer shell.
- No changes to prompt/skill/rule feature behavior.

## Risks

- A lazy modal could suspend without a local Suspense boundary if rendered
  unconditionally.
- Backup import, recovery, close, or update dialogs could fail to open if the
  lazy imports are miswired.

## Rollback

Restore the static modal imports in `apps/desktop/src/renderer/App.tsx` if lazy
loading causes dialog regressions.
