# Implementation

## Shipped

- Added a Web client endpoints regression proving `createFolder()` forwards
  `parentId` in the JSON body when creating a child folder.
- Expanded the `createFolder()` payload type to include `parentId?: string`,
  matching the backend create-folder route.

## Verification

- Failure-first check before implementation:
  - `pnpm --filter @prompthub/web typecheck`
  - Failed because the client wrapper type rejected `parentId`.
- Passing checks after implementation:
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web test -- --run src/client/api/endpoints.test.ts -t "folder, skill"`

## Follow-ups

- None.
