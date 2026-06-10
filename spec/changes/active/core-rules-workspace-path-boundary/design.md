# Design

## Overview

Add a conservative project-id validation helper in the shared Rules workspace
service. Validate optional ids before using them in directory names and validate
imported project rule ids before creating missing project rules.

## Affected Areas

- `packages/core/src/rules-workspace.ts`
- `apps/desktop/tests/unit/main/rules-workspace.test.ts`
- `spec/knowledge/behavior/rules-workspace.md`

## Key Decisions

- Allow only project ids that can be safely used as one path segment:
  `A-Za-z0-9._-`, starting with an alphanumeric character.
- Reuse the same guard for direct project creation and backup import.
- Keep random UUID-generated ids unchanged because they already satisfy the
  safe segment rule.

## Verification

- Add a failure-first import regression for `project:../../../escaped`.
- Run the focused Rules workspace test file, core/desktop typecheck, targeted
  test lint, and diff check.
