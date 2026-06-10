# Proposal

## Why

The Web folder route supports creating nested folders with `parentId`, but the
Web client API wrapper only exposes `name`, `icon`, and `visibility`. Client code
using the wrapper cannot create child folders even though the backend supports
the workflow.

## Scope

- Align the Web client `createFolder()` wrapper with the backend create-folder
  contract for `parentId`.
- Add a client API regression proving the request body forwards `parentId`.

## Risks

- Low. This only expands the wrapper type and preserves the existing payload
  shape.

## Rollback

Revert the wrapper type change and client API test.
