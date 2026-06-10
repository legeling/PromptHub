# Design

## Overview

Keep SQLite as the source of truth and change only the filesystem export side
effect. The exporter builds the full `data/skills` tree in a sibling staging
directory. After every skill metadata file, `SKILL.md`, version file, and
sidecar file succeeds, it replaces the live workspace.

## Affected Areas

- `apps/web/src/services/skill-workspace.ts`
- `apps/web/src/services/skill-workspace.test.ts`
- `spec/knowledge/behavior/web.md`

## Key Decisions

- Keep path prevalidation before staging creation.
- Preserve existing additional skill files by reading them from the live tree
  before replacement, as current behavior does.
- Skip interrupted staging/backup directories when reading existing additional
  files and when importing workspace data.
- On staging write failure, remove only staging and keep the current live
  workspace unchanged.
- During replacement, move the old live directory to a sibling backup, move
  staging into place, then remove the backup.

## Tradeoffs

- Staging temporarily duplicates skill workspace storage.
- This hardens application-level write errors; it is not a full filesystem
  journal for power-loss at every possible rename boundary.
