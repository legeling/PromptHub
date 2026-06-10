# Implementation

## Shipped Changes

- Added `MAX_MEDIA_FILE_NAME_BYTES = 240` inside
  `apps/web/src/services/media-filename.ts`.
- Updated `normalizeMediaFileName` to reject names over 240 UTF-8 bytes with
  `Invalid filename: file name is too long`.
- Added `apps/web/src/services/media-filename.test.ts` coverage for the accepted
  boundary and the rejected oversized path.
- Extended `apps/web/src/routes/media.test.ts` so oversized image read names
  return `400 BAD_REQUEST` with the media filename validation message.

## Failure-First Evidence

- `pnpm --filter @prompthub/web test -- --run src/services/media-filename.test.ts`
  failed before the helper enforced the byte limit.
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts -t "path traversal reads"`
  failed before oversized route names returned `400 BAD_REQUEST`.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts src/services/media-base64.test.ts src/services/media-filename.test.ts`
  passed with 14 tests across 3 files.
- `pnpm --filter @prompthub/web typecheck` passed.
- `pnpm --filter @prompthub/web lint` passed.
- `git diff --check -- apps/web/src/routes/media.test.ts apps/web/src/services/media-filename.ts apps/web/src/services/media-filename.test.ts spec/changes/active/web-media-filename-length-boundary`
  passed.

## Stable Doc Sync

- This change records a narrow Web API boundary delta only. No stable
  architecture or behavior document needs an additional long-lived update
  beyond `spec/knowledge/behavior/web.md` already requiring active changes for
  Web API behavior deltas.

## Follow-Ups

- None.
