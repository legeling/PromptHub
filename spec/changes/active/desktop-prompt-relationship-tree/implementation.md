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

## 2026-06-16 Prompt Card Polish Follow-up

- Removed the hidden leaf-card collapse placeholder that made prompt titles look
  indented even when a prompt had no children.
- Moved the card collapse affordance into the child-count control so only parent
  prompts show an expand/collapse target.
- Removed the absolute hierarchy guide lines from prompt cards because they
  overlapped the parent prompt label and prompt content in nested lists.
- Added a regression that leaf child cards do not render empty collapse controls
  or content-covering hierarchy guide lines.

Verification:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-card-layout.test.tsx --run`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-card-layout.test.tsx tests/unit/components/prompt-table-view.test.tsx tests/unit/components/prompt-drag-utils.test.ts --run`
- `pnpm --dir apps/desktop exec eslint src/renderer/components/layout/MainContent.tsx tests/unit/components/prompt-card-layout.test.tsx --max-warnings 0`
- `pnpm --filter @prompthub/desktop typecheck`

## 2026-06-16 Relationship Action Polish Follow-up

- Downgraded the inline detail and detail-modal related-prompts action from a
  prominent bordered button to a quiet secondary control with muted icon,
  smaller label, and lightweight count.
- Moved the inline detail related-prompts action into the parent/child
  relationship metadata row so it no longer creates a standalone row above
  prompt images or content.
- Changed the relationship entry copy to "Prompt relationships" so the UI
  matches the combined model users see: parent-child hierarchy plus regular
  related links.
- The relationship count shown in detail surfaces now includes parent, child,
  and semantic related links, so prompts with hierarchy no longer display a
  misleading zero.
- Synced the active change docs to clarify that UI-created non-tree links are
  `related_to` only. Legacy directional relation kinds remain supported for
  compatibility with existing stored data, but are not exposed as primary
  product relationship categories.

Verification:

- `node -e 'for (const f of ["en","zh","zh-TW","ja","fr","de","es"]) JSON.parse(require("fs").readFileSync("apps/desktop/src/renderer/i18n/locales/"+f+".json","utf8")); console.log("locales ok")'`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-relationship-panel.test.tsx --run`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-detail-metadata.test.tsx --run`
- `pnpm --dir apps/desktop exec eslint src/renderer/components/layout/MainContent.tsx src/renderer/components/prompt/PromptDetailModal.tsx src/renderer/components/prompt/PromptRelationshipPanel.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-relationship-panel.test.tsx --max-warnings 0`
- `pnpm --filter @prompthub/desktop typecheck`

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

## 2026-06-15 Obsidian Graph Visual Follow-up

- Removed the remaining card-like node labels from the graph. Labels now render
  as transparent SVG text beside small graph nodes instead of white prompt
  cards.
- Expanded the graph coordinate space and tuned force constants so large prompt
  libraries spread out more like a star map instead of stacking in the viewport.
- Added hover/drag cluster highlighting: the active node and one-hop neighbors
  brighten while unrelated nodes dim, making the force movement easier to read.
- Tightened dense-graph label rules so selected, hovered, and nearby nodes stay
  identifiable while isolated nodes only reveal labels after zooming in.
- Added a regression that prevents prompt graph labels from returning to
  rectangular card containers.

Verification:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-graph-view.test.tsx --run`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-graph-view.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-card-layout.test.tsx tests/unit/components/prompt-list-header.test.tsx --run`
- `pnpm --dir apps/desktop exec eslint src/renderer/components/prompt/PromptGraphView.tsx src/renderer/components/prompt/prompt-graph-layout.ts tests/unit/components/prompt-graph-view.test.tsx --max-warnings 0`
- `pnpm --filter @prompthub/desktop typecheck` is currently blocked by an
  unrelated dirty MCP change in `src/renderer/components/mcp/McpManager.tsx`
  (`Property 'trim' does not exist on type 'never'`).

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
