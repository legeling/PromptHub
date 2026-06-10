# Implementation

## Summary

Fixed self-hosted web media upload regressions by adding a browser-safe UUID fallback for pasted images and clarifying the user-facing error when LAN/internal image URLs are rejected by SSRF protection.

## Delivered Changes

- Added a safe browser-side file ID fallback in the self-hosted web desktop bridge so pasted image uploads no longer depend on `crypto.randomUUID()`.
- Made the hidden file input trigger more browser-compatible for web runtime upload buttons.
- Updated prompt media URL upload handling to show a specific message when self-hosted web blocks LAN/internal image URLs.
- Added regression tests for the web bridge UUID fallback, blocked internal-network downloads, and the prompt media manager's dedicated LAN/internal URL error toast.
- Fixed web CI type errors by avoiding a direct typed `window.electron` access inside the bridge regression test and by adding an explicit `ipaddr.js` IPv6 type guard before calling IPv6-only helpers.

## Verification

- Commands run:
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts src/routes/media.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/hooks/use-prompt-media-manager.test.ts`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/web lint`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts src/routes/media.test.ts src/routes/settings.test.ts`
- Tests passed:
- `src/client/desktop/install-bridge.test.ts`
- `src/routes/media.test.ts`
- `tests/unit/hooks/use-prompt-media-manager.test.ts`
- Build / lint status:
- Desktop lint passed
- Web lint passed
- Web typecheck passed

## Media Clear Partial-Failure Follow-Up

- Found that `DELETE /api/media/images?confirm=true` and the matching videos
  route used an all-or-nothing delete batch. If an allowed-extension entry was
  a directory or otherwise failed during `rm`, the whole clear request returned
  `500` even though other media files could be removed.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
  failed first after adding a regression with `safe.png` plus a `nested.png`
  directory because the clear route returned `500`.
- `apps/web/src/routes/media.ts` now deletes media entries one by one, logs and
  skips per-entry failures, and returns the number of entries actually deleted.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 6 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.
  - `git diff --check` for the touched web media route, test, and active
    change docs: clean.

## Media Single-File Validation Follow-Up

- Found that single-file media routes handled path traversal uploads as `400`,
  but traversal reads/deletes such as `/api/media/images/..%2Fescape.png`,
  `/exists`, `/size`, `/base64`, and `DELETE` let the filename validation error
  escape to the global error handler as `500`.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
  failed first after adding GET / exists / size / base64 / DELETE traversal
  coverage because the first invalid GET returned `500`.
- `apps/web/src/routes/media.ts` now maps invalid media filename errors from
  single-file read, exists, size, base64, and delete routes to
  `400 BAD_REQUEST` while leaving unexpected filesystem errors to propagate.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 7 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.
  - `git diff --check` for the touched web media route, test, and active
    change docs: clean.

## Media Filename Control-Character Follow-Up

- Found that web media filename normalization rejected traversal but not null
  bytes or other control characters. Uploading `bad\0name.png` could still
  succeed because the original name was only used for extension inference, while
  single-file reads with `%00` reached Node's filesystem layer and returned
  `500`.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
  failed first after adding null-byte upload/read/delete coverage because the
  upload returned `201` and the first null-byte read returned `500`.
- `apps/web/src/routes/media.ts` now rejects ASCII control characters in media
  filenames during normalization, producing `400 BAD_REQUEST` before any
  filesystem call.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 7 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.
  - `git diff --check` for the touched web media route, test, and active
    change docs: clean.

## Media Filename Separator Follow-Up

- Found that web media filename normalization relied on POSIX `path.basename`,
  which does not treat backslash as a separator. A self-hosted deployment on
  Windows would interpret `folder\escape.png` differently than POSIX, and POSIX
  deployments returned `404` for encoded backslash read/delete requests instead
  of rejecting the unsafe filename.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
  failed first after adding backslash upload/read/delete coverage because the
  upload returned `201` and the first encoded backslash read returned `404`.
- `apps/web/src/routes/media.ts` now rejects explicit `/` and `\` separators in
  media filenames with `400 BAD_REQUEST`, while preserving the existing
  traversal-specific error for `..` inputs.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 7 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.
  - `git diff --check` for the touched web media route, test, and active
    change docs: clean.

## Media Base64 Payload Follow-Up

- Found that web media upload used `Buffer.from(value, 'base64')` directly.
  Node accepts some malformed base64 strings without throwing, so invalid
  upload payloads could return `201` and create corrupt media files.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
  failed first after adding invalid base64 upload coverage because the upload
  returned `201`.
- `apps/web/src/services/media-base64.ts` now provides strict base64 payload
  decoding with the existing 20 MiB size limit, and `apps/web/src/routes/media.ts`
  uses it before writing uploaded files.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 8 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.

## Media Base64 Size Precheck Follow-Up

- Found that strict media base64 decoding still allocated the decoded Buffer
  before checking the 20 MiB size limit, so oversized payloads could create an
  avoidable memory spike.
- `pnpm --filter @prompthub/web test -- --run src/services/media-base64.test.ts`:
  failed first after adding a regression that spies on `Buffer.from` for an
  oversized payload.
- `apps/web/src/services/media-base64.ts` now computes decoded byte length from
  the base64 payload and padding before allocation, rejecting obvious oversized
  payloads without calling `Buffer.from`.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/services/media-base64.test.ts`:
    **1 file / 2 tests**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 8 tests**, passing.

## Media Empty Filename Follow-Up

- Found that shared web media filename validation rejected traversal,
  separators, and control characters, but still accepted empty strings and `.`
  current-directory placeholders. Sync media writes and route reads could then
  reach the filesystem with the media directory itself as the target path,
  producing low-level directory errors instead of a clear request validation
  failure.
- `pnpm --filter @prompthub/web test -- --run src/services/sync-media.test.ts`:
  failed first after adding empty-string and `.` filename coverage because the
  empty filename did not throw.
- `apps/web/src/services/media-filename.ts` now rejects empty filenames and `.`
  with `file name is required` before path joining or filesystem access.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/services/sync-media.test.ts`:
    **1 file / 4 tests**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 8 tests**, passing.

## Media Directory Entry Follow-Up

- Found that the web media list route filtered only by extension, so a directory
  named `nested.png` appeared as an image. Single-file routes then reported it
  inconsistently: `/exists` could return true, `/size` could expose directory
  metadata, and read/delete could fall through to low-level filesystem errors.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "directory entries"`:
  failed first because `GET /api/media/images` returned both `nested.png` and
  `safe.png`.
- `apps/web/src/routes/media.ts` now lists only regular files and treats
  non-file entries as missing for read, exists, size, and delete operations.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "directory entries"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/media.ts apps/web/src/routes/media.test.ts spec/changes/active/web-media-upload-fixes spec/issues/active/quality.md`

## Media Remote HTTPS Follow-Up

- Found that self-hosted web remote media download accepted `http:` URLs.
  Internal-network SSRF protection still blocked private hosts, but public
  media downloads could use cleartext HTTP even though the app already requires
  HTTPS for WebDAV sync endpoints.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "non-HTTPS remote media"`:
  failed first because the route still contacted the mocked upstream for an
  `http://example.com/demo.png` URL.
- `apps/web/src/routes/media.ts` now rejects non-HTTPS remote media download
  URLs before calling the remote HTTP helper and also passes `allowedProtocols:
  ['https:']` to the transport layer.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 9 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.

## Media Remote Content-Type Follow-Up

- Found that remote media downloads fell back to `.png` or `.mp4` when the URL
  path had no allowed media extension and the upstream `Content-Type` was not a
  supported image or video MIME type. A `text/html` response could therefore be
  saved as media.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "unsupported content types"`:
  failed first because the route returned `201` and created a generated media
  file for an HTML response.
- `apps/web/src/routes/media.ts` now keeps the permissive extension fallback for
  local base64 uploads, but remote downloads must have either an allowed final
  URL extension or a supported upstream media `Content-Type`; otherwise the
  route returns `400 BAD_REQUEST` before writing a file.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "unsupported content types"`:
    **1 file / 1 test**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 10 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.

## Media Base64 Request Size Follow-Up

- Found that `/api/media/images/base64` and `/api/media/videos/base64` decoded
  base64 payloads safely after JSON parsing, but an oversized JSON request body
  with a declared `Content-Length` still reached `c.req.json()` first.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "declared oversized base64"`:
  failed first because the route returned `Invalid JSON request body` instead
  of rejecting the declared oversized request before parsing.
- `apps/web/src/routes/media.ts` now checks `Content-Length` before parsing
  media base64 upload JSON. Declared bodies larger than the 20 MiB media limit
  plus JSON envelope allowance return `400 BAD_REQUEST` with
  `Media upload request body exceeds size limit`.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "declared oversized base64"`:
    **1 file / 1 test**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 11 tests**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/services/media-base64.test.ts src/services/media-filename.test.ts`:
    **2 files / 4 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.
  - `git diff --check -- apps/web/src/routes/media.ts apps/web/src/routes/media.test.ts spec/changes/active/web-media-upload-fixes`:
    clean.

## Media Atomic Write Follow-Up

- Found that media upload and remote download wrote directly to the generated
  final media filename. If `writeFile` failed after truncating or partially
  writing the target, the failed request could leave a random `.png` / video
  file visible in list/read APIs.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "partial media files"`:
  failed first because the interrupted upload returned `400` but `GET
  /api/media/images` still listed a generated `.png` partial file.
- Added `apps/web/src/services/atomic-file.ts` and switched local base64 uploads
  and remote media downloads to same-directory temporary writes followed by
  rename.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "partial media files"`:
    **1 file / 1 test**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 12 tests**, passing.
  - `pnpm --filter @prompthub/web typecheck`: passing.
  - `pnpm --filter @prompthub/web lint`: passing.

## Media Preview Noopener Follow-Up

- Found that the self-hosted web desktop bridge opened image and video media
  previews with `window.open(url, '_blank')` without `noopener,noreferrer`.
  The target is an internal media route, but the bridge should match the
  app-wide external-window safety convention and avoid exposing `window.opener`.
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts -t "media previews"`:
  failed first because `openImage()` and `openVideo()` called `window.open`
  without the features argument.
- `apps/web/src/client/desktop/install-bridge.ts` now passes
  `noopener,noreferrer` for image and video preview tabs while preserving
  filename URL encoding.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts -t "media previews"`:
    **1 file / 1 test**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts`:
    **1 file / 6 tests**, passing.

## Media Video Route Guidance Follow-Up

- Found that `registerMediaRoutes('videos')` exposes
  `/api/media/videos/download`, but the root `POST /api/media/videos` rejection
  only pointed callers to `/api/media/videos/base64`.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "video upload callers"`:
  failed first because the route returned `Use /api/media/videos/base64`.
- `apps/web/src/routes/media.ts` now points callers to both supported video
  media creation routes: `/api/media/videos/base64` and
  `/api/media/videos/download`.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "video upload callers"`:
    **1 file / 1 test**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 13 tests**, passing.

## Media Filename Stream Separator Follow-Up

- Found that shared web media filename normalization rejected traversal,
  explicit path separators, control characters, empty names, and overlong names,
  but still accepted `:`. On Windows/NTFS this character can carry alternate
  stream semantics, so web media should reject it at the same normalization
  boundary before any route or sync filesystem operation.
- `pnpm --filter @prompthub/web test -- --run src/services/media-filename.test.ts`:
  failed first after adding `avatar:stream.png` coverage because the filename
  did not throw.
- `apps/web/src/services/media-filename.ts` now rejects `:` with
  `stream separator detected`.
- Verification:
  - `pnpm --filter @prompthub/web test -- --run src/services/media-filename.test.ts`:
    **1 file / 3 tests**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/services/sync-media.test.ts`:
    **1 file / 5 tests**, passing.
  - `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`:
    **1 file / 13 tests**, passing.
