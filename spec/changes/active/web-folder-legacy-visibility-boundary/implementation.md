# Implementation

## Shipped

- Added a Web folder route regression that proves legacy `isPrivate: false`
  create/update requests map to shared visibility, preserve coherent
  `visibility` / `isPrivate` response state, and still require admin
  permission.
- Added `FolderService` visibility resolvers so `visibility` remains
  authoritative when both fields are present, while legacy `isPrivate` is
  normalized before authorization, persistence, parent validation, and workspace
  sync.

## Verification

- Failure-first check before implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "legacy isPrivate"`
  - Failed because a normal user request with `isPrivate: false` returned `201`
    instead of `403`.
- Passing checks after implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "legacy isPrivate"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts`

## Follow-ups

- None.
