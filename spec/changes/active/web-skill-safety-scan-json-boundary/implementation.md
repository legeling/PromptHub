# Implementation

## Shipped

- Added `parseOptionalJsonBody()` in `apps/web/src/routes/skills.ts`.
- Updated `POST /api/skills/:id/safety-scan` so empty bodies still map to `{}`,
  while malformed non-empty JSON returns `400 BAD_REQUEST`.
- Added a route regression proving malformed JSON returns the shared invalid
  JSON error and does not call the mocked AI transport.
- Added a route regression proving oversized direct and legacy safety scan
  inputs return `422 VALIDATION_ERROR` before calling the AI provider.
- Bounded safety scan name, content, local path, audit metadata, and AI config
  fields in the shared safety scan input schema.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "scans safety findings"`
  - Failed because malformed JSON returned `422` through the missing-AI-config
    path instead of `400 BAD_REQUEST`.
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects oversized safety scan inputs"`
  - Failed because direct safety scan accepted oversized input with `200` and
    called the mocked AI provider.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "scans safety findings"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts -t "rejects oversized safety scan inputs"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/skills.test.ts`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web Skill safety scan input boundary. No stable docs were synced
  because the broader Skill safety workflow remains unchanged.

## Follow-ups

- None currently.
