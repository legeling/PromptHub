# Proposal

## Why

The shared Rules workspace service builds managed project-rule directories from
`CreateRuleProjectInput.id` and imported backup record ids. Web routes already
reject unsafe project ids, but desktop, CLI, and direct shared-service callers
can still pass ids containing path separators or traversal segments.

## Scope

- Validate project rule ids inside `packages/core/src/rules-workspace.ts`.
- Reject unsafe imported project rule records before creating managed files.
- Keep the existing managed workspace layout for valid ids unchanged.
- Add regression coverage for path traversal through backup import ids.

## Risks

- Previously accepted project ids containing path separators or control
  characters will now be rejected.
- Existing valid ids using letters, numbers, dots, underscores, and hyphens are
  preserved.

## Rollback

Revert the core project id validation and regression test. The path traversal
test will fail if unsafe ids can again create managed files outside the project
workspace root.

## Impacted User Flows

- Desktop Rules project creation.
- CLI/shared Rules project creation.
- Rules backup import and restore.
