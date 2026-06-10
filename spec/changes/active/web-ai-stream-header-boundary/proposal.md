# Proposal

## Why

`POST /api/ai/stream` proxies streaming provider responses to the browser. It
already removed `content-length` and `connection`, but still passed through
other hop-by-hop headers and `set-cookie`. A malicious or misconfigured upstream
could set cookies on the PromptHub origin through the streaming response.

## Scope

- In scope:
  - Strip `set-cookie` and standard hop-by-hop response headers from AI stream
    responses.
  - Reject non-HTTPS AI proxy upstream URLs before contacting remote transports.
  - Keep safe provider headers, such as content type and custom metadata.
  - Add route regressions proving upstream cookies are not forwarded and
    non-HTTPS upstream URLs are rejected.
- Out of scope:
  - Changing buffered AI transport response payloads.
  - Changing desktop AI transport.

## Risks

- Upstream headers such as `transfer-encoding` or `set-cookie` are no longer
  observable on the browser response. These headers should not be part of the
  application-level AI stream contract.
- Existing HTTP-only AI provider endpoints are no longer accepted by the Web AI
  proxy. This matches the shared remote-fetch security posture used by WebDAV,
  media downloads, and remote Skill fetches.

## Rollback Thinking

Rollback is limited to removing the stream response header denylist, HTTPS URL
validation, and the regression assertions. No data migration is introduced.
