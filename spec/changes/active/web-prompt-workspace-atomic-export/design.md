# Design

## Overview

Keep SQLite as the source of truth, but change the filesystem export side effect
from direct destructive rewrite to staged rewrite. The exporter builds the full
workspace tree in a sibling temporary directory. Only after every file is
written does it replace the live `data/prompts` directory.

## Affected Areas

- `apps/web/src/services/prompt-workspace.ts`
- `apps/web/src/services/prompt-workspace.test.ts`
- `spec/knowledge/behavior/web.md`

## Key Decisions

- Validate workspace path length before creating the staging tree, preserving
  the existing preflight behavior.
- Write folder metadata, prompt files, and version files into staging paths.
- On staging write failure, remove only the staging directory and leave the
  current live workspace untouched.
- During replacement, move the old live directory to a sibling backup, move the
  staging directory into place, then remove the backup.
- If replacement fails after the old directory was moved, restore it before
  surfacing the error.

## Tradeoffs

- Directory replacement is not crash-proof across every possible power-loss
  moment, but it closes the common and testable application-level failure where
  a write throws after the live workspace has already been deleted.
- Staging temporarily doubles prompt workspace disk usage during export.
