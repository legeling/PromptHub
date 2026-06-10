# Proposal

## Why

The Web folder API accepts both the current `visibility` field and the legacy
`isPrivate` field. When a client sends only `isPrivate: false`, the service
currently defaults `visibility` to `private` while writing `is_private = 0`,
leaving one folder row with contradictory visibility state.

## Scope

- Normalize legacy `isPrivate` input into the current `visibility` model for
  Web folder create and update operations.
- Keep `visibility` as the source of truth when both fields are present.
- Preserve existing owner, role, parent, cycle, and workspace-sync behavior.

## Risks

- Legacy clients that send `isPrivate: false` now create or request shared
  folders, so normal users must receive the same admin-only validation that
  explicit `visibility: "shared"` already has.

## Rollback

Revert the service normalization and route regression test. No schema migration
is involved.
