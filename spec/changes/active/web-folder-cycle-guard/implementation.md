# Implementation

## Shipped

- Added a route regression for `PUT /api/folders/:id` that reproduces the
  previous bug: a user could update a folder's `parentId` to itself or to one of
  its descendants.
- Added `FolderService` parent-chain validation before normal parent updates are
  persisted.
- The guard rejects self-parent, descendant-parent, and preexisting cyclic
  parent chains with `422 VALIDATION_ERROR` and the message
  `Folder cannot be moved under itself or its descendants`.
- Added `parentId: null` support for normal folder updates so a nested folder can
  be moved back to the root through `PUT /api/folders/:id`.
- Updated the shared `UpdateFolderDTO` and DB update return mapping so clearing
  the parent is represented consistently as absent `parentId` in API output and
  `NULL` in SQLite.
- Added visibility edge validation for normal updates so changing a folder's
  visibility without changing `parentId` cannot leave it mismatched with its
  current parent or direct children.
- Direct restore/import inserts remain out of scope for this normal Web API
  update guard.

## Verification

- Failure-first check before implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "parent updates"`
  - Failed because self-parent update returned `200` instead of `422`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "moving a nested folder back to the root"`
  - Failed because `parentId: null` returned `422` instead of clearing the
    parent.
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "visibility-only"`
  - Failed because changing a shared child to private under an existing shared
    parent returned `200`.
- Passing checks after implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "parent updates"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "moving a nested folder back to the root"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "visibility-only"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts`

## Synced Docs

- Active delta spec, design, and tasks cover the behavior change. No stable docs
  were synced because this is a narrow Web API parent-update contract hardening
  and does not change schema, storage ownership, or long-lived folder semantics.

## Follow-ups

- Consider a separate import/restore audit for detecting and repairing
  preexisting folder cycles across direct insert paths.
