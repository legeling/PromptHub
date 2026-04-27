# Code Structure Guidelines

This document defines the code organization rules for PromptHub, with a focus on keeping large files maintainable and making feature work easier to extend.

## Goals

- Keep features discoverable: one concern per module.
- Keep UI files readable: move orchestration, helpers, and data transforms out of giant components.
- Keep services composable: separate storage primitives from backup/sync workflows.
- Keep refactors incremental: extract seams first, then move behavior behind those seams.

## Current Hotspots

These files are large enough to slow down review and raise change risk:

- `src/renderer/components/settings/AISettings.tsx`
- `src/renderer/components/layout/MainContent.tsx`
- `src/renderer/services/database.ts`
- `src/main/services/skill-installer.ts`
- `src/renderer/components/prompt/CreatePromptModal.tsx`
- `src/renderer/components/skill/SkillFullDetailPage.tsx`

Large files are not automatically wrong, but they should be treated as refactor candidates when touched.

## Practical Thresholds

Use these as review triggers rather than hard failures:

- `> 400` lines: check whether helpers or view sections should move out.
- `> 700` lines: prefer splitting by concern before adding new behavior.
- `> 1000` lines: treat as a structural hotspot; new work should usually extract a module or hook first.

## Split-by-Concern Rules

### Renderer components

Keep the component file focused on:

- state wiring
- event orchestration
- top-level JSX composition

Move these out when they grow:

- pure formatters and transform helpers -> `*-utils.ts`
- reusable stateful logic -> `use-*.ts`
- repeated sections -> sibling presentational components
- API/side-effect workflows -> service or action helpers

Examples:

- `SkillFullDetailPage.tsx` and `SkillDetailView.tsx` now share version-restore helpers through `src/renderer/components/skill/detail-utils.ts`.
- Backup and restore workflows now live in `src/renderer/services/database-backup.ts` instead of being coupled to every IndexedDB helper.
- `CreatePromptModal.tsx` and `EditPromptModal.tsx` now share prompt form utilities and modal behavior through `src/renderer/components/prompt/prompt-modal-utils.ts`, `src/renderer/components/prompt/usePromptMediaManager.ts`, and `src/renderer/components/prompt/usePromptNativeFullscreen.ts`.

### Renderer services

Separate core storage primitives from orchestration:

- `database.ts`: IndexedDB CRUD and local storage reset primitives
- `database-backup.ts`: export/import/restore workflow
- `webdav.ts`: sync transport and remote merge behavior

When adding new service code, prefer:

1. primitive read/write APIs
2. workflow composition on top
3. UI-facing adapters at the edge

### Main-process services

For large service classes such as `skill-installer.ts`, split by capability:

- path resolution and validation
- repo read/write operations
- external process integration
- export/import helpers

If a class starts mixing filesystem primitives and workflow orchestration, extract internal helper modules before adding more branches.

## Naming Conventions

- `*-utils.ts`: pure helpers, no UI state
- `use-*.ts`: React hooks
- `*-types.ts`: local type declarations when a module-specific type does not belong in `shared`
- `*-backup.ts`, `*-sync.ts`, `*-installer.ts`: workflow modules with side effects

## Refactor Playbook

When touching a large file:

1. Identify which code is pure, which code is side-effectful, and which code is JSX composition.
2. Extract pure helpers first.
3. Extract shared workflows second.
4. Only then add new feature logic.

This order keeps behavior stable while improving structure.

## Review Checklist

Before merging a structural change, verify:

- the extracted module has a single responsibility
- names communicate intent better than the old inlined code
- callers got simpler, not just shorter
- duplicated logic was removed, not copied
- the new seam is reusable by the next feature

Pair this with the regression checklist in `spec/architecture/refactor-regression-checklist.md` so extraction work stays behavior-safe.

## Next Refactor Queue

Recommended next targets:

1. Split `AISettings.tsx` into provider list, model editor, and default-model sections.
2. Break `MainContent.tsx` into prompt list orchestration, selection actions, and modal coordination.
3. Split `CreatePromptModal.tsx` into media handling, translation helpers, and fullscreen editor state.
4. Decompose `skill-installer.ts` into repo IO utilities and Git/platform orchestration modules.
