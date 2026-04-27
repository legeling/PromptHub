# Design

## Call Chain

- `Prompt media paste -> window.electron.saveImageBuffer -> web install bridge -> /api/media/images/base64`
- `Prompt media add-by-url -> window.electron.downloadImage -> /api/media/images/download -> remote-http SSRF guard`

## Technical Approach

- Replace direct `crypto.randomUUID()` usage in the self-hosted web bridge with a fallback generator already consistent with existing browser-side code.
- Keep SSRF protection unchanged for local network addresses.
- Map internal-network download failures to a specific user-facing message that explains LAN/internal image URLs are not supported in the self-hosted web fetch flow.

## Verification Plan

- Web route tests for blocked internal-network URLs
- Desktop/web runtime tests for browser-side media helpers where relevant
- Lint and targeted tests
