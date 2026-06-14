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

## Verification

- `pnpm --dir apps/desktop exec vitest run tests/unit/main/prompt-db.test.ts tests/unit/main/database-migration-locks.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop build`
- `git diff --check`

Note: an earlier mistyped `pnpm --filter @prompthub/desktop test:run -- ...` invocation ran the broad desktop test suite and surfaced two unrelated failures in `tests/integration/components/skill-ui.integration.test.tsx`.

## Synced Docs

- Added this active change record.
- Added `specs/prompt-relationships/spec.md` to define V1 `grouped_under` behavior and the broader future relationship taxonomy.

## Follow-ups

- Decide whether to add a dedicated `prompt_relations` table for `related_to`, `variant_of`, `depends_on`, and `next_step`.
- Revisit list-mode batch actions after the tree list stabilizes.
- Consider an Obsidian-like graph view as a separate read/explore surface, not as the primary relation editing workflow.
