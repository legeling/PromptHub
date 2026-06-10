# Design

## Overview

Keep the existing per-user rules layout and change only the version-directory
rewrite strategy. `writeRuleVersions()` builds the next version set in a sibling
staging directory. It replaces the live `.versions/<rule-id>/` directory only
after every version file and `index.json` have been written successfully.

## Affected Areas

- `apps/web/src/services/rule-workspace.ts`
- `apps/web/src/services/rule-workspace.test.ts`
- `spec/knowledge/behavior/rules-workspace.md`

## Key Decisions

- Preserve existing path validation before any filesystem writes.
- Stage version files and `index.json` together to keep the index aligned with
  the files it references.
- If staging fails, remove only staging and preserve the previous live version
  directory.
- During replacement, move the old version directory to backup, move staging
  into place, then remove backup.

## Tradeoffs

- Staging temporarily duplicates rule version storage.
- This is application-level failure hardening, not a full crash-consistency
  journal for every power-loss moment.
