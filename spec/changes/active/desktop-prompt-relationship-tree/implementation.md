# Implementation

## 2026-06-26 Child-count Sorting Regression Hardening

- Fixed the prompt-list resize handle hit target so it no longer sits on top
  of the prompt list scrollbar. The handle hit area now lives outside the list
  pane while the visible divider stays aligned to the pane boundary.
- Added `ColumnResizer` coverage for start-pinned divider rendering, preserving
  the scroll-pane-safe hit-target layout.
- Added service-level regressions for child-count sorting so only direct
  visible children are counted and pinned prompts only win ties with the same
  child count.
- Added display-flattening regressions so prompt card/table tree rendering
  preserves the caller's already-sorted input order for both root and child
  sibling groups instead of reverting to stored `order`.
- Added TopBar regressions for the search clear button in Skill, MCP, and
  Plugin modules so the active module search is cleared without mutating prompt
  search state.
- Added a prompt copy regression that user-prompt copy output excludes the
  system prompt and `[System]` / `[User]` role labels.
- Removed local Playwright CLI and screenshot output artifacts from the working
  tree and added ignore rules for `.playwright-cli/` and `output/playwright/`
  so UI verification evidence does not accidentally become source changes.

Verification:

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/column-resizer.test.tsx --run`: 9 tests passed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-card-layout.test.tsx tests/unit/components/prompt-drag-utils.test.ts --run`: 6 tests passed.
- `pnpm --filter @prompthub/desktop typecheck`: passed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/prompt-filter.test.ts --run`: 6 tests passed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-drag-utils.test.ts --run`: 4 tests passed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-list-header.test.tsx --run`: 8 tests passed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`: 24 tests passed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-copy-utils.test.ts --run`: 11 tests passed.

## 2026-06-26 Prompt Node Creation And Indent Follow-up

- Updated prompt sort labels across all renderer locales so direct child-count
  sorting is presented as node-count high-to-low / low-to-high sorting.
- Changed top-bar prompt creation to default new prompts under the currently
  selected prompt node by setting `parentId` in the create payload. The default
  applies to manual, quick-add, generated, and image-reverse creation, while an
  explicit `parentId` from the caller still wins.
- Preserved create payload fields through the shared `CreatePromptDTO` shape so
  variables, videos, notes, visibility, order, folder, and parent data are not
  dropped by the top-bar orchestration.
- Increased compact prompt-card child indentation from 12px to 16px per depth
  level and kept parent chips aligned with the deeper title rail.

Verification:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/prompt-list-header.test.tsx tests/unit/components/prompt-card-layout.test.tsx tests/unit/components/top-bar.test.tsx --run`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/prompt-filter.test.ts tests/unit/components/prompt-drag-utils.test.ts tests/unit/components/prompt-table-view.test.tsx tests/unit/components/prompt-list-header.test.tsx tests/unit/components/prompt-card-layout.test.tsx tests/unit/components/top-bar.test.tsx --run`
- `node -e 'for (const f of ["en","zh","zh-TW","ja","fr","de","es"]) JSON.parse(require("fs").readFileSync("apps/desktop/src/renderer/i18n/locales/"+f+".json","utf8")); console.log("locales ok")'`
- `pnpm --dir apps/desktop exec eslint src/renderer/components/layout/TopBar.tsx src/renderer/components/layout/MainContent.tsx tests/unit/components/top-bar.test.tsx tests/unit/components/prompt-list-header.test.tsx tests/unit/components/prompt-card-layout.test.tsx --max-warnings 0`
- `pnpm --filter @prompthub/desktop typecheck`
- `git diff --check`

## 2026-06-22 Child Count Sorting Follow-up

- Added prompt sort options for direct child count descending and ascending.
- Kept the child-count definition aligned with card/table hierarchy badges:
  only direct children visible in the current prompt collection are counted.
- Made child count the primary key for child-count sorting; pinned prompts only
  win ties with the same child count.
- Updated card and table tree flattening to preserve the already-sorted input
  sibling order for display, while leaving drag move-target calculations on the
  stored hierarchy order.
- Updated the sort selector to write sort key and order atomically, avoiding a
  transient mixed sort state while the app is running.
- Reset card, table, gallery, and kanban scroll/page position when the sorted
  prompt order changes so users immediately see the newly selected sort result.
- Shortened child-count sort labels so the sort menu remains compact.

Verification:

- `pnpm --filter @prompthub/desktop test -- --run tests/unit/services/prompt-filter.test.ts tests/unit/components/prompt-list-header.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-quick-install.test.tsx tests/unit/components/prompt-drag-utils.test.ts tests/unit/services/prompt-filter.test.ts tests/unit/components/prompt-list-header.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `git diff --check`

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
