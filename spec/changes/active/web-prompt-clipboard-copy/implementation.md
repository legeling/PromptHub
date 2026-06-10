# Implementation

## Status

Implemented.

## Notes

- Issue #169 is a self-hosted web bug. The relevant UI is desktop renderer prompt UI mounted through `apps/web/src/client/desktop/install-bridge.ts`.
- Prompt copy paths previously called `navigator.clipboard.writeText()` directly. In self-hosted web deployments, that API can be unavailable or rejected outside secure browser contexts, which made Markdown prompt copy fail before any fallback could run.

## Changes

- Added `copyTextToClipboard()` in `prompt-copy-utils`.
  - Preserves Markdown/plain text exactly.
  - Uses `navigator.clipboard.writeText()` when available.
  - Falls back to a hidden textarea plus `document.execCommand("copy")` when the Clipboard API is unavailable, rejected, or the browser reports a non-secure context.
  - Throws a concrete `Clipboard copy failed` error only after both paths fail.
- Routed prompt-related copy actions through the helper:
  - main prompt list/detail actions in `MainContent`
  - prompt detail modal system/user/AI/share copies
  - variable copy modal
  - prompt editor preview copy
  - AI test response copy
  - image reverse prompt copy

## Verification

- `pnpm --dir apps/desktop exec vitest run tests/unit/components/prompt-copy-utils.test.ts`
  - Passed: 1 file, 10 tests.
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/prompt-copy-utils.test.ts tests/unit/components/variable-input-modal.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/prompt-editor.test.tsx tests/unit/components/image-prompt-reverse-modal.test.tsx tests/unit/components/ai-test-workbench.test.tsx tests/integration/components/main-content-inline-edit.integration.test.tsx`
  - Passed: 7 files, 80 tests.
- `pnpm --dir apps/web exec vitest run src/client/desktop/install-bridge.test.ts src/client/pages/DesktopWorkspace.test.tsx`
  - Passed: 2 files, 6 tests.
- `pnpm --dir apps/desktop exec tsc --noEmit --pretty false`
  - Passed.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false`
  - Passed.
- `git diff --check`
  - Passed.
