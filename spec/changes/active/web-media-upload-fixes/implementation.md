# Implementation

## Summary

Fixed self-hosted web media upload regressions by adding a browser-safe UUID fallback for pasted images and clarifying the user-facing error when LAN/internal image URLs are rejected by SSRF protection.

## Delivered Changes

- Added a safe browser-side file ID fallback in the self-hosted web desktop bridge so pasted image uploads no longer depend on `crypto.randomUUID()`.
- Made the hidden file input trigger more browser-compatible for web runtime upload buttons.
- Updated prompt media URL upload handling to show a specific message when self-hosted web blocks LAN/internal image URLs.
- Added regression tests for the web bridge UUID fallback, blocked internal-network downloads, and the prompt media manager's dedicated LAN/internal URL error toast.

## Verification

- Commands run:
- `pnpm --filter @prompthub/web test -- --run src/routes/media.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/client/desktop/install-bridge.test.ts src/routes/media.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/hooks/use-prompt-media-manager.test.ts`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/web lint`
- Tests passed:
- `src/client/desktop/install-bridge.test.ts`
- `src/routes/media.test.ts`
- `tests/unit/hooks/use-prompt-media-manager.test.ts`
- Build / lint status:
- Desktop lint passed
- Web lint passed
