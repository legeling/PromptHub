# Proposal

## Why

Web remote HTTP callers can pass user-controlled headers to upstream providers,
WebDAV endpoints, remote media URLs, and remote Skill URLs. The shared
`remote-http` helper already removed `Host` and `Content-Length`, but still
forwarded other hop-by-hop request headers that should be controlled by the HTTP
transport layer.

## Scope

- In scope:
  - Strip standard hop-by-hop request headers in `apps/web/src/utils/remote-http.ts`.
  - Preserve caller-supplied end-to-end headers such as `Accept`,
    `Authorization`, and custom metadata headers.
  - Add a focused regression test at the shared helper boundary.
- Out of scope:
  - Changing response header filtering in individual routes.
  - Changing redirect, DNS, protocol, or body replay policy.
  - Changing desktop or Cloudflare remote HTTP behavior.

## Risks

Some upstream endpoint could have depended on a caller-supplied connection-level
header. That is not part of the Web API contract and should remain under the
Node HTTP client transport.

## Rollback Thinking

Rollback is limited to removing the request-header denylist and the regression
test. No data or migration path is involved.
