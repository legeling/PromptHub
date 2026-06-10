# Implementation

## Shipped

- Prompt edit payloads now preserve intentionally blank optional fields so existing system prompts, English variants, description, source, and notes can be cleared.
- Renderer-to-main prompt update mapping now preserves empty strings instead of converting them back to `undefined`.
- Generic prompt copy now copies the active-language user prompt only, without `[System]` / `[User]` labels.
- Detail modal user/system copy now respects the current language toggle and no longer triggers a second parent copy that overwrites the clipboard.
- Prompt copy variable filling ignores system-prompt variables for copy mode and outputs only the filled user prompt.
- Prompt create/edit reference media sections now accept dropped image/video files and save them via existing base64 media APIs.
- Top-bar search controls now sit above the input and use button types, so the clear X can receive clicks.
- Legacy `PromptEditor` media URL downloads now clear their timeout and ignore async completion/failure after unmount, preventing stale image appends, loading updates, or completion toasts after the editor closes.
- Legacy `PromptEditor` pasted-image handling now stops before invoking image-buffer save IPC when the editor unmounts while file reading is still pending.
- Legacy `PromptEditor` icon-only reference-image and tag removal buttons now expose localized accessible names and use explicit `type="button"` semantics.
- Legacy `PromptEditor` tag input, URL input, user prompt textarea, and edit/preview mode buttons now expose programmatic labels and pressed state that match the visible controls.
- Legacy `PromptEditor` save payloads now preserve intentionally cleared description and system prompt values as empty strings instead of converting them back to `undefined`.
- Legacy `PromptEditor` variable extraction and preview replacement now support `{{name:defaultValue}}` placeholders, matching the variable format already documented in newer prompt modal surfaces.
- `PromptDetailModal` edit handoff now calls the edit callback immediately after closing instead of leaving a delayed 200 ms callback behind after the detail modal unmounts.
- `PromptDetailModal` variable summaries and shared JSON payloads now normalize `{{name:defaultValue}}` placeholders to `name`, avoiding duplicate or default-suffixed variable entries.
- `PromptDetailModal` fullscreen, share JSON, edit, copy prompt, and copy response controls now expose explicit button semantics, icon-only action labels, and hidden decorative icons.
- `PromptDetailModal` user-prompt copy now delegates back to the parent copy workflow when available, preserving variable filling, usage counting, and global copy feedback while still falling back to local clipboard writes when rendered standalone.
- Added `prompt.shareJSON` translations across all renderer locales so the detail modal share action resolves localized labels from the prompt namespace instead of falling back to Chinese text.
- `PromptDetailModal`, `PromptKanbanView`, and `PromptTableView` now derive variable badges/summaries/counts from the shared prompt variable parser, so detail, kanban, and table surfaces use the same `{{name}}` / `{{name:defaultValue}}` semantics as copy, AI test, version history, and image reverse flows.
- `PromptListView` row action controls now expose explicit `type="button"` semantics while preserving localized action names and avoiding accidental row selection.
- `PromptTableView` icon-only row action controls now expose localized accessible names, explicit `type="button"` semantics, hidden decorative icons, and action-oriented favorite labels that match kanban card controls.
- `ColumnConfigMenu` now exposes column settings as a real menu with expanded trigger state, checkbox-menu item state for visible/hidden columns, explicit `type="button"` semantics, and hidden decorative icons.
- `PromptListHeader` sort, view-mode, gallery-size, and kanban-column controls now expose localized accessible names, expanded/selected state, explicit `type="button"` semantics, and hidden decorative icons.
- Added `prompt.sizeSmall`, `prompt.sizeMedium`, and `prompt.sizeLarge` translations across all renderer locales so gallery-size controls no longer fall back to mixed-language labels.
- `PromptGalleryView` cards now support keyboard selection with Enter/Space, and gallery favorite controls expose localized action labels, explicit `type="button"` semantics, and hidden decorative icons.
- `PromptKanbanView` pinned-section bulk actions now expose localized accessible names, explicit `type="button"` semantics, and hidden decorative icons.
- `PromptQuickRewriteTrigger` now hides its decorative sparkle icon from assistive technology while keeping the localized icon-only button label.
- Prompt variable parsing and replacement now share a single renderer helper that normalizes `{{name:defaultValue}}` to variable `name`, applies user-entered values before defaults, escapes variable names before building replacement expressions, and keeps unresolved placeholders as `{{name}}`.
- `VariableInputModal` now previews and copies default-value variables consistently, so the preview no longer shows stale `{{name:defaultValue}}` tokens after defaults or entered values are available.
- `VariableInputModal` copy feedback now waits for clipboard writes and caller callbacks to succeed before showing copied state, and failed copy paths no longer leave unhandled async rejections or false success feedback.
- `VariableInputModal` image attachment reads now use the modal session guard so pending file reads cannot append stale attachments after close, reopen, or unmount.
- `AiTestModal` now shows default-value variables as `{{name}}`, pre-fills defaults, previews the resolved prompt, and sends the resolved user/system prompt to single-model and compare test flows.
- Prompt copy variable detection now uses the shared variable parser so default-value placeholders open the same variable-filling path as plain placeholders.
- `VersionHistoryModal` now derives fallback variable snapshots from prompt text using the shared prompt variable parser, preserving normalized names and trimmed default values for `{{name:defaultValue}}` placeholders.
- `ImagePromptReverseModal` now derives saved prompt variables from reversed image prompt text using the shared prompt variable parser, preserving normalized names and trimmed default values for `{{name:defaultValue}}` placeholders.
- `ImagePromptReverseModal` prompt creation now has a pending-create guard and disabled button state, preventing duplicate prompt creation on repeated clicks.
- `ImagePromptReverseModal` async image selection, reverse generation, and prompt creation now use modal-session guards, so late completions after close/reopen or unmount cannot write stale image/draft/create state into the current modal session.
- `ImagePromptReverseModal` prompt creation now shows localized creation-failure feedback when the create request rejects.
- Added `imageReverse.createFailed` translations across all renderer locales.

## Verification

- Passed: `pnpm --dir apps/desktop exec vitest run tests/unit/components/prompt-copy-utils.test.ts tests/unit/components/prompt-modal-utils.test.ts tests/unit/components/variable-input-modal.test.tsx tests/unit/hooks/use-prompt-media-manager.test.ts tests/unit/components/top-bar.test.tsx`
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-editor.test.tsx --run` (6 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-detail-modal.test.tsx --run` (4 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-detail-modal.test.tsx --run` (5 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-editor.test.tsx tests/unit/services/renderer-i18n-hardcode-regression.test.ts --run`
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-copy-utils.test.ts tests/unit/components/prompt-modal-utils.test.ts tests/unit/components/variable-input-modal.test.tsx tests/unit/components/ai-test-workbench.test.tsx tests/unit/components/prompt-version-history-modal.test.tsx tests/unit/components/image-prompt-reverse-modal.test.tsx --run` (55 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/variable-input-modal.test.tsx --run` (8 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-version-history-modal.test.tsx --run` (5 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run` (15 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-kanban-view.test.tsx tests/unit/components/prompt-detail-modal.test.tsx --run` (8 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-detail-modal.test.tsx --run` (6 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run` (8 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run` (9 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/column-config-menu.test.tsx --run` (6 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-list-view.test.tsx --run` (3 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-list-header.test.tsx --run` (6 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-gallery-view.test.tsx --run` (8 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-kanban-view.test.tsx --run` (4 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-quick-rewrite-trigger.test.tsx --run` (1 test)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run` (18 tests)
- Passed: `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-detail-modal.test.tsx --run` (9 tests)
- Passed: `pnpm --filter @prompthub/desktop typecheck`
- Passed: `pnpm --filter @prompthub/desktop lint`
- Passed: locale JSON parse check for all renderer locale files.
- Note: an earlier full unit run was accidentally triggered and failed only on the newly added TopBar clear-button test due to an incorrect placeholder expectation; the test was corrected and the targeted suite passed.

## Synced Docs

- Active delta spec updated under `spec/changes/active/prompt-feedback-fixes/specs/prompt-management/spec.md`.
- No stable domain or architecture docs were updated because this is a scoped defect fix without a new durable contract beyond the active change record.

## Follow-ups

- Consider adding an end-to-end Windows smoke case for prompt edit clear and drag-drop media upload before the next desktop release.
