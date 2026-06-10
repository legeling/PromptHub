# Implementation

## Shipped

- Added `TRUST_PROXY_HEADERS`, defaulting to `false`, to the Web server
  configuration.
- Updated auth rate-limit client identity derivation so `x-forwarded-for` and
  `x-real-ip` are ignored unless trusted proxy headers are explicitly enabled.
- Added bounded normalization for trusted proxy-derived client identifiers.
- Added auth route regressions proving spoofed forwarded headers no longer
  bypass login rate limits by default and that trusted proxy mode still uses the
  first `x-forwarded-for` hop.
- Documented the new deployment setting in `apps/web/.env.example` and
  `docs/web-self-hosted.md`.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "spoofed forwarded headers"`
  - Failed because the sixth invalid login with a new `x-forwarded-for` value
    returned `401` instead of the expected `429`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts -t "forwarded headers|spoofed forwarded headers"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/config.ts apps/web/src/services/auth-rate-limit.ts apps/web/src/routes/auth.test.ts apps/web/.env.example docs/web-self-hosted.md spec/changes/active/web-auth-rate-limit-client-identity`

## Synced Docs

- Updated self-hosted deployment documentation and the Web `.env.example`.
- Deferred the stable `spec/knowledge/behavior/web.md` sync because that file
  currently contains unrelated pending edits that should land in separate
  batches.

## Follow-ups

- None currently.
