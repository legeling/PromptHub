# Implementation

## Shipped

- Added `MAX_SYNC_DATA_REQUEST_BYTES` with a 50 MiB route-level request limit for direct sync data imports.
- Added `rejectOversizedSyncDataRequest()` and call it before `parseJsonBody()` in `PUT /api/sync/data`.
- Invalid declared `Content-Length` values now return `400 BAD_REQUEST`.
- Oversized declared sync data imports now return `400 BAD_REQUEST` before parsing or importing records.
- Added a route regression proving the oversized request is rejected and existing prompt data remains intact.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "oversized sync data content-length"`
  - Failed before the fix because the route returned `200` and imported the payload.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "oversized sync data content-length"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts`

## Synced Docs

- Active change only; no stable docs are expected for this narrow Web sync request-size boundary.

## Follow-ups

- Unknown-length streamed body enforcement remains out of scope.
