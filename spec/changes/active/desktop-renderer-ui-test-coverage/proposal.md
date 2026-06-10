# Renderer UI test coverage uplift

## Why

`apps/desktop/src/renderer/components/` currently has 113 `.tsx` source files;
`apps/desktop/tests/unit/components/` has 40 corresponding `.test.tsx` files.
That maps roughly to ~35% file-level coverage and an estimated ~40% line
coverage on the renderer per AGENTS.md target (40%+ minimum, lower priority but
still required).

Several primitives in `src/renderer/components/ui/` have **zero tests**:

- `Modal.tsx`, `Toast.tsx`, `ContextMenu.tsx`, `ConfirmDialog.tsx`,
  `CloseDialog.tsx`, `UnsavedChangesDialog.tsx`, `Checkbox.tsx`, `Input.tsx`,
  `Textarea.tsx`, `ImagePreviewModal.tsx`

Several recently-touched prompt / skill / settings views are equally untested:

- `PromptListView.tsx`, `PromptKanbanView.tsx`, `SkillStoreCard.tsx`,
  `SkillBatchTagDialog.tsx`,
  `EditPromptModal.tsx`, `CreatePromptModal.tsx`, `ImportPromptModal.tsx`,
  `LanguageSettings.tsx`, `GeneralSettings.tsx`, `ShortcutsSettings.tsx`

This is the gap where the **most user-visible regressions** surface. We want to
move file-level coverage from ~35% → ~55% by adding focused behavior tests on
the highest-traffic components.

## Scope

In scope:

- New unit tests for the UI primitives listed above, focused on:
  - Open / close lifecycle
  - Keyboard semantics (Esc, Enter, Tab focus trap for modals)
  - Aria roles and accessible-name basics
  - Reduced-motion respect (where it changes behavior)
- New unit tests for the prompt / skill / settings views above, focused on:
  - Render with realistic props
  - Critical interactions (sort, filter, double-click inline edit, drag toggle)
  - Edge cases that have shipped as bugs in the past 3 release cycles
- Tests target **observable behavior** (DOM output, callbacks fired,
  stores updated) — not implementation internals (no spying on internal hooks,
  no snapshot tests for dynamic content).

Out of scope:

- Visual regression testing (no Chromatic / Percy).
- Heavy DOM painting / layout assertions; jsdom is enough for what we're after.
- E2E coverage uplift — handled separately under
  `spec/changes/active/desktop-unit-regression-hardening/` if needed.
- Renaming or restructuring components.

## Risks & rollback

- Tests depend on jsdom's quirks for things like `scrollIntoView`,
  `IntersectionObserver`, `ResizeObserver`. We add minimal stubs in
  `tests/setup.ts` only when truly required; otherwise tests use existing mocks.
- Adding tests is purely additive — no production code changes are required to
  enable the test pass. If a test is brittle, deleting the file is a safe
  rollback.
- We will not introduce new dev dependencies for assertion libraries; vitest +
  @testing-library/react already present is sufficient.

## Success criteria

- File-level coverage in `tests/unit/components/` goes from 40 / 113 ≈ 35% to
  ≥ 65 / 113 ≈ 57%.
- `pnpm test -- --run` continues to pass with 0 failures.
- Each new test file follows AGENTS.md §7 patterns (no
  `expect(x).toBeDefined()` alone, no `toMatchSnapshot()` for dynamic data, no
  fake mock-returns-expected-value tautologies).
