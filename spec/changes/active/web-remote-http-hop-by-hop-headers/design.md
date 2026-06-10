# Design

## Overview

Add a shared request-header denylist to `normalizeHeaders()` in
`apps/web/src/utils/remote-http.ts`. All current Web callers use
`requestRemoteBuffered()` or `requestRemoteStream()`, so the boundary applies to
AI proxying, WebDAV, remote media downloads, and remote Skill fetches without
duplicating per-route logic.

## Affected Areas

- Data model:
  - No data model impact.
- API / contracts:
  - Web remote HTTP helpers no longer forward caller-supplied hop-by-hop request
    headers.
- Filesystem / sync:
  - No filesystem layout change. WebDAV requests continue to preserve
    end-to-end authentication and metadata headers.
- UI / UX:
  - No UI change.

## Header Policy

Blocked request headers:

- `connection`
- `content-length`
- `host`
- `keep-alive`
- `proxy-authenticate`
- `proxy-authorization`
- `te`
- `trailer`
- `transfer-encoding`
- `upgrade`

The helper still sets the correct `Host` header from the parsed upstream URL.
