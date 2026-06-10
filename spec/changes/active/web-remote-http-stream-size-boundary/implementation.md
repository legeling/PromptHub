# Implementation

## Shipped Changes

- Added a streamed-response regression in
  `apps/web/src/utils/remote-http.test.ts` that reads a
  `requestRemoteStream()` body with `maxBytes: 4` and expects the read to fail
  with `Remote response exceeds size limit` once the upstream sends additional
  bytes.
- Replaced direct Node-to-Web stream conversion in
  `apps/web/src/utils/remote-http.ts` with a byte-counting `ReadableStream`
  wrapper. The wrapper preserves normal streaming metadata, closes cleanly on
  consumer cancellation, and errors the returned stream when the byte limit is
  exceeded.
- Closed the upstream response on size-limit failure without passing the
  size-limit error into `response.destroy(error)`, avoiding a duplicate
  unhandled Node stream error after the Web stream already receives the
  intended failure.
## Verification

- Failure-first check: the streamed `maxBytes` regression timed out against the
  old direct stream conversion, proving streamed responses were not capped.
- `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts -t "errors streamed responses"`
- `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts -t "returns streamed responses"`
- `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/ai.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/utils/remote-http.test.ts src/services/webdav.server.test.ts src/routes/ai.test.ts src/routes/media.test.ts src/services/skill.service.test.ts`
- `pnpm --filter @prompthub/web typecheck`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this shared Web remote HTTP stream boundary. Stable behavior docs are left for
  a dedicated documentation batch because `spec/knowledge/behavior/web.md`
  currently contains unrelated pending edits.
