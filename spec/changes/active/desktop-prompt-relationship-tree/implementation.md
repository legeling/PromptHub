# Implementation

## 2026-06-15 Follow-up

- Replaced always-visible prompt relationship panels in the inline detail view
  and detail modal with explicit relationship buttons that open the existing
  `PromptRelationshipPanel` in a modal.
- Added `graph` to the desktop prompt view mode and wired a Relationship Graph
  sidebar entry directly under Favorites. The entry resets folder/type state to
  all prompts and renders a full-prompt graph.
- Added `PromptGraphView`, which renders prompt nodes, hierarchy edges from
  `parentId`, and semantic edges from `prompt_relations`. Clicking a node opens
  the existing prompt detail modal.
- Adjusted prompt card hierarchy layout so collapse and drag controls live in a
  fixed rail and depth indentation is bounded.
- Added component regressions for the detail relationship action, sidebar graph
  navigation, graph rendering, and prompt card title alignment.

## 2026-06-15 Graph Usability Follow-up

- Replaced the fixed circular graph layout and large absolute-positioned prompt
  cards with a force-positioned SVG dot graph so large prompt libraries remain
  scannable.
- Added graph viewport controls for zoom in, zoom out, fit to screen, and reset;
  the SVG surface also supports wheel zoom and drag-to-pan.
- Added in-session node dragging for local graph arrangement without changing
  durable prompt relationships.
- Added label-density behavior: connected/selected nodes remain labeled, while
  isolated nodes in large sparse graphs show labels only after zooming in.
- Split graph layout and viewport math into `prompt-graph-layout.ts` to keep the
  React view focused on rendering and interactions.

Verification:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-graph-view.test.tsx --run`
- `pnpm --filter @prompthub/desktop typecheck`

## 2026-06-15 Animated Graph Follow-up

- Reworked the graph from a one-time layout into a live force simulation with
  node velocity, edge springs, center/home gravity, soft collision, and damping.
- Made node dragging behave like an Obsidian-style graph interaction: the
  dragged node is pinned under the pointer, connected nodes keep reacting during
  the drag, and the graph continues settling after release.
- Simplified graph edges to quiet star-map lines without visible labels or
  arrowheads. Relation types remain available through node and edge accessible
  labels, while the canvas stays visually focused on the node network.
- Added a component regression that drags a rendered graph node and verifies the
  drag does not also open the prompt detail.

Verification:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-graph-view.test.tsx --run`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-graph-view.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-card-layout.test.tsx tests/unit/components/prompt-list-header.test.tsx --run`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --dir apps/desktop exec eslint src/renderer/components/prompt/PromptGraphView.tsx src/renderer/components/prompt/prompt-graph-layout.ts tests/unit/components/prompt-graph-view.test.tsx --max-warnings 0`

Verification:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/prompt-graph-view.test.tsx tests/unit/components/prompt-card-layout.test.tsx --run`
- `pnpm --filter @prompthub/desktop typecheck`

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
- Added an inline semantic relationship panel to the existing prompt detail
  area and reused it in the detail modal so users can create, open, and delete
  graph relations without a separate page.
- Added inline expand/collapse controls in the card list and table view for
  parent prompts.
- Added workspace frontmatter support for `parentId` and `order`.
- Added backup-import sanitation for missing or self-referential prompt parents.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/prompt-db.test.ts tests/unit/main/prompt-relation-db.test.ts --run`: 62 tests passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-table-view.test.tsx --run`: 11 tests passed.
- `pnpm --filter @prompthub/desktop typecheck`: passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-table-view.test.tsx tests/unit/components/prompt-drag-utils.test.ts --run`: 15 tests passed.
- `pnpm --filter @prompthub/desktop typecheck`: passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-relationship-panel.test.tsx tests/unit/components/prompt-detail-modal.test.tsx --run`: 13 tests passed.
- `pnpm --filter @prompthub/desktop typecheck`: passed.

## Notes

The current user operation is intentionally simple: drag an existing prompt onto
another prompt. Dropping in the middle groups it under the target; dropping near
the top or bottom reorders it around the target.
