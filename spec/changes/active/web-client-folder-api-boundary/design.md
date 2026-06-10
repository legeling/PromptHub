# Design

## Boundary

`apps/web/src/client/api/endpoints.ts` is the browser-facing request wrapper for
folder creation. It should expose the route fields used by normal Web UI flows.

## Approach

- Add `parentId?: string` to the `createFolder()` payload type.
- Keep request serialization unchanged so any supplied `parentId` is forwarded
  in the JSON body.

## Verification

Update the client endpoints test to create a child folder and assert the
outgoing request body includes `parentId`.
