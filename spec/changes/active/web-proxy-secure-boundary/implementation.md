# Implementation

## Shipped

- Added `apps/web/src/utils/secure-request.ts` as the shared secure-request
  decision point.
- `securityHeaders()` now emits HSTS for direct HTTPS requests or trusted proxy
  HTTPS requests only. Spoofed `x-forwarded-proto` is ignored unless
  `TRUST_PROXY_HEADERS=true`.
- Auth cookie options now use the same secure-request helper, so deployments
  behind a trusted HTTPS reverse proxy set the `Secure` flag even when the app
  receives local HTTP requests.
- Added tests for untrusted forwarded proto HSTS behavior and trusted proxy
  secure auth cookies.

## Verification

- Failure-first checks:
  - `pnpm --filter @prompthub/web test -- --run src/middleware/security-headers.test.ts` failed because untrusted `x-forwarded-proto: https` still emitted HSTS.
  - `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "trusted proxy HTTPS"` failed because proxy HTTPS auth cookies lacked `Secure`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/middleware/security-headers.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "trusted proxy HTTPS"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts src/middleware/security-headers.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/utils/secure-request.ts apps/web/src/utils/auth-cookies.ts apps/web/src/middleware/security-headers.ts apps/web/src/middleware/security-headers.test.ts apps/web/src/routes/auth.test.ts spec/changes/active/web-proxy-secure-boundary`
