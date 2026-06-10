# Implementation

## Shipped

- Added `MAX_OPTIONAL_AUTH_BODY_BYTES` and a `Content-Length` precheck before `parseOptionalAuthBody()` calls `c.req.text()`.
- Invalid declared lengths now return `400 BAD_REQUEST` with `Invalid Content-Length header`.
- Declared optional auth bodies over 1 MiB now return `400 BAD_REQUEST` with `Auth request body exceeds size limit`.
- Added a refresh route regression proving invalid/oversized declarations do not consume the refresh token.
- Added `parseAuthJsonBody()` so `POST /api/auth/register`,
  `POST /api/auth/login`, and `PUT /api/auth/password` also run the same
  `Content-Length` precheck before `parseJsonBody()` reads credential JSON.
- Added route regressions proving oversized register and password-change
  bodies return `400 BAD_REQUEST` before JSON parsing, and that an oversized
  password-change request does not change the password.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "oversized optional auth bodies"` failed before the fix with `expected 200 to be 400`.
- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "oversized optional auth bodies"`
- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "oversized auth JSON bodies"` failed before the fix because register returned `Invalid JSON request body`.
- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "oversized auth JSON bodies"`
- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `git diff --check -- apps/web/src/routes/auth.ts apps/web/src/routes/auth.test.ts spec/changes/active/web-auth-optional-body-size-boundary`

## Synced Docs

- Active change only; no stable behavior docs are expected for this narrow validation fix.

## 2026-06-10 Follow-up

- Replaced auth JSON/text parsing with the shared limited request body reader,
  so oversized requests are rejected both when `Content-Length` is declared and
  when the body is streamed without a length header.
- Added streamed oversized regression coverage for `/api/auth/refresh` and
  `/api/auth/register`.
- Verified with:
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts src/routes/ai.test.ts src/routes/media.test.ts src/routes/sync.test.ts src/routes/import-export.test.ts`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check`
