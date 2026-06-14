# Implementation

## Shipped

- Removed the separate prompt relationship prototype/workbench from the desktop
  renderer.
- Added durable tree fields to prompts and a graph relation storage boundary.
- Added direct drag-and-drop grouping/reordering to the existing prompt card
  list and table view.
- Added stronger tree-line, parent-label, and child-count cues to the existing
  card list and table view so drag results are visible without opening a new
  page.
- Added compact parent/child navigation to the existing prompt detail header so
  a dragged relationship has an immediate workflow use.
- Added workspace frontmatter support for `parentId` and `order`.
- Added backup-import sanitation for missing or self-referential prompt parents.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/prompt-db.test.ts tests/unit/main/prompt-relation-db.test.ts --run`: 62 tests passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-table-view.test.tsx --run`: 11 tests passed.
- `pnpm --filter @prompthub/desktop typecheck`: passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-table-view.test.tsx tests/unit/components/prompt-drag-utils.test.ts --run`: 13 tests passed.
- `pnpm --filter @prompthub/desktop typecheck`: passed.

## Notes

The current user operation is intentionally simple: drag an existing prompt onto
another prompt. Dropping in the middle groups it under the target; dropping near
the top or bottom reorders it around the target.
