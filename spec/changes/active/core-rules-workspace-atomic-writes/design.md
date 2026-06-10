# Design

## Overview

Introduce shared same-directory atomic write helpers inside
`packages/core/src/rules-workspace.ts`. Durable Rules workspace files are first
written to a temporary sibling path and then renamed over the destination only
after the full content has been written.

## Affected Areas

- `packages/core/src/rules-workspace.ts`
- `apps/desktop/tests/unit/main/rules-workspace.test.ts`
- `spec/knowledge/behavior/rules-workspace.md`

## Key Decisions

- Apply atomic writes to managed workspace files, `_rule.json`, version files,
  and version indexes because those files are the durable Rules source of
  truth.
- Keep `writeTargetRule()` on direct writes for this change. Target files are
  user-managed external files, and switching them to rename-based replacement
  could change symlink behavior.
- Clean up temporary files after failed writes where possible.

## Verification

- Add a failure-first test that simulates an interrupted managed rule write and
  asserts the previous managed content remains readable.
- Run the focused Rules workspace test file and relevant typecheck.
