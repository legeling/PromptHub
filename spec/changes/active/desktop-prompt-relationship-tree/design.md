# Design

## Data

`prompts.parent_id` and `prompts.sort_order` own the tree-style relationship.
This is the primary interaction users get through drag-and-drop. A prompt has
at most one tree parent so ordering, indentation, and collapse state stay
deterministic.

`prompt_relations` stores graph-style related links. The product surface exposes
one non-tree relationship kind, `related_to`, so users only need to distinguish
between two concepts:

- parent-child hierarchy: drag-and-drop grouping, stored on `prompts.parent_id`
  and `prompts.sort_order`
- related prompts: lightweight many-to-many links, stored as `related_to` rows
  in `prompt_relations`

Older databases may still contain legacy graph kinds such as `variant_of`,
`depends_on`, and `next_step`. PromptHub can render those labels for
compatibility, but new UI-created relations should be saved as `related_to`.

The tree relation `grouped_under` is intentionally not duplicated in
`prompt_relations`; it is represented by `parent_id` and `sort_order`.
Related links are therefore a separate many-to-many layer and should not be used
to infer tree indentation, collapse state, or sibling order.

## UI

The relationship editor is not a separate page. It is embedded in existing
surfaces:

- Card mode: drag a prompt card in the left prompt list.
- List mode: drag a prompt table row.
- Detail mode: the existing prompt detail area exposes a quiet related-prompts
  action with a count inside the same metadata row as parent/child navigation.
  The count reflects all visible relationships for the current prompt, including
  tree parent/child links and semantic related links, so the entry never reads
  as "0" when only hierarchy exists. The editor expands below that row only when
  requested so relationship management remains secondary to reading and using
  the prompt.
- Detail modal: the same quiet related-prompts action is available in the modal
  header; the editor remains reusable and opens only when the user asks for it.
- Sidebar: the prompt navigation adds a `Relationship Graph` entry directly
  under Favorites. This switches the main prompt workspace to a graph view.
- Graph view: shows all prompts by default, independent of the active folder,
  favorite, search, tag, or type filters. It renders tree parent edges from
  `parentId` and semantic graph edges from `prompt_relations`. It uses an
  Obsidian-like SVG graph surface with live force-positioned dot nodes,
  wheel/button zoom, canvas panning, fit/reset controls, draggable in-session
  node repositioning, and label density rules so large sparse libraries do not
  turn into a ring of overlapping cards. The graph surface must render prompts
  as small nodes with transparent text labels, not prompt cards or card-like
  label containers. Dragging a node pins that node under the pointer, reheats
  the graph simulation, highlights the one-hop relation cluster, pulls connected
  nodes through edge springs, and lets the graph settle after release. Selecting
  a graph node opens the existing prompt detail modal rather than introducing a
  second detail surface.

Drop behavior:

- Top third: place before the target within the target's parent.
- Middle third: group under the target prompt.
- Bottom third: place after the target within the target's parent.

Rows/cards show the existing UI styling plus a small drag handle and drop
highlight. Parent rows/cards expose an inline expand/collapse control. The card
title row uses a fixed control rail so collapse, drag, type, favorite, and child
count controls do not push titles progressively to the right.

The prompt sort menu exposes child-count sort options. Child count uses the
same direct-visible-child definition as the card/table hierarchy count: only
prompts whose `parentId` points to a prompt in the current visible collection
are counted. Child-count order is the primary sort key for these options;
pinned prompts only stay ahead when prompts have the same direct child count.
Card and table display flattening must preserve the caller's already-sorted
sibling order; drag move-target calculation continues to use the stored sibling
`order` so drop positions remain deterministic.

When the prompt module has a selected prompt node, the top-bar prompt create
flow treats that selected prompt as the default tree parent. This default lives
in the create payload orchestration rather than in the modal form state, so
manual, quick-add, generated, and image-reverse prompt creation share the same
parent default. Explicit `parentId` values from a caller still win, including
`null` for root-level creation. New child prompts inherit the selected parent
prompt's folder when the create request does not provide a folder.

Nested compact prompt cards use a larger per-depth indent than the original
compact tree rail so child rows are visibly separated from their parent while
still clamping very deep nesting to a bounded offset.

The tree is not the whole relationship model. Related links can point to many
prompts and should be surfaced as lightweight chips or quiet detail-header
affordances rather than as extra parents in the tree. The UI should make that
separation explicit so users do not infer a hidden multi-parent tree.

## Contracts

- Shared prompt type gains `parentId` and `order`.
- Shared relation types define graph relation DTOs and queries.
- Desktop preload exposes `prompt.move` and relation CRUD.
- Main-process IPC validates move inputs before calling `PromptDB.movePrompt`.
- `PromptDB.movePrompt` is the source of truth for self-parent, missing-parent,
  invalid-order, and descendant-cycle rejection.

## Persistence

- Fresh SQLite schema includes `parent_id`, `sort_order`, and
  `prompt_relations`.
- Existing databases add missing prompt columns during startup migration.
- Prompt workspace frontmatter stores `parentId` and `order`.
- Backup import sanitizes missing/self parent references.
