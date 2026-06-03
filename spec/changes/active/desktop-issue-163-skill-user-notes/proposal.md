# Issue 163 Skill User Notes

## Problem

Users install most skills from stores or Git repositories. They need a local
personal note for a specific skill so they can remember how they use it, what it
is good at, or why they kept it.

Editing `description` is not correct because `description` belongs to the skill
definition/source metadata and can be overwritten when the skill is updated from
its source.

## Scope

- Add a user-owned skill note sidecar stored at `.prompthub/user.json` inside
  the managed skill repo.
- Preserve the note across store/Git updates and repo syncs.
- Add a detail-page editing surface for installed managed skills.

## Non-goals

- Do not write notes into `SKILL.md` frontmatter or skill files.
- Do not store notes in SQLite in this change.
- Do not include notes in source identity, safety scanning, or install/update
  checks.
- Do not add per-agent or per-project override notes in this change.

## Risk

The sidecar must remain local user metadata. Source refreshes can update
description/content/tags, but must not overwrite `.prompthub/user.json` unless
the user explicitly edits the note.
