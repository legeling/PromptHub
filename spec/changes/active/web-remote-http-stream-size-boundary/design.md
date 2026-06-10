# Design

## Overview

Wrap the Node response stream before returning it from `requestRemoteStream()`.
The wrapper counts bytes for each chunk and errors/cancels the upstream response
when the configured byte limit is exceeded.

## Affected Areas

- `apps/web/src/utils/remote-http.ts`
- `apps/web/src/utils/remote-http.test.ts`
- `spec/knowledge/behavior/web.md`

## Key Decisions

- Reuse `options.maxBytes ?? DEFAULT_MAX_BYTES` for stream responses so the
  buffered and streamed helpers share the same default cap.
- Surface the same error message used by buffered responses:
  `Remote response exceeds size limit`.
- Destroy the upstream Node response when the returned Web stream is canceled or
  exceeds the limit.
- For size-limit failures, close the upstream response without passing the
  size-limit error back into `response.destroy(error)`; the Web stream already
  surfaces that error, and re-emitting it on the Node response can create an
  unhandled stream error in tests and callers.

## Tradeoffs

- Size enforcement happens when the consumer reads the returned stream, not at
  `requestRemoteStream()` call time.
- This limits byte volume, not stream duration; request timeout remains the
  existing timeout boundary for initial response setup.
