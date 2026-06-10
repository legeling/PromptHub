# Implementation

## Shipped

- Added `readRequestBytesBody()` and `readRequestTextBody()` in
  `apps/web/src/utils/validation.ts`.
- Updated `parseJsonBody()` to parse from the limited text reader instead of
  using unbounded `c.req.json()`.
- Preserved route-specific body size messages and limits for auth, AI proxy,
  sync data import, import/export JSON and raw ZIP import, and media base64
  upload.
- Updated multipart import to read the full request through the 50 MiB import
  limit before parsing form data.
- Updated the skill safety-scan optional JSON body parser to use the same
  limited text reader.
- Added auth route regressions for streamed oversized request bodies without
  `Content-Length`.
- Added an import/export route regression for streamed oversized multipart
  imports without `Content-Length`.

## Verification

- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts src/routes/ai.test.ts src/routes/media.test.ts src/routes/sync.test.ts src/routes/import-export.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "streamed multipart imports"`
- `pnpm --filter @prompthub/web lint`
- `git diff --check`
