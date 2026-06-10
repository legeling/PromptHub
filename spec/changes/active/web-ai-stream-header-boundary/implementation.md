# Implementation

## Shipped

- Added route assertions proving upstream `set-cookie` and
  `transfer-encoding` headers are not forwarded by `POST /api/ai/stream`.
- Added `BLOCKED_STREAM_RESPONSE_HEADERS` for cookie and hop-by-hop response
  headers while preserving safe provider headers.
- Added route assertions proving `POST /api/ai/request` and
  `POST /api/ai/stream` reject non-HTTPS upstream URLs before contacting
  remote transports.
- Restricted AI proxy URL validation and remote transport protocol allowlists
  to HTTPS.
- Added route assertions proving oversized AI proxy request envelopes and
  fields are rejected before contacting remote transports.
- Added request envelope `Content-Length` precheck and parsed-field limits for
  AI proxy request id, URL, headers, and body.
- Added route assertions proving streaming transport exception messages are not
  returned to clients.
- Sanitized `POST /api/ai/stream` transport exceptions to a generic internal
  server error response.
- Changed `POST /api/ai/stream` non-2xx handling so the route consumes the
  original stream response body and returns an AI transport envelope instead of
  replaying the same upstream request through the buffered transport.
- Added route assertions proving buffered transport exception messages are not
  returned to clients.
- Sanitized `POST /api/ai/request` transport exceptions to a generic AI proxy
  failure message while preserving upstream non-2xx HTTP response envelopes.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "streams successful AI responses"`
  - Failed because upstream `set-cookie` was present on the PromptHub response.
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "non-HTTPS"`
  - Failed because `/api/ai/request` accepted an `http://` upstream URL and
    contacted the buffered transport.
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "rejects oversized AI proxy request envelopes"`
  - Failed because `/api/ai/request` parsed the oversized malformed body as
    ordinary invalid JSON instead of rejecting the declared request size first.
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "does not expose streaming transport error details"`
  - Failed because `/api/ai/stream` returned the raw `stream exploded` transport
    exception message to the client.
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "without replaying"`
  - Failed because `/api/ai/stream` called the buffered transport after the
    stream transport returned a `502` response.
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "buffered transport error"`
  - Failed because `/api/ai/request` returned the raw
    `connect ECONNREFUSED 10.0.0.5:443` transport exception message.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "streams successful AI responses"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "non-HTTPS"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "rejects oversized AI proxy request envelopes"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "does not expose streaming transport error details"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts -t "without replaying"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts src/utils/remote-http.test.ts src/services/skill.service.test.ts src/routes/media.test.ts src/services/webdav.server.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/ai.ts apps/web/src/routes/ai.test.ts spec/changes/active/web-ai-stream-header-boundary`
  - `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web AI stream header boundary. No stable docs were synced because
  the application-level AI stream API remains unchanged.

## Follow-ups

- None currently.
