# Design — skill tag display governed by the frontmatter-filter setting

Status: implemented on feat/my-skills-tag-search (two-phase, same branch).

## Root cause

Since this branch’s migration, SKILL.md frontmatter (source) tags live in
`original_tags` while `skill.tags` holds the user/DB-assigned tags. Two problems
surfaced:

1. The **list rows** (`SkillListView.tsx`) only rendered `skill.tags`, so an
   imported skill whose only tags came from frontmatter showed none until a
   detail-related path consulted `original_tags`.
2. Additionally, `buildSkillSyncUpdateFromRepo`
   (`apps/desktop/src/main/services/skill-repo-sync.ts`) wrote
   `parsed.frontmatter.tags` **directly into `tags`**. So opening a detail
   triggered `syncFromRepo`, which rewrote `skill.tags` to the frontmatter
   tags; returning to the list then showed them even when the
   “包含 SKILL.md frontmatter 标签” setting was off.

## Fix

- **Display** (`SkillListView.tsx`): subscribe to
  `skillTagFilterIncludeFrontmatter`. When **enabled**, row badges are
  `tags ∪ original_tags` (de-duplicated, cap 3). When **disabled** (default),
  only `tags` are shown.
- **Data** (`skill-repo-sync.ts`): stop putting frontmatter tags into `tags`;
  instead normalize them into `sourceTags` and write `update.original_tags`
  (only when different from the current `original_tags`). `update.tags` never
  changes due to frontmatter, so a repo sync (detail open) cannot flip list
  display.

`original_tags → filter candidates` remains governed by the same existing
setting, so filter candidates and row badges stay consistent.
