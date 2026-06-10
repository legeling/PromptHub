# Design — UI test coverage uplift

## Overall approach

Add ~25 new test files in two waves:

### Wave 1 — UI primitives (high leverage, low context cost)

These components are reused everywhere. A regression here breaks the whole app.
Focus on lifecycle and ARIA / keyboard semantics.

| File | Component | What we test |
| ---- | --------- | ------------ |
| `modal.test.tsx` | `ui/Modal.tsx` | Open / close / Esc closes, focus trap exists, aria-modal / role=dialog, motion preference respected |
| `toast.test.tsx` | `ui/Toast.tsx` | Render with intent variants, auto-dismiss, no id collision when multiple toasts |
| `context-menu.test.tsx` | `ui/ContextMenu.tsx` | Open via right-click, keyboard up/down navigation, Esc closes, click-outside closes |
| `confirm-dialog.test.tsx` | `ui/ConfirmDialog.tsx` | Cancel callback fires on no, confirm fires on yes, Esc behaves as cancel, focus initial button |
| `close-dialog.test.tsx` | `ui/CloseDialog.tsx` | Three-way save / discard / cancel callbacks |
| `unsaved-changes-dialog.test.tsx` | `ui/UnsavedChangesDialog.tsx` | Same three-way pattern, dirty-state copy |
| `checkbox.test.tsx` | `ui/Checkbox.tsx` | Controlled vs uncontrolled, change handler, disabled state |
| `input.test.tsx` | `ui/Input.tsx` | onChange propagates trimmed value where applicable, password type toggling, aria-invalid when error prop present |
| `textarea.test.tsx` | `ui/Textarea.tsx` | onChange, autoResize behavior, no double-render on each keystroke |
| `image-preview-modal.test.tsx` | `ui/ImagePreviewModal.tsx` | Renders image, close callback fires |
| `background-image-backdrop.test.tsx` | `ui/BackgroundImageBackdrop.tsx` | Applies wallpaper opacity / blur / scale and renders image + blanket layers; no-image rendering is owned by callers |
| `collapsible-thinking.test.tsx` | `ui/CollapsibleThinking.tsx` | Expand / collapse state, default collapsed |

### Wave 2 — Domain views & modals

Higher context cost but bigger user-visible coverage. We test observable
interactions and critical edge cases.

| File | Component | What we test |
| ---- | --------- | ------------ |
| `prompt-list-view.test.tsx` | `prompt/PromptListView.tsx` | Renders rows from store snapshot, double-click opens detail, virtualized when long |
| `prompt-kanban-view.test.tsx` | `prompt/PromptKanbanView.tsx` | Renders columns by tag, drag handler attached, empty state |
| `prompt-table-view.test.tsx` | `prompt/PromptTableView.tsx` | Sort by column, sticky header, column resize cooperates |
| `prompt-list-header.test.tsx` | `prompt/PromptListHeader.tsx` | View switch, search input change, sort menu open |
| `column-config-menu.test.tsx` | `prompt/ColumnConfigMenu.tsx` | Toggle columns, persist via store callback |
| `create-prompt-modal.test.tsx` | `prompt/CreatePromptModal.tsx` | Required-field validation, variable extraction from `{{...}}` |
| `edit-prompt-modal.test.tsx` | `prompt/EditPromptModal.tsx` | Loads existing values, version-on-save toggle, dirty state warning |
| `import-prompt-modal.test.tsx` | `prompt/ImportPromptModal.tsx` | JSON paste validation, partial-parse error message |
| `prompt-detail-modal.test.tsx` | `prompt/PromptDetailModal.tsx` | Inline edit double-click, copy handler, version history button |
| `skill-store-card.test.tsx` | `skill/SkillStoreCard.tsx` | Render store entry, install / installed / update states |
| `skill-batch-tag-dialog.test.tsx` | `skill/SkillBatchTagDialog.tsx` | Add tag, remove tag, apply to N selected |
| `skill-store-detail.test.tsx` | `skill/SkillStoreDetail.tsx` | Render readme, install button state, source badge |
| `skill-quick-install.test.tsx` | `skill/SkillQuickInstall.tsx` | Platform list renders, install callback fires per platform |
| `skill-platform-panel.test.tsx` | `skill/SkillPlatformPanel.tsx` | Render installed platforms, uninstall confirmation |
| `general-settings.test.tsx` | `settings/GeneralSettings.tsx` | Auto-update toggle, launch-at-login toggle persist |
| `language-settings.test.tsx` | `settings/LanguageSettings.tsx` | Language change reloads i18n, current language highlighted |
| `shortcuts-settings.test.tsx` | `settings/ShortcutsSettings.tsx` | Capture key, conflict warning, reset-to-default |

## Test conventions

- Use `@testing-library/react` (already in deps) — render, screen, userEvent
- Wrap renders in a small helper that provides:
  - i18n init (existing `tests/setup.ts` already initializes i18next with English)
  - Theme provider (if needed)
  - QueryClient or store providers (if the component requires them)
- Each test file:
  - Has at least 1 happy-path test
  - Has at least 1 keyboard / ARIA test (for primitives)
  - Has at least 1 edge case (empty list, error state, disabled)
- No `as any`, no `@ts-ignore`, no `expect(x).toBeDefined()` alone

## Dependencies

Existing setup already mocks:
- `@tanstack/react-virtual` (in setup.ts)
- `window.api` (via preload mock)
- `i18next`

We may need to additionally mock:
- `IntersectionObserver` (for components with `useInView`)
- `ResizeObserver` (for column-resizer-aware views)
- `URL.createObjectURL` (for image preview)

These will be added to `tests/setup.ts` only if a test requires them; otherwise
we keep setup unchanged.

## Sequencing

1. Wave 1 first — independent of stores / IPC, smallest blast radius.
2. Wave 2 in domain order: prompt views → skill views → settings.
3. After each wave, run `pnpm test -- --run` and confirm 0 regressions.
4. Final `pnpm lint` to ensure no `any` / `@ts-ignore` smuggled in.

## Rollback

Tests are strictly additive. To roll back: delete the test files. Production
code is untouched.
