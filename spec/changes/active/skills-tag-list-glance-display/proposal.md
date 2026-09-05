# Imported Skill carries tags (metadata) but the list hides them until detail opens

Status: recorded — not implemented. Related area overlap with the in-flight
`feat/my-skills-tag-search` work (frontmatter-label settings), but treated as a
separate concern to keep commits atomic.

## Problem

After a successful import, the Skill DB row / package metadata already has tags
(frontmatter `tags`, and per the earlier change possibly frontmatter `labels`
surfaced as tags). However the skill list surface does not display them; the
tags only become visible once the user opens the item's detail view.

## Direction under investigation

- Which selector/state the list cells and the detail view share for `tags`
  (single source of truth), and where the detail-first fetch hydrates tags that
  the list projection does not carry.
- Whether this is a missing source override on the list projection, a stale
  cached row before `syncFromRepo`, or a read-only display-condition on the
  card/list rows (e.g. only render tags when explicitly expanded).

## Not yet resolved

- Exact owning module (renderer projection vs a shared `packages/shared` shape).
- Whether the fix belongs to a display rule or to keeping list rows' tag field in
  sync on import without a detail round-trip.
