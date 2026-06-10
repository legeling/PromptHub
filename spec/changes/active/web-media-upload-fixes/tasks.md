# Tasks

## Implementation

- [x] 1. Add browser-safe UUID fallback for self-hosted web media save flow
- [x] 2. Improve blocked internal-network media URL error guidance
- [x] 3. Add or update tests
- [x] 4. Update implementation record
- [x] 5. Harden self-hosted web media clear against per-entry delete failures
- [x] 6. Map self-hosted web media single-file traversal requests to 400
- [x] 7. Reject self-hosted web media filenames with control characters
- [x] 8. Reject self-hosted web media filenames with explicit path separators
- [x] 9. Reject malformed self-hosted web media base64 payloads before file creation
- [x] 10. Reject oversized media base64 payloads before decoded buffer allocation
- [x] 11. Reject empty and current-directory media filenames before filesystem access
- [x] 12. Reject non-HTTPS remote media download URLs before contacting upstream hosts
- [x] 13. Reject unsupported remote media content types before file creation
- [x] 14. Reject declared oversized media base64 upload requests before JSON parsing
- [x] 15. Write uploaded and downloaded media files atomically to avoid visible partial files
- [x] 16. Open self-hosted web media previews with `noopener,noreferrer`
- [x] 17. Align video media root-route guidance with supported creation routes
- [x] 18. Reject media filenames with stream separators
- [x] 19. Hide directory entries that use allowed media extensions from media file APIs

## Verification

- [x] Run targeted tests
- [x] Run lint
- [x] Run web typecheck
