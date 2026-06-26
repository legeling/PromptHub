# Design

## Overview

Add a positive boolean env switch:

```env
AUTH_CAPTCHA_ENABLED=true
```

Default is `true`. Only `AUTH_CAPTCHA_ENABLED=false` disables captcha.

The backend remains the source of truth. `/api/auth/bootstrap` returns `captchaEnabled`; setup/login pages use that flag to decide whether to request/render a captcha and whether to include captcha fields in submit payloads.

## Design Decisions

- `DES-001`: Add `AUTH_CAPTCHA_ENABLED` as an explicit boolean env flag, defaulting to enabled.
- `DES-002`: Keep server-side register/login validation as the authority; skip only captcha verification when the flag is `false`.
- `DES-003`: Expose `captchaEnabled` through bootstrap so setup/login UI follows backend policy rather than duplicating env logic.
- `DES-004`: Apply the same env contract to `apps/web-cloudflare` so Worker deployments do not drift from Node self-hosted behavior.
- `DES-005`: Keep rate limits, password checks, registration policy, JWT cookies, and refresh-token behavior outside the captcha switch.

## Affected Areas

- Data model: none.
- IPC / API: `GET /api/auth/bootstrap` response gains `captchaEnabled`.
- Filesystem / sync: none.
- UI / UX: setup/login captcha field is hidden when disabled.
- Cloudflare: `Env.AUTH_CAPTCHA_ENABLED` controls worker captcha generation/verification.

## Tradeoffs

- A single explicit boolean is easier to deploy than mode strings.
- Keeping default `true` avoids silently weakening existing public deployments.
- `/api/auth/captcha` may still be callable, but when disabled it returns an inert disabled payload instead of storing a challenge.

## Verification Mapping

- `TEST-001`: Web route test proves setup/login succeeds without captcha fields only when `AUTH_CAPTCHA_ENABLED=false`.
- `TEST-002`: Web route tests continue to prove missing captcha is rejected when the flag is enabled/default.
- `TEST-003`: Login/setup page tests prove captcha UI is hidden and submit payloads omit captcha fields when bootstrap disables captcha.
- `TEST-004`: Cloudflare Worker tests prove `/captcha` returns an inert disabled payload and register/login succeed without captcha when disabled.
