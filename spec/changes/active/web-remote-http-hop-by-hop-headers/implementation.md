# Implementation

## Shipped

- Added a shared `BLOCKED_REQUEST_HEADERS` denylist in
  `apps/web/src/utils/remote-http.ts`.
- Updated `normalizeHeaders()` so caller-supplied hop-by-hop request headers are
  stripped before opening upstream HTTP(S) requests.
- Added a regression proving the helper preserves safe custom headers while
  removing connection-level headers.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts -t "hop-by-hop request headers"`
  - Failed because `Connection`, `Keep-Alive`, `Proxy-Authorization`, `TE`,
    `Trailer`, `Transfer-Encoding`, and `Upgrade` were forwarded to
    `https.request`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts -t "hop-by-hop request headers"`
  - `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts src/services/webdav.server.test.ts src/routes/ai.test.ts src/routes/media.test.ts src/services/skill.service.test.ts`
  - `pnpm --filter @prompthub/web typecheck`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this shared Web remote HTTP boundary. No stable docs were synced because the
  public Web API surface is unchanged.

## Follow-ups

- None currently.
