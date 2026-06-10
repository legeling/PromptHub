# Proposal

## Why

Web settings updates are patch-style requests, but nested settings such as
`sync` and `device` are currently merged shallowly. Updating one nested field can
drop previously saved sibling fields, such as clearing a WebDAV endpoint when
only `sync.lastSyncAt` is patched.

## Scope

- Preserve existing nested settings fields when a partial `sync` or `device`
  patch is submitted.
- Keep explicit `null` / `undefined` behavior for top-level key clearing.
- Do not introduce broad recursive merging for arbitrary settings objects.

## Risks

- Existing clients that intentionally replace the whole nested object through a
  partial payload will now get patch semantics. This matches the route's
  existing partial-update contract and avoids accidental data loss.

## Rollback

Revert the service merge helper and tests. No schema migration is involved.
