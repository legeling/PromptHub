# Implementation

## Shipped

- Merged contributor branch `jazzson51569/feature/hierarchical-latest` with a merge commit so the original contribution remains visible in history.
- Kept the contributor's direct manipulation model: Prompt list mode supports drag/drop hierarchy editing and Tab / Shift+Tab indentation.
- Fixed `MainContent` list mode so it renders the tree list once instead of rendering both old table and new hierarchy list.
- Changed Prompt hierarchy foreign key semantics to `ON DELETE SET NULL` so deleting a parent Prompt does not delete child Prompts.
- Added existing-user migration for `prompts.parent_id` and `prompts.sort_order`.
- Added `PromptDB.movePrompt` validation for self-parenting, missing parents, invalid order values, and descendant cycles.
- Reworked sibling order updates to rewrite contiguous order values for affected groups.
- Hardened renderer IndexedDB fallback move logic with the same relationship guards.
- Hardened `PromptListView` against invalid drop targets, missing parents, and cyclic data rendering.
- Added IPC validation for `prompt:move`.
- Added `PromptRelationDB` and the `prompt_relations` SQLite table for `related_to`, `variant_of`, `depends_on`, and `next_step`.
- Added shared relation DTO/query types plus desktop IPC, preload, renderer service, and Zustand store actions for relation CRUD.
- Kept drag-and-drop as the primary workflow: dropping onto the center of a Prompt row opens a compact chooser; `grouped_under` moves in the tree, while the four graph kinds create typed relations.
- Added compact relation badges to Prompt list rows so existing graph relationships are visible without opening a separate editor page.
- Added all-locale i18n strings for relationship labels and the relation chooser.
- Added desktop backup support for `promptRelations`, including export, selective export filtering, strict validation, lenient import sanitization, and restore after Prompt rows are restored.

## Verification

- `pnpm --dir apps/desktop exec vitest run tests/unit/main/prompt-db.test.ts tests/unit/main/database-migration-locks.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop build`
- `git diff --check`
- `pnpm --dir apps/desktop exec vitest run tests/unit/main/prompt-relation-db.test.ts tests/unit/main/prompt-db.test.ts tests/unit/main/database-migration-locks.test.ts`
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/prompt-list-view-relations.test.tsx`
- `pnpm --dir apps/desktop exec vitest run tests/unit/services/database-backup-format.test.ts tests/unit/services/database-backup.test.ts tests/integration/services/database-backup-filesystem.integration.test.ts`

Note: an earlier mistyped `pnpm --filter @prompthub/desktop test:run -- ...` invocation ran the broad desktop test suite and surfaced two unrelated failures in `tests/integration/components/skill-ui.integration.test.tsx`.

## Synced Docs

- Added this active change record.
- Added `specs/prompt-relationships/spec.md` to define `grouped_under` behavior and the broader relationship taxonomy.
- Updated the active design and delta spec to make `prompt_relations` the source of truth for non-tree relationships.

## Follow-ups

- Revisit list-mode batch actions after the tree list stabilizes.
- Consider an Obsidian-like graph view as a separate read/explore surface, not as the primary relation editing workflow.
- Add dedicated relation edit/delete affordances and a graph exploration surface after the direct drag workflow stabilizes.
