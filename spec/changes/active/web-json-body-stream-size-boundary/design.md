# Design

## Boundary

The Web app owns HTTP request parsing under `apps/web/src/utils/validation.ts`
and route-specific size policies under `apps/web/src/routes/*`.

## Approach

- Add `readRequestBytesBody()` to consume `Request.body` through a reader while
  tracking bytes.
- Add `readRequestTextBody()` and make `parseJsonBody()` parse JSON from that
  limited text instead of calling `c.req.json()`.
- Keep existing `Content-Length` fast-fail behavior, but do not rely on it for
  enforcement.
- Pass explicit limits and messages for routes with larger legitimate payloads:
  auth 1 MiB, AI proxy 10 MiB, sync/import 50 MiB, media upload
  `MAX_MEDIA_BYTES + 1 MiB`.
- For multipart import, read the raw request body through the same import limit
  first, then construct a temporary `Request` with the buffered bytes and call
  `formData()` on that bounded request.
- Leave ordinary JSON routes on the shared default 1 MiB limit, which is above
  their current field-level maximums.

## Compatibility

Existing valid payloads remain accepted. Oversized streamed payloads that
previously reached parsing are now rejected with `400 BAD_REQUEST`.

## Verification

The lowest effective verification is Web route tests around auth, AI, media,
sync, and import/export plus Web typecheck/lint.
