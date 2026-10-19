# Tasks

## Implementation

- [x] 1. Clarify release/update-channel design and preview release versioning policy
- [x] 2. Refactor updater provider/channel logic to remove the broken preview manifest path
- [x] 3. Add explicit downgrade filtering and preview-default inference
- [x] 4. Stabilize renderer update state so background checks do not override visible available/downloaded states
- [x] 5. Update release workflow / docs to match the chosen preview strategy
- [x] 6. Add or update regression tests
- [x] 7. Update `implementation.md`
- [x] 8. Tighten desktop update dialog layout and state-specific backup copy so long release notes and Homebrew flows do not overflow or show irrelevant install gating
- [x] `T-UPDATER-009` Replace the direct-install macOS DMG hand-off with the signed ZIP in-app updater path (`FR-UPDATER-005`, `DES-UPDATER-005`)
- [x] `T-UPDATER-010` Add `TEST-UPDATER-005` and `TEST-UPDATER-006` coverage for direct macOS installation while preserving the Homebrew boundary
- [x] `T-UPDATER-011` Remove development runtime status injection and add `TEST-UPDATER-007` for one-click single-state behavior (`FR-UPDATER-006`, `DES-UPDATER-006`)
- [x] `T-UPDATER-012` Preserve the exact preview Release body and safely render its Markdown images (`FR-UPDATER-007`, `DES-UPDATER-007`)
- [x] `T-UPDATER-013` Keep release notes visible during download and replace the constrained duplicate progress UI (`FR-UPDATER-007`, `DES-UPDATER-007`)
- [x] `T-UPDATER-014` Add explicit automatic / official / mirror source handling with cancellation and metadata refresh on replacement (`FR-UPDATER-008`, `DES-UPDATER-008`)
- [x] `T-UPDATER-015` Show transferred bytes, total bytes, speed, source controls, and manual download during transfer with regression coverage (`FR-UPDATER-008`, `DES-UPDATER-008`)
- [x] `T-UPDATER-016` Surface available/downloaded updates in the macOS menu bar Template Image and native menu (`FR-UPDATER-009`, `DES-UPDATER-009`)
- [x] Implement the selected two-column dialog, optional export, exact-version notes and stable successors on the preview channel (2026-10-19 requirements).
- [x] Select paired release-note bodies by UI language and localize the existing categories; retain raw bilingual source and Markdown safety (`FR-UPDATER-007`, `DES-UPDATER-007`).
- [x] Verify release-note language switching, all seven locales and preservation of unpaired/structured content (32 related component cases; scoped types, ESLint and production build passed).
- [x] Show download feedback before the first byte and handle IPC rejection without losing superseding transfers (`FR-UPDATER-008`, `DES-UPDATER-008`).
- [x] Verify immediate download feedback, returned failures, rejected IPC and source replacement (21 related cases; scoped types, ESLint and production build passed).
- [x] Add localized category icons and entry typography; verify isolated Electron light/dark screenshots and one long-note scroll region (2026-10-19).
- [ ] Accept the redesigned dialog in the real desktop GUI and verify a packaged beta-to-stable upgrade; local checks do not establish these results.

## Verification

- [x] Run targeted desktop tests
- [x] Run desktop lint
- [ ] Run release-related verification for updater logic
