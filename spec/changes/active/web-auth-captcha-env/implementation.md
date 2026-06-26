# Implementation

## Shipped

- Added `AUTH_CAPTCHA_ENABLED` to `apps/web` configuration, defaulting to `true`.
- `GET /api/auth/bootstrap` now returns `captchaEnabled` so the client follows backend policy.
- `POST /api/auth/register` and `POST /api/auth/login` skip captcha validation only when `AUTH_CAPTCHA_ENABLED=false`.
- `GET /api/auth/captcha` returns `{ captchaEnabled: false }` without creating a challenge when captcha is disabled.
- Login and setup pages hide the captcha image, refresh button, and answer input when bootstrap reports captcha disabled.
- Client auth payloads now allow omitted captcha fields for disabled-captcha deployments.
- Cloudflare Worker auth supports the same `AUTH_CAPTCHA_ENABLED=false` switch for captcha issue/verify/bootstrap behavior.
- Documented the variable in `.env.example`, `docs/web-self-hosted.md`, `docs/cloudflare-workers.md`, `apps/web-cloudflare/wrangler.jsonc`, and stable Web behavior spec.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/routes/auth.test.ts src/client/pages/Login.test.tsx src/client/pages/Setup.test.tsx src/client/contexts/AuthContext.test.tsx src/client/api/auth.test.ts`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `pnpm --filter @prompthub/web-cloudflare test -- --run tests/auth.test.ts tests/worker.test.ts`
- `pnpm --filter @prompthub/web-cloudflare typecheck` remains blocked by unrelated existing errors.
- `git diff --check` for touched files.

Cloudflare full `typecheck` remains blocked by existing unrelated errors in `apps/web-cloudflare/src/web-data.ts` around `string | null | undefined` values. This change did not touch that file.

## Synced Docs

- `docs/web-self-hosted.md`
- `docs/cloudflare-workers.md`
- `spec/knowledge/behavior/web.md`
- `spec/changes/active/web-auth-captcha-env/`

## Follow-ups

- Fix the unrelated Cloudflare `src/web-data.ts` typecheck errors in a separate change.
