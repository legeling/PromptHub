# Proposal

## Why

Several Web API routes guarded body size only with `Content-Length` checks before
calling `c.req.json()`, `c.req.text()`, or `c.req.arrayBuffer()`. Chunked or
streamed requests without `Content-Length` could bypass the declared-size
precheck and force the server to read the full payload into memory before schema
validation.

## Scope

- In scope:
  - Add a shared limited request body reader for Web route JSON parsing.
  - Preserve existing route-specific limits for AI proxy, sync data import,
    import/export JSON, media base64 upload, and auth bodies.
  - Give ordinary JSON API routes a default 1 MiB request body limit.
  - Use the limited byte reader for raw ZIP import uploads.
  - Use the limited byte reader before parsing multipart import uploads.
  - Cover the streamed auth-body bypass with regression tests.
- Out of scope:
  - Changing persisted schemas, sync payload shape, or auth token behavior.

## Risks

- Clients sending unexpectedly large JSON bodies to ordinary APIs now receive
  `400 BAD_REQUEST` instead of being allowed to reach route-specific Zod field
  validation.
- Multipart import now buffers up to the import limit before calling
  `Request.formData()`, so individual multipart parts are still parsed by the
  platform after the whole request passes the route-level limit.

## Rollback Thinking

Rollback restores `parseJsonBody()` to `c.req.json()` and reverts route-specific
calls to the previous parser. No database, filesystem layout, or sync migration
is involved.
