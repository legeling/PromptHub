# Implementation log

## Verification acceptance hardening follow-up

- The shared desktop test setup now installs an in-memory `localStorage`
  implementation before tests run. This keeps Zustand persisted stores from
  failing under the current Node/Vitest environment when tests exercise
  `setItem`, `getItem`, or `clear`.
- The same setup file now provides `Element.prototype.scrollTo` in jsdom, so
  virtualized prompt-list integration tests can exercise scroll-dependent UI
  code without crashing in the test environment.
- A Plugin clipboard reuse audit found two direct `navigator.clipboard.writeText`
  call sites in Plugin surfaces. `PluginManager` and `PluginFullDetailPage` now
  route local path / Codex link copying through the shared
  `copyTextToClipboard()` utility.
- `plugin-manager.test.tsx` now verifies that opening an installed Plugin detail
  page can copy the local Plugin package path through the mocked shared
  clipboard path.
- Verification:
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - Targeted desktop regression suite covering prompt filtering, large prompt
    list integration, prompt relationships, Skill store update/source/status,
    Plugin manager, MCP manager, Plugin/MCP stores, and network settings:
    **16 files / 210 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/plugin-manager.test.tsx -t "opens installed plugins as a full detail page"`:
    **1 focused test**, passing.
  - Clipboard static scan now leaves direct clipboard writes only in the shared
    desktop clipboard helper.

## Wave 1 — UI primitives (12 / 12 planned)

Shipped:

- `tests/unit/components/modal.test.tsx` — 12 tests
- `tests/unit/components/confirm-dialog.test.tsx` — 10 tests
- `tests/unit/components/checkbox.test.tsx` — 7 tests
- `tests/unit/components/select.test.tsx` — 4 tests
- `tests/unit/components/input.test.tsx` — 5 tests
- `tests/unit/components/textarea.test.tsx` — 7 tests (component + handleMarkdownListKeyDown helper)
- `tests/unit/components/unsaved-changes-dialog.test.tsx` — 6 tests
- `tests/unit/components/close-dialog.test.tsx` — 5 tests
- `tests/unit/components/context-menu.test.tsx` — 10 tests
- `tests/unit/components/image-preview-modal.test.tsx` — 7 tests
- `tests/unit/components/background-image-backdrop.test.tsx` — 3 tests
- `tests/unit/components/collapsible-thinking.test.tsx` — 6 tests
- `tests/unit/components/toast.test.tsx` — 6 tests
- `tests/unit/components/password-input.test.tsx` — 1 test

Notes during execution:

- The bundled jsdom environment does not return DOM nodes from
  `screen.getByRole("combobox")` for our custom `Select`. Wave 2 settings tests
  switched to `userEvent.click` on the trigger button + `findByText` on
  portal-rendered options, mirroring the pattern in the existing `select.test.tsx`.
  A later follow-up gave the shared `Select` explicit `aria-haspopup`,
  `aria-expanded`, `aria-controls`, `listbox`, and `option` semantics, so
  settings tests now locate triggers by setting label and choices by option
  role instead of relying on the currently displayed value.
- `textarea.test.tsx` originally miscounted insertion lengths in the
  Markdown-list helper assertions; corrected to match the actual implementation
  (`"\n- "` is 3 chars, `"\n3. "` is 4 chars, `"\n- [ ] "` is 7 chars).
- `Input.test.tsx` initial draft used a controlled `value=""` with manual
  `fireEvent.change`, which doesn't update the DOM value. Switched to
  `defaultValue=""` so the change handler reflects the user-entered string.
- `Input` and `Textarea` follow-up hardening now verifies that visible labels
  are associated with their form controls, and that error messages are exposed
  through accessible descriptions with `aria-invalid`. Both components now
  preserve caller-provided `id`, `aria-describedby`, and `aria-invalid` values
  while adding generated ids only when needed.
- `Checkbox` follow-up hardening now supports `ariaLabel` for icon-only or
  decoration-only checkbox surfaces that do not render visible label text. The
  selective export scope checkboxes in `DataSettings` now pass the row label to
  the hidden input so assistive technology does not encounter unnamed
  checkboxes.
- `BackgroundImageBackdrop` coverage was reconciled with the current ownership
  boundary: callers decide whether a background image exists, while the shared
  component owns the rendered wallpaper image layer, opacity / blur / edge-scale
  styling, and blanket overlay.
- `CollapsibleThinking` follow-up hardening now exposes standard disclosure
  semantics through `aria-expanded`, `aria-controls`, and panel `aria-hidden`.
  The trigger is explicitly `type="button"` to avoid accidental form
  submission when embedded in form surfaces, and the test now renders with the
  project i18n helper instead of relying on the fallback warning path. A later
  pass hides the chevron, brain, and loading icons from assistive technology
  and replaces the hand-written loading ring with the shared `Spinner`.
- `ConfirmDialog` follow-up hardening now verifies that closed dialogs do not
  attach global key handlers, delayed cancel-button focus timers are cleared on
  unmount, and loading dialogs cannot be confirmed or canceled through Enter /
  Escape while their buttons are disabled. A later accessibility pass gives the
  cancel / confirm controls explicit button semantics and hides destructive /
  loading icons from assistive technology.
- `Modal` follow-up hardening now verifies that the nested entrance-animation
  `requestAnimationFrame` is canceled on unmount, preventing delayed animation
  callbacks from updating state after the modal is gone, and that scroll-lock
  cleanup restores the previous body overflow value instead of clearing it. The
  icon-only close button now also has an accessible name, so assistive
  technology and role-based tests can identify the control. A later follow-up
  added explicit `type="button"` semantics, hid the decorative X icon from
  assistive technology, and moved the modal unit test onto the real i18n test
  helper so close-button labels are verified without fallback warnings.
- `UnsavedChangesDialog` follow-up hardening now verifies that closed dialogs
  do not attach global key handlers and delayed save-button focus timers are
  cleared on unmount. A later accessibility pass gives the cancel / discard /
  save controls explicit button semantics, hides the warning icon from
  assistive technology, and updates tests to locate actions by localized names
  instead of DOM order.
- `ImagePreviewModal` follow-up hardening now verifies that the modal only
  locks scroll and attaches Escape handlers when an image is actually visible,
  and restores the previous body overflow value on close. A later accessibility
  pass gives the icon-only close control an explicit localized name and button
  type, hides the close / placeholder icons from assistive technology, and runs
  the unit test through the project i18n helper.
- `CloseDialog` follow-up hardening now verifies that a closed dialog does not
  mutate `document.body.style.overflow`, and that an opened dialog restores the
  previous overflow value when closed. A later accessibility pass gives the
  close / minimize / exit controls explicit button semantics, locates actions
  by localized accessible names in tests, and hides decorative action icons from
  assistive technology.
- `Select` follow-up hardening now verifies that closed selects do not attach
  outside-click document listeners, and that the listener is only active while
  the dropdown is open. A later accessibility pass also hides the trigger
  chevron and selected-option checkmark icons from assistive technology, keeping
  state exposed through `aria-expanded` and `aria-selected` instead of duplicate
  decorative icon content.
- `ToastProvider` follow-up hardening now verifies that system notification
  titles use the active locale instead of hardcoded English labels, and that
  icon-only toast close buttons expose an explicit accessible name. The
  `common.warning` / `common.info` labels were added to all renderer locales so
  warning and info notification titles do not fall back to raw keys. A later
  accessibility pass gives toast close controls explicit button semantics and
  hides status / close icons from assistive technology.
- `PasswordInput` follow-up hardening now verifies that the icon-only password
  visibility toggle exposes localized `Show password` / `Hide password`
  accessible names, reflects the visible state through `aria-pressed`, and keeps
  decorative eye icons hidden from assistive technology.
  The shared component now also accepts an `ariaLabel` for the password input
  itself, and all current settings-page `PasswordInput` callers pass a
  field-level label so API keys, master passwords, WebDAV/S3 secrets, and web
  login passwords no longer rely on placeholder text as their accessible name.
- `Button` follow-up hardening now defaults the shared button component to
  `type="button"` so embedding it in forms does not accidentally submit, while
  preserving explicit `type="submit"` behavior for real submit actions.
- `ContextMenu` follow-up hardening now verifies that context menus close on
  Escape in addition to outside mousedown and window resize, restoring expected
  keyboard dismissal behavior. A later accessibility pass gives top-level and
  submenu item controls explicit button semantics and hides submenu / inset
  indicator icons plus caller-provided custom menu icons from assistive
  technology.
- `PromptListHeader` and `ColumnConfigMenu` follow-up hardening now verify that
  their portal dropdown outside-click listeners are only registered while the
  relevant menu is open.
- `ResizableHeader` follow-up hardening now verifies that table column resize
  drags restore any previous body cursor / selection styles, and remove document
  drag listeners if the header unmounts mid-drag.
- `TopBar` follow-up hardening now verifies that the create-menu outside-click
  listener is only registered while the menu is open, while the custom
  `open-create-skill-modal` event listener remains available while closed.
- `VariableInputModal` follow-up hardening now verifies that the copied-state
  reset timer is cleared when the modal unmounts after copying, preventing
  delayed state updates after close. A later action-semantics pass gives
  AI-test output format controls explicit non-submit semantics and
  `aria-pressed` state, names the image remove control, and hides button
  icons from assistive technology.
- `PromptDetailModal` follow-up hardening now verifies that copy/share feedback
  timers are cleared when the detail modal unmounts after copying or sharing,
  preventing delayed state updates after close.
- `QuickAddModal` follow-up hardening now verifies that the delayed textarea
  focus timer is cleared when the modal unmounts before the focus callback
  runs. AI-generate mode now also uses a modal-session guard, so a draft
  request started before close can no longer create a stale prompt or show stale
  failure feedback after the modal closes and reopens. A later action-semantics
  pass gives header close, footer cancel, and create controls explicit
  non-submit semantics, hides decorative action icons from assistive technology,
  and verifies rendered quick-add actions inside an outer form.
- `ImportPromptModal` follow-up hardening now verifies that an import request
  started before close cannot call the stale close handler after the import
  modal is closed and reopened for different clipboard data. A later
  action-semantics pass gives import/cancel controls explicit non-submit
  semantics and hides decorative import/detected-prompt icons from assistive
  technology.
- `PromptTableView` follow-up hardening now verifies that row-level copy
  feedback timers are cleared when the table unmounts after copying, and that a
  repeated copy clears the previous pending timer before scheduling a new one.
  Table selection controls now also expose checkbox semantics, localized
  accessible names, and `aria-checked`, so keyboard and assistive-technology
  users can identify both the select-all control and individual row selection.
  Pagination controls now expose a localized page-size combobox label,
  localized previous/next icon-button labels, localized page-number labels, and
  `aria-current="page"` for the active page. The table now also clamps the
  active page when the prompt list shrinks, preventing an empty stale page after
  filtering, deleting, or refreshing prompts. Selection state is now reconciled
  against the current prompt ids after refresh, so batch action state cannot
  retain ids that are no longer rendered. The select-all checkbox now reflects
  whether every prompt on the current page is selected and only toggles the
  current page's ids, avoiding false checked state when another page happens to
  have the same selected count.
- `PromptKanbanView` follow-up hardening now gives icon-only card actions
  explicit localized accessible names, marks decorative action icons as hidden,
  and exposes pinned-section disclosure state through `aria-expanded` /
  `aria-controls`. The virtualized grid width effect now skips redundant
  0-to-0 state writes in layoutless test/browser states.
- `PromptListView` follow-up hardening now exposes the row's primary selectable
  surface as a focusable button with `aria-pressed`, supports Enter and Space
  selection, gives icon-only copy/favorite actions explicit localized
  accessible names, and uses the remove-from-favorites action label for already
  favorited prompts instead of the passive Favorites nav label.
- `AiTestModal` follow-up hardening now verifies that copy-response feedback
  timers are cleared when the modal unmounts after copying, and that a pending
  clipboard write does not schedule feedback after the modal has already
  closed. Single-model AI test requests now also use a modal-session guard, so
  a response started before close can no longer overwrite the reopened modal or
  save stale output for the same prompt. Multi-model comparison and image
  generation requests now use the same guard for awaited results, stream flushes,
  error feedback, and loading cleanup, preventing stale compare rows, generated
  images, or stale toasts after close/reopen.
- `SkillQuickInstall` follow-up hardening now verifies that the delayed
  auto-close timer scheduled after a successful platform install is cleared when
  the quick-install modal unmounts before the timer fires.
  A later accessibility pass gives the close / select-all / platform target /
  install controls explicit non-submit button semantics, exposes platform
  selection through `aria-pressed`, preserves Enter/click toggling for platform
  targets, and hides decorative package / close / status / install icons from
  assistive technology.
  A later duplicate-click pass adds a modal-local install in-flight guard, so
  rapid repeated Install Selected clicks cannot call the platform batch install
  path twice before the shared hook has re-rendered `isBatchInstalling`.
- `SkillStoreDetail` follow-up hardening now verifies that delayed install
  feedback timers and uninstall auto-close timers are cleared when the detail
  modal unmounts before they fire.
  A later duplicate-action pass adds store-detail-local install and uninstall
  in-flight guards, so rapid repeated Import to My Skills / Remove from My
  Skills clicks cannot call the store install or uninstall action twice before
  React has re-rendered the disabled state.
  A later update-action pass extends the same guard pattern to Check update and
  Update, preventing duplicate remote update checks or duplicate local skill
  update writes while the first async action is still pending.
  A later action-semantics pass gives the close, translate, refresh-translation,
  and safety scan controls explicit non-submit button semantics and keeps their
  decorative status/action icons hidden from assistive technology.
  A later safety-scan pass adds a detail-local in-flight promise guard, so rapid
  repeated Run Scan clicks reuse the pending scan instead of starting duplicate
  safety assessments before React has re-rendered the disabled state.
  A later footer-action pass applies the same explicit non-submit semantics and
  decorative icon treatment to import, update-check, update, overwrite, remove,
  and installed-state footer controls.
- `SkillStoreCustomSources` follow-up hardening now verifies that custom store
  source rows expose the primary source-selection action as a keyboard
  activatable non-submit button with `aria-pressed`, while enable / refresh /
  delete icon buttons remain isolated from row selection and hide decorative
  icons from assistive technology. A later duplicate-refresh pass verifies that
  a row refresh button is disabled while its source is already loading, so
  rapid repeated clicks cannot start overlapping custom-store refreshes before
  the parent loading state settles. A later header-action pass verifies the
  selected custom store header controls for batch management, refresh, and edit
  expose explicit button semantics and accessible names while keeping their
  icons decorative. A later category-filter pass verifies custom store category
  filters expose non-submit button semantics, selected state through
  `aria-pressed`, and decorative category icons hidden from assistive
  technology. A later batch-action pass verifies the custom store batch toolbar
  keeps select-visible, install, update, remove, and clear-selection controls as
  named non-submit buttons while hiding their icon-only glyphs from assistive
  technology.
- `SkillStore` remote search follow-up hardening now verifies that the built-in
  skills.sh / ClawHub store search field keeps its search and clear glyphs
  decorative while preserving debounce and immediate-submit behavior.
- `SkillStoreSourceForm` follow-up hardening now verifies that add-source type
  choices expose explicit non-submit button semantics and `aria-pressed`
  selection state, that decorative type icons are hidden from assistive
  technology, and that the Add action cannot accidentally submit a surrounding
  form. A later field-label pass gives the store name, URL / local path, branch,
  and directory inputs stable accessible names instead of relying on placeholder
  text. A later branch-loading pass clears stale branch loading immediately when
  the source type or URL changes to a non-loadable value. A later add-validation
  pass disables the Add action until required name and URL fields are filled and
  keeps the click handler guarded, matching the edit-source modal's no-op save
  prevention.
- `SkillStoreSourceEditModal` follow-up hardening now mirrors the add-source
  form semantics for edit-source type choices, exposing `aria-pressed`
  selection state while hiding decorative type and refresh icons from assistive
  technology. A later field-label pass gives the edit-modal store name, URL /
  local path, branch, and directory inputs stable accessible names as well. The
  edit modal now also clears stale branch loading immediately when the edited URL
  changes to a non-loadable value or the modal/type leaves the Git repo state.
  A later duplicate-refresh pass disables the edit-modal refresh action while
  the same source is already refreshing, preserving the spinner state without
  allowing a second refresh callback. A later save-validation pass disables the
  Save action when required name or URL fields are blank and keeps the click
  handler guarded, so the modal no longer exposes a clickable no-op save state.
- `SkillScanPreview` follow-up hardening now verifies that scan-preview header
  actions, custom-path panel controls, optional-tag disclosure, select-all, and
  import controls keep explicit non-submit button semantics. The path and tag
  disclosure buttons now expose `aria-expanded`, the close action has an
  accessible name, and decorative scan / path / search / tag / import icons are
  hidden from assistive technology. The skill result cards now avoid invalid
  nested interactive markup by rendering the primary skill-selection surface as
  its own button, while the checkbox and optional tag editing controls remain
  independent sibling controls.
- The scan-preview card regression was first tightened to fail against the old
  nested checkbox structure, then re-run after the card refactor. Verification:
  focused `skill-i18n-smoke` scan-preview action test passing, full
  `skill-i18n-smoke` file passing, desktop typecheck clean, desktop lint clean,
  and scoped `git diff --check` clean for the touched scan-preview files.
- `EditSkillModal` follow-up hardening now verifies that metadata text fields
  are reachable by their visible labels, icon-only header actions expose
  localized names, tag chip controls identify the affected tag, and modal
  actions cannot submit an outer form. The implementation binds visible labels
  to the name / description / author / tag inputs, adds explicit non-submit
  button semantics to modal actions, hides decorative icons from assistive
  technology, and adds localized tag action labels across renderer locales.
- `SkillIconPicker` follow-up hardening now verifies that preset icon and
  background choices expose selected state through `aria-pressed`, have stable
  localized action names, and do not duplicate decorative SVG / image content
  into button names. `SkillIcon` now supports a scoped decorative rendering mode
  for picker options while preserving normal accessible icon output elsewhere.
- `SkillDetailView` follow-up hardening now verifies that copy/export feedback
  timers are cleared when the side detail view unmounts, and the implementation
  now uses functional state updates so repeated copy/export feedback keys do
  not overwrite each other through stale closures. A later action-semantics
  pass verifies header, tab, copy/edit, export, platform selection, and platform
  uninstall controls cannot submit an outer form, keeps decorative icons hidden
  from assistive technology, gives the icon-only close action an accessible
  name, and replaces platform card `div onClick` selection with a real sibling
  button so uninstall remains a separate action.
- `SkillFullDetailPage` follow-up hardening now verifies that copy/export
  feedback timers are cleared when the full detail page unmounts or switches
  skills. The implementation now uses keyed timer refs and functional
  `copyStatus` updates so overlapping copy/export feedback cannot overwrite
  unrelated status flags through stale closures.
- `MainContent` follow-up hardening now routes copied/shared feedback through
  `useTemporaryFlag`, clearing pending timers on unmount and before repeated
  triggers. The hook is covered directly, while `main-content-inline-edit`
  verifies the real copy button path clears its feedback timer when the view
  unmounts.
- `CreatePromptModal` and `EditPromptModal` follow-up hardening now clear the
  source suggestion blur-delay timer on unmount and before repeated focus/blur
  cycles. `prompt-modal-structure` covers both modal variants through the
  visible More Settings -> Source suggestion interaction. Create-prompt discard
  now resets the draft state before closing, preventing intentionally discarded
  title/content drafts from reappearing when the still-mounted modal is opened
  again.
- `EditPromptModal` AI rewrite now uses a modal-session guard before applying
  async rewrite results. A rewrite request started before close can no longer
  overwrite the form or show stale success/error feedback after the modal is
  closed and reopened for the same prompt. Edit-modal translation requests now
  use the same guard for translating to English and translating from English,
  preventing late translation results from overwriting a reopened form or
  showing stale success/error feedback.
- `MainContent` generated-image downloads now use `downloadGeneratedImage`
  instead of inline object URL handling. Remote image downloads revoke object
  URLs synchronously in `finally`, including the failure path where clicking the
  generated anchor throws, removing the old delayed revoke timer.
- `SortableTree` follow-up hardening now stores delayed drag reset timers in a
  ref, clears them before repeated resets, clears them when a new drag starts,
  and clears them on unmount while also restoring the body cursor. This prevents
  drag-cancel/end callbacks from surviving after the tree unmounts or
  interfering with a fast subsequent drag.
- `ImagePromptReverseModal` follow-up hardening now centralizes pasted preview
  Blob URL cleanup in the `imageInput` effect, avoiding double revocation when a
  pasted/dragged image is replaced. The modal also clears transient image/draft
  state when `isOpen` becomes false, so hidden-but-mounted modal instances do
  not retain object URLs until a future reopen or final unmount. Image input
  selection and dropped/pasted image saves now also check mounted/open refs
  before applying async results, preventing stale previews and success toasts
  after the reverse modal closes. AI reverse success/failure results use the
  same guard, so a late vision-model response cannot repopulate a closed modal
  with a stale draft or show stale success/failure toasts.
- `usePromptMediaManager` follow-up hardening now clears the URL-download
  timeout timer in `finally` after a successful, failed, or timed-out remote
  image download. It also checks mounted/open refs before applying URL download
  success or failure results, preventing late downloads from appending images or
  showing stale failure toasts after the prompt modal closes. The same guard now
  covers system image/video selection, dropped media saves, and pasted image
  saves, so already-started async media work cannot repopulate a closed prompt
  modal with stale images, videos, or success toasts.
- `PromptQuickRewriteDialog` follow-up hardening now checks mounted/open refs
  before applying AI rewrite success or failure results. Closing the dialog while
  a rewrite request is still in flight no longer shows stale draft/error toasts
  or repopulates the next open with the previous request's generated draft. A
  later accessibility pass gives the rewrite instruction textarea a localized
  accessible name, verifies footer actions keep explicit button semantics, and
  hides decorative / loading icons from assistive technology.
- `AgentSkillPreviewSidebar` follow-up hardening now verifies that agent source
  action controls keep explicit non-submit button semantics and hide decorative
  import/source-folder icons from assistive technology. The focused test failed
  first while the action icons were still exposed, then passed after the icons
  were marked decorative.
- App startup settings hydration now uses `waitForPersistHydration`, a small
  renderer utility that schedules its fallback timer before subscribing to
  Zustand persist hydration. This avoids the old temporal-dead-zone risk when a
  persist adapter invokes the finish callback synchronously, while still
  resolving through the 500 ms fallback when hydration never reports completion.

## Wave 2 — Domain views (10 / 18 planned)

Shipped this iteration:

- `tests/unit/components/top-bar.test.tsx` — 15 tests
- `tests/unit/components/prompt-list-view.test.tsx` — 3 tests
- `tests/unit/components/prompt-list-header.test.tsx` — 6 tests
- `tests/unit/components/tag-manager-modal.test.tsx` — 4 tests
- `tests/unit/components/skill-store-card.test.tsx` — 18 tests
- `tests/unit/components/column-config-menu.test.tsx` — 6 tests
- `tests/unit/components/skill-batch-tag-dialog.test.tsx` — 5 tests
- `tests/unit/components/language-settings.test.tsx` — 3 tests
- `tests/unit/components/general-settings.test.tsx` — 6 tests
- `tests/unit/components/web-device-settings.test.tsx` — 1 test
- `tests/unit/components/web-workspace-settings.test.tsx` — 2 tests
- `tests/unit/components/settings-page.test.tsx` — 9 tests
- `tests/unit/components/shortcuts-settings.test.tsx` — 7 tests
- `tests/unit/components/import-prompt-modal.test.tsx` — 7 tests
- `tests/unit/components/variable-input-modal.test.tsx` — 9 tests
- `tests/unit/components/prompt-detail-modal.test.tsx` — 3 tests
- `tests/unit/components/quick-add-modal.test.tsx` — 4 tests
- `tests/unit/components/prompt-table-view.test.tsx` — 7 tests
- `tests/unit/components/prompt-kanban-view.test.tsx` — 2 tests
- `tests/unit/components/create-prompt-modal.test.tsx` — 1 test
- `tests/unit/components/edit-prompt-modal.test.tsx` — 1 test
- `tests/unit/components/ai-test-workbench.test.tsx` — 12 tests
- `tests/unit/components/ai-workbench-base-fields.test.tsx` — 8 tests
- `tests/unit/components/ai-workbench-image-params-section.test.tsx` — 1 test
- `tests/unit/components/ai-workbench-advanced-section.test.tsx` — 2 tests
- `tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx` — 1 test
- `tests/unit/components/skill-quick-install.test.tsx` — 1 test
- `tests/unit/components/skill-store-detail-timers.test.tsx` — 2 tests
- `tests/unit/components/skill-detail-view-timers.test.tsx` — 3 tests
- `tests/unit/hooks/useTemporaryFlag.test.ts` — 3 tests
- `tests/integration/components/main-content-inline-edit.integration.test.tsx`
  — 14 tests, including copied feedback timer cleanup
- `tests/unit/components/prompt-modal-structure.test.tsx` — 12 tests,
  including create/edit source suggestion timer cleanup, discarded create-modal
  draft reset, and stale AI rewrite / translation result suppression after
  close/reopen
- `tests/unit/components/create-prompt-modal.test.tsx` and
  `tests/unit/components/edit-prompt-modal.test.tsx` initially failed because
  the visible Title and User Prompt labels were not programmatically associated
  with their text fields, and the Text / Image prompt-type buttons did not
  expose their selected state. Both modal variants now bind labels with
  generated ids and expose prompt-type state through `aria-pressed`; the focused
  modal tests now pass.
- Existing `tests/unit/components/prompt-modal-structure.test.tsx` still passes
  after the modal accessibility change, including its 12 timer, discard, and
  stale async-result regressions.
- `tests/unit/components/tag-manager-modal.test.tsx` exposed that the prompt tag
  click-mode select only announced the selected value (`Multi select`) instead
  of the field label (`Tag click mode`), and the test was querying dropdown
  choices as buttons even though the shared `Select` exposes them as `option`
  nodes. The prompt tag manager now passes the same field-level `ariaLabel` used
  by General Settings, and the test now selects `Single select` through the
  option role.
- Desktop Vitest now uses a 30s `testTimeout` / `hookTimeout`. The renderer
  component suite includes heavy jsdom files that render large settings and
  skill-store surfaces; a focused `AISettingsPrototype` batch-add test passed
  but needed 15.28s of test time, so the previous 5s default and local 15s
  overrides were too close to normal runtime under load. The change keeps the
  timeout finite while preventing valid integration-like component checks from
  being misclassified as failures.
- `tests/unit/utils/download-generated-image.test.ts` — 3 tests, covering data
  URLs, remote Blob URLs, and object URL cleanup when anchor click fails

Verification notes:

- `pnpm --filter @prompthub/desktop test -- --run` was executed on
  2026-06-08 and failed: 15 files failed, 45 tests failed, with 2 worker timeout
  errors. Most failures were default 5s timeouts in long-running UI / Skill
  integration-like component tests under full-suite load; one deterministic
  semantic failure was fixed in `tag-manager-modal.test.tsx`. The full-suite
  gate remains open and needs a dedicated stabilization pass before this change
  can be closed.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/tag-manager-modal.test.tsx tests/unit/components/ai-settings-prototype.test.tsx tests/unit/components/skill-store-remote.test.tsx --run`
  was executed before the timeout stabilization and failed: `tag-manager-modal`
  passed, while `skill-store-remote` had six 5s timeouts plus one early
  `skill-1` wait failure, and `ai-settings-prototype` had one 15s timeout.
- Focused reruns before the config change showed the underlying interactions can
  complete: `skill-store-remote.test.tsx -t "switches skills.sh filters immediately"`
  passed with 1 test in 4.03s, and `ai-settings-prototype.test.tsx -t "batch-adds all selected models"`
  passed with 1 test in 15.28s.
- After adding the 30s desktop Vitest timeout, `pnpm --filter @prompthub/desktop test -- tests/unit/components/tag-manager-modal.test.tsx tests/unit/components/ai-settings-prototype.test.tsx tests/unit/components/skill-store-remote.test.tsx --run`
  passed: 3 files / 87 tests.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/vitest.config.ts apps/desktop/tests/unit/components/ai-settings-prototype.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`:
  clean.
- `tests/unit/components/sortable-tree-timers.test.tsx` — 3 tests, covering
  delayed drag reset cleanup on unmount, repeated reset, and fast subsequent
  drag start
- `tests/unit/components/image-prompt-reverse-modal.test.tsx` — 19 tests,
  including pasted preview object URL cleanup on replace, close, and unmount,
  plus closed-modal suppression for late dropped/selected image inputs and AI
  reverse success/failure results, and image reverse action non-submit /
  decorative-icon semantics
- `tests/unit/components/prompt-quick-rewrite-dialog.test.tsx` — 6 tests,
  including closed-dialog suppression for late AI rewrite success/failure
  results and accessible form/icon semantics
- `tests/unit/hooks/use-prompt-media-manager.test.ts` — 8 tests, including URL
  download timeout cleanup after a successful remote image download and
  closed-modal suppression for late URL download, file picker, dropped media,
  and pasted image results
- `tests/unit/utils/persist-hydration.test.ts` — 3 tests, covering already
  hydrated stores, synchronous hydration callbacks, and timeout fallback
- `tests/unit/components/language-settings.test.tsx` — 3 tests, covering the
  supported language inventory, store-backed current-language display, and
  option-role language selection through the named Language trigger.
- `tests/unit/components/general-settings.test.tsx` — 6 tests, covering
  section rendering, store-backed toggle behavior, named tag-filter select
  updates, and named `switch` semantics for settings toggles. The shared
  `Select` now exposes listbox / option semantics and the general/language
  settings selects pass setting-level accessible names. The shared `ToggleSwitch`
  component now exposes `role="switch"`, `aria-checked`, `type="button"`, and
  caller-provided accessible names; every settings-page `ToggleSwitch` caller
  now passes an `ariaLabel`, including general, about, data/sync, web device,
  and skill platform settings.
- `tests/unit/components/web-device-settings.test.tsx` — 1 test, covering
  self-hosted web device settings cadence selects through setting-level
  accessible names and verifying selected client / store sync cadence values
  persist through `window.api.settings.set`.
- `tests/unit/components/shortcuts-settings.test.tsx` — 7 tests, covering
  saved shortcut hydration, load-failure feedback, late load-result suppression
  after unmount, conflict prevention before persisting to Electron, and
  edit/clear rollback when Electron persistence fails. Shortcut inputs and
  icon-only clear buttons now also expose per-action accessible names, so
  assistive technology and role-based tests can distinguish duplicate controls.
- `tests/unit/components/ai-workbench-base-fields.test.tsx` — 8 tests,
  covering provider preset inventory, dedicated provider icons, protocol field
  visibility, capability toggles, and provider / protocol select access through
  stable field-label names instead of current selected values.
- `tests/unit/components/ai-workbench-image-params-section.test.tsx` — 1 test,
  covering image size, quality, and style selects through stable field-label
  names instead of current selected values, plus a quality option update path.
- `tests/unit/components/ai-settings-prototype.test.tsx` image-parameter
  regression initially failed because the image quality select was still queried
  by the selected value (`Standard`) as a button. The test now follows the
  shared `Select` semantics by opening the `Image Quality` field-label trigger
  and selecting the `HD` option by role, matching the current accessible
  contract. The focused `persists image parameters` run and the full
  `ai-settings-prototype.test.tsx` file now pass.
- `tests/unit/components/ai-workbench-advanced-section.test.tsx` — 2 tests,
  covering the translation mode select and reusable scenario-route model select
  through stable setting / scenario labels instead of current selected values.
- `tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx` — 1 test,
  covering endpoint provider-type and protocol selects through stable field
  labels instead of current selected values.

Deferred from the original plan (left for a follow-up change folder so this
work could land cleanly):

- `folder-tree.test.tsx` — `FolderTree.tsx` was a dead stub returning `null`
  with no live imports, so the component file was removed instead of adding a
  behaviorless test.
- `create-prompt-modal.test.tsx`, `edit-prompt-modal.test.tsx`,
  `prompt-detail-modal.test.tsx` — depend on AI client calls and folder store;
  same blocker as the views above.
- `skill-platform-panel.test.tsx` — heavy `useSkillPlatform` hook surface;
  appropriate to test once we extract the platform-state slice into a leaner
  hook. Out of scope for this change.

## Verification

- `pnpm --filter @prompthub/desktop test:unit`: **152 files / 1261 tests**, all
  passing (was 136 / 1165 before this change).
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx --run`: **12 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/confirm-dialog.test.tsx --run`: **10 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/input.test.tsx --run -t "associates the visible label"`: failed first because the visible label was not associated with a form control.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/textarea.test.tsx --run -t "renders the label"`: failed first because the visible label was not associated with a form control.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/input.test.tsx --run`: **5 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/textarea.test.tsx --run`: **7 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/background-image-backdrop.test.tsx --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/checkbox.test.tsx --run -t "supports an accessible name"`: failed first because no-visible-label checkboxes exposed an empty accessible name.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/checkbox.test.tsx --run -t "supports an accessible name"`: **1 test**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/checkbox.test.tsx --run`: **7 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/collapsible-thinking.test.tsx --run -t "starts collapsed"`: failed first because the disclosure trigger did not expose `aria-expanded`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/collapsible-thinking.test.tsx --run -t "starts collapsed"`: **1 test**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/collapsible-thinking.test.tsx --run -t "respects defaultExpanded"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/collapsible-thinking.test.tsx --run`: **6 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/unsaved-changes-dialog.test.tsx --run`: **6 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-preview-modal.test.tsx --run`: **7 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/close-dialog.test.tsx --run`: **5 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/select.test.tsx --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/select.test.tsx --run -t "expanded state"`: failed first because the trigger did not expose `aria-haspopup` / expanded state and the dropdown did not expose listbox / option semantics.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/toast.test.tsx --run -t "uses the active locale"`: **1 test**, all passing. The regression failed first with `PromptHub - Warning` before the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/toast.test.tsx --run -t "gives icon-only close"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/toast.test.tsx --run`: **6 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/context-menu.test.tsx --run -t "closes on Escape"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/context-menu.test.tsx --run`: **8 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-list-header.test.tsx --run`: **6 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/column-config-menu.test.tsx --run`: **6 tests**, all passing. The existing i18next test-environment warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/resizable-header.test.tsx --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`: **15 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/variable-input-modal.test.tsx --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-detail-modal.test.tsx --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/import-prompt-modal.test.tsx --run -t "ignores stale import"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/import-prompt-modal.test.tsx --run`: **6 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/quick-add-modal.test.tsx --run -t "ignores stale generated"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/quick-add-modal.test.tsx --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "selection controls"`: failed first because table selection controls rendered as unnamed buttons instead of checkboxes.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "selection controls"`: **1 test**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "pagination controls"`: failed first because the page-size select and previous/next icon buttons had no accessible names.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "pagination controls"`: **1 test**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "clamps the active page"`: failed first because shrinking the prompt list while on page 2 left the table body empty and page 1 inactive.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "clamps the active page"`: **1 test**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "removes selected ids"`: failed first because selected ids that disappeared after a prompt refresh still kept the batch action bar visible.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "removes selected ids"`: **1 test**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "selects the current page"`: failed first because selecting one row on page 1 made the select-all checkbox appear checked on page 2 when that page also had one row.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run -t "selects the current page"`: **1 test**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run`: **7 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-kanban-view.test.tsx --run`: failed first because icon-only card action buttons lacked explicit `aria-label` attributes and the pinned section toggle lacked `aria-expanded`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-kanban-view.test.tsx --run`: **2 tests**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-list-view.test.tsx --run`: failed first because rows were clickable but not keyboard-focusable controls, and already-favorited prompts exposed the passive `Favorites` label instead of `Remove from Favorites`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-list-view.test.tsx --run`: **3 tests**, all passing after the fix.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run -t "ignores stale single-model"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run -t "ignores stale (compare|generated)"`: **2 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run`: **12 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-quick-install.test.tsx --run`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx --run`: **6 tests**, all passing after adding duplicate import / remove / update-check / update click regressions.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx tests/unit/components/skill-store-installed-state.test.tsx tests/unit/components/skill-quick-install.test.tsx --run`: **3 files / 11 tests**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-remote.test.tsx --run -t "shows the update action"`: **1 selected test**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-detail-view-timers.test.tsx --run`: failed first because the icon-only close action had no accessible name and detail actions lacked explicit non-submit / decorative-icon coverage.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-detail-view-timers.test.tsx --run`: **3 tests**, all passing after adding action semantics and platform selection / uninstall separation coverage.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run -t "clears detail page copy feedback timers"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run`: **25 tests passed / 1 test timed out**. The timeout is in the existing `keeps web runtime skill surfaces visible without forcing My Skills` smoke test, outside the new timer regression.
- `pnpm --filter @prompthub/desktop test -- tests/unit/hooks/useTemporaryFlag.test.ts --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-inline-edit.integration.test.tsx --run -t "clears copied feedback timers"`: **1 test**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-inline-edit.integration.test.tsx --run`: **14 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-modal-structure.test.tsx --run -t "ignores stale AI rewrite"`: **1 test**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-modal-structure.test.tsx --run -t "ignores stale translate"`: **2 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-modal-structure.test.tsx --run -t "clears discarded create"`: **1 test**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-modal-structure.test.tsx --run`: **12 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/utils/download-generated-image.test.ts --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sortable-tree-timers.test.tsx --run`: **3 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run -t "revokes pasted image preview object URLs"`: **2 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run -t "does not show a (dropped|selected) image"`: **2 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run -t "does not show (a reverse draft toast|reverse failures)"`: **2 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run`: **14 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-quick-rewrite-dialog.test.tsx --run -t "does not show (generated drafts|rewrite errors)"`: **2 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-quick-rewrite-dialog.test.tsx --run`: **5 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/hooks/use-prompt-media-manager.test.ts --run -t "clears the URL download timeout"`: **1 test**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/hooks/use-prompt-media-manager.test.ts --run -t "does not (append URL downloads|show URL download failures)"`: **2 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/hooks/use-prompt-media-manager.test.ts --run -t "does not append (selected|dropped|pasted)"`: **3 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/hooks/use-prompt-media-manager.test.ts --run`: **8 tests**, all passing. The existing internal-URL rejection test still prints its expected `console.error`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/utils/persist-hydration.test.ts --run`: **3 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/shortcuts-settings.test.tsx --run`: failed first because rejected `getShortcuts()` promises were unhandled and no load-failure toast was shown.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/shortcuts-settings.test.tsx --run`: failed again after adding persistence-failure coverage because rejected `setShortcuts()` promises were unhandled, no save-failure toast was shown, and optimistic UI state was not rolled back.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/shortcuts-settings.test.tsx --run -t "specific accessible name"`: failed first because shortcut inputs had no accessible name and each clear button exposed the same generic `Clear Shortcut` name.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/shortcuts-settings.test.tsx --run`: **7 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/general-settings.test.tsx --run -t "exposes toggle switches"`: failed first because settings toggles were unnamed `button` controls instead of named switches.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/general-settings.test.tsx --run`: **6 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-settings.test.tsx tests/unit/components/about-settings.test.tsx --run`: **15 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/general-settings.test.tsx tests/unit/components/skill-settings.test.tsx tests/unit/components/about-settings.test.tsx --run`: **21 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/select.test.tsx tests/unit/components/language-settings.test.tsx tests/unit/components/general-settings.test.tsx --run`: **13 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-device-settings.test.tsx --run`: failed first because the device and store cadence selects were only exposed by their current values instead of their setting labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-device-settings.test.tsx --run`: **1 test**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-base-fields.test.tsx --run -t "field labels"`: failed first because the provider and protocol selects were only exposed by their current selected values instead of field labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-base-fields.test.tsx --run`: **8 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-image-params-section.test.tsx --run -t "field labels"`: failed first because image size, quality, and style selects were only exposed by their current selected values instead of field labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-image-params-section.test.tsx --run`: **1 test**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-advanced-section.test.tsx --run`: failed first because the translation-mode and scenario-route selects were only exposed by their current selected values instead of setting / scenario labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-advanced-section.test.tsx --run`: **2 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx --run`: failed first because endpoint provider-type and protocol selects were only exposed by their current selected values instead of field labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx --run`: **1 test**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/password-input.test.tsx --run`: failed first because the icon-only password visibility button had an empty accessible name.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/password-input.test.tsx --run`: **1 test**, all passing. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/password-input.test.tsx --run`: failed again after extending the test because the password input itself did not accept a field-level accessible name.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/password-input.test.tsx tests/unit/components/ai-workbench-base-fields.test.tsx tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx --run`: **3 files / 10 tests**, all passing after adding `PasswordInput ariaLabel` support and updating the covered AI workbench callers.
- `node - <<'NODE' ... NODE`: clean. The structural scan found every current settings-page `PasswordInput` usage passes `ariaLabel`.
- `git diff --check -- apps/desktop/src/renderer/components/settings/shared.tsx apps/desktop/tests/unit/components/password-input.test.tsx apps/desktop/src/renderer/components/settings/SecuritySettings.tsx apps/desktop/src/renderer/components/settings/WebWorkspaceSettings.tsx apps/desktop/src/renderer/components/settings/DataSettings.tsx apps/desktop/src/renderer/components/settings/AISettings.tsx apps/desktop/src/renderer/components/settings/ai-workbench/model-form/BaseFields.tsx apps/desktop/src/renderer/components/settings/ai-workbench/EndpointFormModal.tsx`: clean.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/password-input.test.tsx tests/unit/components/ai-workbench-base-fields.test.tsx tests/unit/components/ai-workbench-image-params-section.test.tsx tests/unit/components/ai-workbench-advanced-section.test.tsx tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx --run`: **5 files / 13 tests**, all passing. The existing Vite CJS deprecation warning still prints.
- `node -e "const fs=require('fs'); for (const f of process.argv.slice(1)) JSON.parse(fs.readFileSync(f,'utf8'));" apps/desktop/src/renderer/i18n/locales/en.json apps/desktop/src/renderer/i18n/locales/zh.json apps/desktop/src/renderer/i18n/locales/zh-TW.json apps/desktop/src/renderer/i18n/locales/ja.json apps/desktop/src/renderer/i18n/locales/fr.json apps/desktop/src/renderer/i18n/locales/de.json apps/desktop/src/renderer/i18n/locales/es.json`: clean.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "(self-hosted|WebDAV fields|S3 fields)"`: failed first because self-hosted, WebDAV, and S3 native text inputs were only exposed with empty accessible names despite visible labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "(manual recovery|self-hosted|WebDAV fields|S3 fields)"`: **4 tests**, all passing after adding stable `aria-label` values to manual recovery paths, self-hosted URL / username, WebDAV URL / username, and S3 endpoint / region / bucket / access key / backup prefix inputs. The existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`: failed once after the focused fix because an existing sync-source Select test queried a listbox option as a plain button; the assertion was updated to `role="option"` to match the current Select semantics.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`: **25 tests**, all passing. The existing Vite CJS deprecation warning and existing jsdom navigation warning still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/DataSettings.tsx apps/desktop/tests/unit/components/data-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "(active sync source|sync cadence selects)"`: failed first because DataSettings sync-source and cadence `Select` triggers were exposed by current values such as `Manual only` / `Off` instead of field-level names.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "(active sync source|sync cadence selects)"`: **2 tests**, all passing after adding `ariaLabel` to the current sync source, self-hosted automatic sync / startup pull, WebDAV auto-run / startup pull, and S3 auto-run / startup pull selects.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`: **26 tests**, all passing. The existing Vite CJS deprecation warning and existing jsdom navigation warning still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/DataSettings.tsx apps/desktop/tests/unit/components/data-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`: failed first because the legacy chat and image provider `Select` triggers were exposed as the current value `OpenAI` instead of the visible field label `Provider`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`: **2 tests**, all passing after adding `ariaLabel={t("settings.providerName")}` to both legacy provider selects.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/AISettings.tsx apps/desktop/tests/unit/components/ai-settings-legacy.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`: failed first after strengthening the regression because the legacy chat and image model text inputs for custom name, API URL, and model name were still exposed with empty accessible names despite visible labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`: **2 tests**, all passing after adding `aria-label` values for `settings.customNameOptional`, `settings.apiUrl`, and `settings.modelName` to both legacy chat and image model forms.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/AISettings.tsx apps/desktop/tests/unit/components/ai-settings-legacy.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run -t "advanced parameter sliders"`: failed first because the legacy chat advanced parameter range sliders had empty accessible names despite visible field labels.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run -t "advanced parameter sliders"`: **1 test**, all passing after adding field-label `aria-label` values for Temperature, Max Tokens, Top P, Frequency Penalty, and Presence Penalty sliders.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`: **3 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-batch-tag-dialog.test.tsx --run -t "assistive technology"`: failed first because the batch tag text input had an empty accessible name despite a visible `Tag` label, and the add/remove mode buttons only exposed selection through color.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-batch-tag-dialog.test.tsx --run -t "assistive technology"`: **1 test**, all passing after binding the `Tag` label to the input, adding `aria-pressed` to the mode buttons, and hiding decorative/loading icons from assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-batch-tag-dialog.test.tsx --run`: **6 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx --run -t "keyboard-activatable|quick install"`: failed first because the store card primary action was mouse-clickable but not keyboard-focusable, and the quick-install button click bubbled into the card primary action when the parent callback did not stop propagation.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx --run -t "keyboard-activatable|quick install"`: **2 tests**, all passing after exposing the card primary content as a keyboard-activatable control, adding visible focus styling, preventing quick-install click propagation inside the card, and giving icon-only install / installing controls explicit accessible names.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx --run`: **18 tests**, all passing after updating existing assertions to target specific controls by accessible name.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-custom-sources.test.tsx --run -t "text fields with stable accessible names"`: failed first because add-source and edit-source text inputs only exposed empty accessible names while relying on placeholder text.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-custom-sources.test.tsx --run -t "clears add-source branch loading"`: failed first because changing the add-source URL from a loadable GitHub repo to a non-loadable value left the stale branch loading message visible while the previous request was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-custom-sources.test.tsx --run -t "clears (add-source|edit-source) branch loading"`: **2 tests**, passing after clearing branch loading in both add and edit source early-return paths.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-custom-sources.test.tsx --run`: **16 tests**, all passing after adding stable accessible names to add/edit custom source name, URL/path, branch, and directory fields plus stale branch-loading coverage.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run`: failed first because global platform targets were click-only cards with no button role, no keyboard toggle path, and no pressed state; global Copy / Symlink mode buttons also only exposed the selected mode through color.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run`: **2 tests**, all passing after adding `aria-pressed` to global install mode buttons, exposing uninstalled platform targets as keyboard-toggleable pressed controls, and hiding decorative mode/status icons from assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx --run`: failed first because project deployment target buttons did not expose pressed state, and an empty selected-target set was interpreted as "all targets selected", preventing users from deselecting every target.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx --run`: **2 tests**, all passing after making an empty selected-target set mean zero selected targets, disabling deployment when none are selected, exposing target toggle state through `aria-pressed`, and hiding decorative project sidebar icons from assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-preview-pane.test.tsx --run -t "preview toolbar actions"`: failed first because the Skill preview translate / refresh / copy toolbar buttons had no explicit `type="button"` and their decorative icons were exposed to assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-preview-pane.test.tsx --run`: **5 tests**, all passing after giving preview toolbar actions explicit non-submit button semantics and hiding decorative author / toolbar / empty-state icons from assistive technology.
- `git diff --check -- apps/desktop/src/renderer/components/settings/shared.tsx apps/desktop/tests/unit/components/password-input.test.tsx apps/desktop/src/renderer/i18n/locales/en.json apps/desktop/src/renderer/i18n/locales/zh.json apps/desktop/src/renderer/i18n/locales/zh-TW.json apps/desktop/src/renderer/i18n/locales/ja.json apps/desktop/src/renderer/i18n/locales/fr.json apps/desktop/src/renderer/i18n/locales/de.json apps/desktop/src/renderer/i18n/locales/es.json apps/desktop/src/renderer/components/settings/ai-workbench/EndpointFormModal.tsx apps/desktop/tests/unit/components/ai-workbench-endpoint-form-modal.test.tsx apps/desktop/src/renderer/components/settings/ai-workbench/AdvancedSection.tsx apps/desktop/src/renderer/components/settings/ai-workbench/shared.tsx apps/desktop/tests/unit/components/ai-workbench-advanced-section.test.tsx apps/desktop/src/renderer/components/settings/ai-workbench/model-form/ImageParamsSection.tsx apps/desktop/tests/unit/components/ai-workbench-image-params-section.test.tsx apps/desktop/src/renderer/components/settings/ai-workbench/model-form/BaseFields.tsx apps/desktop/tests/unit/components/ai-workbench-base-fields.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/ai-workbench/AdvancedSection.tsx apps/desktop/src/renderer/components/settings/ai-workbench/shared.tsx apps/desktop/tests/unit/components/ai-workbench-advanced-section.test.tsx apps/desktop/src/renderer/components/settings/ai-workbench/model-form/ImageParamsSection.tsx apps/desktop/tests/unit/components/ai-workbench-image-params-section.test.tsx apps/desktop/src/renderer/components/settings/ai-workbench/model-form/BaseFields.tsx apps/desktop/tests/unit/components/ai-workbench-base-fields.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/ai-workbench/model-form/ImageParamsSection.tsx apps/desktop/tests/unit/components/ai-workbench-image-params-section.test.tsx apps/desktop/src/renderer/components/settings/ai-workbench/model-form/BaseFields.tsx apps/desktop/tests/unit/components/ai-workbench-base-fields.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/ai-workbench/model-form/BaseFields.tsx apps/desktop/tests/unit/components/ai-workbench-base-fields.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/WebDeviceSettings.tsx apps/desktop/tests/unit/components/web-device-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/ui/Select.tsx apps/desktop/src/renderer/components/settings/GeneralSettings.tsx apps/desktop/src/renderer/components/settings/LanguageSettings.tsx apps/desktop/tests/unit/components/select.test.tsx apps/desktop/tests/unit/components/language-settings.test.tsx apps/desktop/tests/unit/components/general-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/shared.tsx apps/desktop/src/renderer/components/settings/GeneralSettings.tsx apps/desktop/src/renderer/components/settings/AboutSettings.tsx apps/desktop/src/renderer/components/settings/DataSettings.tsx apps/desktop/src/renderer/components/settings/WebDeviceSettings.tsx apps/desktop/src/renderer/components/settings/SkillSettings.tsx apps/desktop/tests/unit/components/general-settings.test.tsx apps/desktop/tests/unit/components/skill-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/AiTestModal.tsx apps/desktop/tests/unit/components/ai-test-workbench.test.tsx apps/desktop/src/renderer/components/prompt/PromptTableView.tsx apps/desktop/tests/unit/components/prompt-table-view.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillQuickInstall.tsx apps/desktop/tests/unit/components/skill-quick-install.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillStoreDetail.tsx apps/desktop/tests/unit/components/skill-store-detail-timers.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillDetailView.tsx apps/desktop/tests/unit/components/skill-detail-view-timers.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx apps/desktop/tests/unit/components/skill-i18n-smoke.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/ShortcutsSettings.tsx apps/desktop/tests/unit/components/shortcuts-settings.test.tsx apps/desktop/src/renderer/i18n/locales/en.json apps/desktop/src/renderer/i18n/locales/zh.json apps/desktop/src/renderer/i18n/locales/zh-TW.json apps/desktop/src/renderer/i18n/locales/ja.json apps/desktop/src/renderer/i18n/locales/fr.json apps/desktop/src/renderer/i18n/locales/de.json apps/desktop/src/renderer/i18n/locales/es.json spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/hooks/useTemporaryFlag.ts apps/desktop/src/renderer/components/layout/MainContent.tsx apps/desktop/tests/unit/hooks/useTemporaryFlag.test.ts apps/desktop/tests/integration/components/main-content-inline-edit.integration.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/CreatePromptModal.tsx apps/desktop/src/renderer/components/prompt/EditPromptModal.tsx apps/desktop/tests/unit/components/prompt-modal-structure.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/utils/download-generated-image.ts apps/desktop/tests/unit/utils/download-generated-image.test.ts apps/desktop/src/renderer/components/layout/MainContent.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/layout/tree/SortableTree.tsx apps/desktop/tests/unit/components/sortable-tree-timers.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/ImagePromptReverseModal.tsx apps/desktop/tests/unit/components/image-prompt-reverse-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/usePromptMediaManager.ts apps/desktop/tests/unit/hooks/use-prompt-media-manager.test.ts spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/utils/persist-hydration.ts apps/desktop/tests/unit/utils/persist-hydration.test.ts spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/PromptKanbanView.tsx apps/desktop/tests/unit/components/prompt-kanban-view.test.tsx apps/desktop/src/renderer/components/prompt/PromptTableView.tsx apps/desktop/tests/unit/components/prompt-table-view.test.tsx apps/desktop/src/renderer/i18n/locales/en.json apps/desktop/src/renderer/i18n/locales/zh.json apps/desktop/src/renderer/i18n/locales/zh-TW.json apps/desktop/src/renderer/i18n/locales/ja.json apps/desktop/src/renderer/i18n/locales/fr.json apps/desktop/src/renderer/i18n/locales/de.json apps/desktop/src/renderer/i18n/locales/es.json spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/PromptListView.tsx apps/desktop/tests/unit/components/prompt-list-view.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg --files apps/desktop/tests/unit/components | rg '\.test\.(ts|tsx)$' | wc -l`: **96** component test files, still above the >=65 success target.
- `rg --files apps/desktop/tests/unit/components | rg '\.test\.(ts|tsx)$' | wc -l`: **98** component test files, still above the >=65 success target.
- `rg --files apps/desktop/tests/unit/components | rg '\.test\.(ts|tsx)$' | wc -l`: **99** component test files, still above the >=65 success target.
- File-level component test count: **102** (`*.test.ts` + `*.test.tsx`) vs. 41
  before this change — surpassing the ≥65 success target.

## Full-suite stabilization follow-up

- `pnpm --filter @prompthub/desktop test -- --run`: failed after 627.05s with
  **8 failed files / 10 failed tests** plus Vitest worker `onTaskUpdate`
  timeout errors reported against `skill-i18n-smoke.test.tsx`. The direct
  failures were:
  `main-content-context-move.integration.test.tsx`,
  `skill-ui.integration.test.tsx`, `data-settings.test.tsx`,
  `ai-settings-prototype.test.tsx`,
  `skill-detail-project-distribution.test.tsx`,
  `skill-projects-view.test.tsx`, `prompt-modal-structure.test.tsx`, and
  `skill-settings.test.tsx`.
- `data-settings.test.tsx` no longer leaks a delayed restart-confirm timer from
  the empty-directory migration test into the active-directory switch test. The
  test now verifies the migration call without simulating a restart-required
  result.
- The manual recovery browser test now uses the visible manual path input and
  Add action instead of relying on the native folder picker mock under full
  suite load. This still verifies the user-visible manual extra-path workflow
  and the `checkRecovery({ extraPaths, ignoreDismissMarker })` contract.
- Heavy jsdom renderer/integration tests that exceeded local 10s/15s/30s
  limits under full-suite concurrency now have local 60s budgets:
  `skill-ui.integration`, `ai-settings-prototype`, `skill-projects-view`,
  `skill-settings`, `skill-detail-project-distribution`, and
  `prompt-modal-structure`.
- The context-menu quick rewrite integration test now wraps the context action
  click in `act` and waits up to 60s for the visible quick rewrite dialog,
  avoiding a short default query window during full-suite scheduling pressure.
- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-context-move.integration.test.tsx tests/integration/components/skill-ui.integration.test.tsx tests/unit/components/data-settings.test.tsx tests/unit/components/ai-settings-prototype.test.tsx tests/unit/components/skill-detail-project-distribution.test.tsx tests/unit/components/skill-projects-view.test.tsx tests/unit/components/prompt-modal-structure.test.tsx tests/unit/components/skill-settings.test.tsx --run`:
  **8 files / 134 tests**, all passing after the stabilization follow-up.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/tests/unit/components/data-settings.test.tsx apps/desktop/tests/integration/components/main-content-context-move.integration.test.tsx apps/desktop/tests/integration/components/skill-ui.integration.test.tsx apps/desktop/tests/unit/components/ai-settings-prototype.test.tsx apps/desktop/tests/unit/components/skill-detail-project-distribution.test.tsx apps/desktop/tests/unit/components/skill-projects-view.test.tsx apps/desktop/tests/unit/components/prompt-modal-structure.test.tsx apps/desktop/tests/unit/components/skill-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`:
  clean.
- `pnpm --filter @prompthub/desktop test -- --run`: **222 files / 2007
  tests**, all passing after the full-suite stabilization follow-up. Duration:
  302.01s.

## Agent skill detail actions follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/agent-skill-detail-actions.test.tsx --run`: failed first because the local-folder action exposed the generic accessible name `Open`, action buttons had implicit submit behavior inside forms, and decorative Lucide icons were exposed to assistive technology.
- `AgentSkillDetailActions` now gives import, open-managed, open-local-folder, and uninstall actions explicit `type="button"` semantics. The local-folder control keeps the visible `Open` label while exposing the specific accessible name `Open Local Skill Folder`, and all decorative icons are hidden from assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/agent-skill-detail-actions.test.tsx --run`: **1 test**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/AgentSkillDetailActions.tsx apps/desktop/tests/unit/components/agent-skill-detail-actions.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/tests/unit/components/agent-skill-detail-actions.test.tsx apps/desktop/src/renderer/components/skill/AgentSkillDetailActions.tsx`: no matches.

## Skill code pane follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-code-pane.test.tsx --run`: failed first because the raw SKILL.md copy action had implicit submit behavior inside forms and decorative copy/status icons were exposed to assistive technology.
- `SkillCodePane` now gives the raw content copy action explicit `type="button"` semantics and hides decorative protocol/copy/status icons from assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-code-pane.test.tsx --run`: **1 test**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillCodePane.tsx apps/desktop/tests/unit/components/skill-code-pane.test.tsx`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillCodePane.tsx apps/desktop/tests/unit/components/skill-code-pane.test.tsx`: no matches.

## Skill batch deploy dialog follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-batch-deploy-dialog.test.tsx --run`: failed first after adding the regression because the icon-only close control had no accessible name, footer/toggle controls had implicit submit behavior inside forms, selected action/install/platform states were only exposed through styling, and decorative Lucide/platform icons leaked into button names.
- `SkillBatchDeployDialog` now gives close, toggle-all, cancel, and submit actions explicit `type="button"` semantics, exposes action mode / install mode / platform selection through `aria-pressed`, labels the close control, and hides decorative dialog, status, and platform icons from assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-batch-deploy-dialog.test.tsx --run`: failed first after adding the duplicate-click regression because quickly clicking Batch Deploy twice called `installMd` twice while the first batch was still pending.
- `SkillBatchDeployDialog` now uses a dialog-local in-flight ref guard in `handleDeploy`, so repeated deploy / undeploy clicks cannot start duplicate platform filesystem writes before React has re-rendered the disabled submit state.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-batch-deploy-dialog.test.tsx --run`: **4 tests**, all passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-batch-deploy-dialog.test.tsx tests/unit/components/skill-quick-install.test.tsx tests/unit/components/skill-platform-panel.test.tsx --run`: **3 files / 10 tests**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillBatchDeployDialog.tsx apps/desktop/tests/unit/components/skill-batch-deploy-dialog.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillBatchDeployDialog.tsx apps/desktop/tests/unit/components/skill-batch-deploy-dialog.test.tsx`: no matches.

## Skill store card installing-state follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx --run -t "disables the install button"`: failed first after strengthening the regression because the disabled installing-state trailing control had implicit submit behavior.
- `SkillStoreCard` now gives the installing-state trailing control explicit `type="button"` semantics while preserving its disabled status, accessible name, and spinner icon.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx --run`: failed first after adding the batch-selection decorative icon regression because the selected-state check glyph was exposed to assistive technology even though selection state is already represented by `aria-pressed`.
- `SkillStoreCard` now hides the selected-state batch selection check glyph from assistive technology while preserving the button's accessible name and pressed state.
- A later native-control pass replaces the store card primary `div role="button"`
  surface with a real non-submit button, preserving Enter / Space activation
  and isolating sibling install / detail controls from the card click action.
- A later hidden-click-target pass failed first because the outer card wrapper
  still handled click events even though the card already had an inner native
  primary button. That wrapper was not keyboard-focusable, so it created a
  mouse-only hidden activation area around the semantic controls.
- `SkillStoreCard` now leaves activation on the primary button, batch select,
  detail, and install controls only. The outer wrapper keeps layout, animation,
  and card styling but no longer handles clicks or advertises pointer cursor
  behavior. The primary native button also relies on browser-standard keyboard
  activation instead of a custom keydown handler.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx --run`: **20 tests**, all passing. The existing `react-i18next` no-instance warning still prints for this test file.
- The renderer scan for non-semantic clickable elements dropped from **25** to
  **24** candidates after removing the store card wrapper click handler.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillStoreCard.tsx apps/desktop/tests/unit/components/skill-store-card.test.tsx`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillStoreCard.tsx apps/desktop/tests/unit/components/skill-store-card.test.tsx`: no matches.

## Skill gallery card action follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-gallery-card.test.tsx --run`: failed first because gallery-card quick install, favorite, delete, and selection-toggle controls had implicit submit behavior inside forms, selection state was only exposed through styling, and decorative action/update icons were exposed to assistive technology.
- `SkillGalleryCard` now gives gallery-card action controls explicit `type="button"` semantics, exposes selection-toggle state with `aria-pressed`, and hides decorative update/action icons from assistive technology.
- A later native-surface pass failed first because the primary gallery card
  click target was still a non-focusable `div`, and icon-only action buttons
  still relied on `title` instead of explicit `aria-label` attributes.
- `SkillGalleryCard` now exposes the primary card action as a named,
  focusable, keyboard-activatable button surface. Enter and Space activate the
  same open / selection behavior as click, while nested action buttons remain
  isolated from the card keyboard handler.
- Quick install, favorite, delete, and selection-toggle buttons now keep their
  tooltip titles and also expose explicit localized `aria-label` values.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-gallery-card.test.tsx --run`: **3 tests**, passing.
- The renderer scan for non-semantic clickable elements dropped from **27** to
  **26** candidates after the gallery card primary surface was given explicit
  role, focus, and keyboard semantics.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-view-tags.test.tsx --run`: **13 tests**, passing. The existing React `act(...)` warning for the stale platform status test still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillGalleryCard.tsx apps/desktop/tests/unit/components/skill-gallery-card.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillGalleryCard.tsx apps/desktop/tests/unit/components/skill-gallery-card.test.tsx`: no matches.

## Skill list view action follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-list-view-actions.test.tsx --run`: failed first because list-row quick install, favorite, delete, and selection-toggle controls had implicit submit behavior inside forms, selection state was only exposed through styling, and decorative row action/status icons were exposed to assistive technology.
- `SkillListView` now gives row action controls explicit `type="button"` semantics, exposes selection-toggle state with `aria-pressed`, and hides decorative empty-state, update, safety, and action icons from assistive technology.
- A later native-surface pass failed first because the row primary click target
  was still a non-focusable `div`, and icon-only row actions still relied on
  `title` instead of explicit `aria-label` attributes.
- `SkillListView` now keeps the virtual row container responsible for
  measurement, drag/drop, and context menu behavior, while the row's primary
  content area is a real non-submit button. Enter and Space activate the same
  open / selection behavior as click, and row action buttons remain isolated
  sibling controls.
- Quick install, favorite, delete, and selection-toggle buttons now keep their
  tooltip titles and also expose explicit localized `aria-label` values.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-list-view-actions.test.tsx --run`: **3 tests**, passing.
- The renderer scan for non-semantic clickable elements dropped from **26** to
  **25** candidates after the list-row primary click target was moved onto a
  native button.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-view-tags.test.tsx --run`: **13 tests**, passing. The existing React `act(...)` warning for the stale platform status test still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillListView.tsx apps/desktop/tests/unit/components/skill-list-view-actions.test.tsx`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillListView.tsx apps/desktop/tests/unit/components/skill-list-view-actions.test.tsx`: no matches.

## Skill platform panel action follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run`: failed first after adding the global-action regression because the select-all action exposed raw i18n keys without default labels, and the initial test state clicked the disabled batch-install action.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run`: failed first after adding the project-action regression because each project selection button contained the nested `Remove from Project` role button, causing the selection button's accessible name to include the destructive remove action.
- `SkillPlatformPanel` now gives global select/deselect, batch install, export, and local-source actions explicit `type="button"` semantics, adds stable fallback labels for global select / deselect / selected / installing / install-all text, and hides decorative global platform, metadata, export, source, and project-distribution icons from assistive technology.
- `SkillPlatformPanel` now renders project selection and project removal as separate sibling buttons. The project selection action exposes `aria-pressed` and no longer includes the remove action in its accessible name, while `Remove from Project` is a real non-nested `button`.
- `tests/unit/components/skill-platform-panel.test.tsx` now covers global install mode pressed state, keyboard-toggleable platform targets, global action controls embedded in an outer form without accidental submission, and project selection / project removal button separation.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run`: **4 tests**, passing. The first post-implementation run caught the disabled batch-install test setup and passed after switching the fixture to an already-selected platform.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillPlatformPanel.tsx apps/desktop/tests/unit/components/skill-platform-panel.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillPlatformPanel.tsx apps/desktop/tests/unit/components/skill-platform-panel.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches before this record update.

## Skill file editor tree action follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx --run`: failed first after adding the file-tree action regression because the file delete action was a `div role="button"` nested inside the file selection button instead of a real sibling button.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx --run`: failed first after adding the toolbar non-submit regression because the New File toolbar action had implicit submit behavior when the editor was embedded in an outer form.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx --run`: failed first after adding the modal-close regression because the file editor modal close action was an unnamed icon-only submit button.
- `SkillFileEditor` now renders file selection and file deletion as separate sibling controls in each file tree row. File selection remains a non-submit button, while Delete File is a real labeled non-submit button with a decorative trash icon.
- `SkillFileEditor` now keeps file-tree toolbar, editor toolbar, dialog, and context-menu actions as explicit non-submit buttons and hides decorative action icons from assistive technology where button text or `aria-label` already provides the name.
- `SkillFileEditor` now gives the modal close action an explicit localized accessible name, non-submit button semantics, and a decorative close icon.
- `tests/unit/components/skill-file-editor.test.tsx` now covers hidden internal directories, synthetic folder expansion, Windows path normalization, file tree file/delete action separation, toolbar action non-submit semantics, modal close accessibility, save sync, editable code rendering, discard/cancel behavior, resource previews, and visible code rendering.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx --run`: **11 tests**, passing. Existing Vite CJS deprecation and Browserslist age warnings still print.

## Skill render boundary follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-render-boundary.test.tsx --run`: failed first after adding the error-boundary regression because the fallback warning and retry SVG icons were exposed to assistive technology.
- `SkillRenderBoundary` now keeps both recovery actions as explicit non-submit buttons and hides the decorative warning / retry icons from assistive technology.
- `tests/unit/components/skill-render-boundary.test.tsx` covers primary and secondary recovery actions embedded in an outer form, verifies they do not submit that form, and verifies all fallback SVG icons are decorative.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-render-boundary.test.tsx --run`: **1 test**, passing. A post-fix rerun caught an invalid test assumption about clicking both recovery actions on the same fallback render; the test now verifies primary and secondary recovery actions through separate fallback renders.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillRenderBoundary.tsx apps/desktop/tests/unit/components/skill-render-boundary.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillRenderBoundary.tsx apps/desktop/tests/unit/components/skill-render-boundary.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md`: no matches before this record update.

## Create skill scan source chooser follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-scan-source-chooser.test.tsx --run`: failed first after adding the local-import source chooser regression because the agent-source, folder-source, and scanning loader SVG icons were exposed to assistive technology.
- `CreateSkillScanSourceChooser` now keeps both source choice actions as explicit non-submit buttons and hides the decorative source / loading icons from assistive technology.
- `tests/unit/components/create-skill-scan-source-chooser.test.tsx` covers both source actions embedded in an outer form, verifies they do not submit that form, verifies the scanning folder action remains disabled, and verifies source / loading icons are decorative.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-scan-source-chooser.test.tsx --run`: **2 tests**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/CreateSkillScanSourceChooser.tsx apps/desktop/tests/unit/components/create-skill-scan-source-chooser.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/CreateSkillScanSourceChooser.tsx apps/desktop/tests/unit/components/create-skill-scan-source-chooser.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches before this record update.

## Skill version history modal follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-version-history-modal.test.tsx --run`: failed first after adding the timeline / diff-view accessibility regression because timeline version buttons did not expose their selected state through `aria-pressed`.
- `SkillVersionHistoryModal` now exposes version timeline and preview / diff view selection state through `aria-pressed`, exposes per-file diff disclosure state through `aria-expanded`, and hides decorative timeline, diff, delete, restore, loading, and diff-stat icons from assistive technology.
- `tests/unit/components/skill-version-history-modal.test.tsx` now covers timeline selection state, preview / diff view state transitions, file disclosure state, and decorative icon hiding in the version history modal.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-version-history-modal.test.tsx --run`: **3 tests**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillVersionHistoryModal.tsx apps/desktop/tests/unit/components/skill-version-history-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillVersionHistoryModal.tsx apps/desktop/tests/unit/components/skill-version-history-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches before this record update.

## Project skill preview sidebar deploy-target sync follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx --run`: failed first after adding the deploy-target synchronization regression because a newly added target folder was not selected by default after `deployTargets` changed.
- `ProjectSkillPreviewSidebar` now reconciles internal target selection whenever the deploy-target list changes: removed targets are discarded, newly added targets are selected by default, and targets the user explicitly cleared remain unselected.
- `tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx` now covers adding a new deployment target after the user has deselected an existing custom target, proving the new target is selected without reselecting the user-cleared target.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx --run`: **3 tests**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/ProjectSkillPreviewSidebar.tsx apps/desktop/tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/ProjectSkillPreviewSidebar.tsx apps/desktop/tests/unit/components/project-skill-preview-sidebar-i18n.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches before this record update.

## Skill library import modal preference follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-library-import-modal.test.tsx --run`: failed first after adding the closed-modal preference regression because `SkillLibraryImportModal` persisted its initial empty `selectedTargetIds` / `customTargets` state while closed, overwriting previously saved custom project import targets. The same test also failed because advanced import settings, import mode choices, and target / skill selection controls did not expose expanded or pressed state.
- `SkillLibraryImportModal` now only persists project import target preferences while open, skips the initial empty-state write when saved target preferences already exist, and still allows real user target changes to persist after opening.
- The modal now exposes advanced settings through `aria-expanded` / `aria-controls`, exposes import mode, target folder, and skill selection state through `aria-pressed`, labels the skill search input, and hides decorative settings, chevron, add-folder, imported, checkmark, and loading icons from assistive technology.
- The confirm action now has a modal-local in-flight guard in addition to the parent-provided `isDeploying` prop, so a rapid double click cannot submit the same import payload twice before the parent has re-rendered the disabled state. The agent install call site now returns the real install promise to the modal instead of wrapping it in `void`, so the guard stays active for the full async install.
- The custom target picker now has a modal-local in-flight guard and disabled state, so rapid repeated Add Folder clicks cannot open multiple native folder pickers. Late picker results are ignored after the modal closes, preventing stale custom targets from being written into a later modal session.
- `tests/unit/components/skill-library-import-modal.test.tsx` covers the closed-modal preference overwrite regression plus import settings / mode / target / skill selection state semantics.
- `tests/unit/components/skill-library-import-modal.test.tsx` also covers the duplicate-confirm regression. It failed first because a double click called `onConfirm` twice while the first async import was still pending.
- `tests/unit/components/skill-library-import-modal.test.tsx` also covers the duplicate custom-target picker regression. It failed first because a double click called `onPickCustomTarget` twice while the first native folder picker promise was still pending.
- `tests/unit/components/skill-library-import-modal.test.tsx` also covers a folder picker promise resolving after the modal has closed and reopened, proving the stale path is not added to the next import session.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-library-import-modal.test.tsx --run`: **5 tests**, passing. The first post-fix run caught an overly broad target query, and the test now scopes target-folder assertions to the target section.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx --run`: **22 tests**, passing. A first post-fix run caught that an overbroad hydration guard prevented user changes from being remembered after reopening; the guard now only protects the closed / initial empty-state overwrite path.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-agents-view.test.tsx --run`: **14 tests**, passing. The existing React `act(...)` warnings in agent detail tests still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillAgentsView.tsx apps/desktop/src/renderer/components/skill/SkillLibraryImportModal.tsx apps/desktop/tests/unit/components/skill-library-import-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillAgentsView.tsx apps/desktop/src/renderer/components/skill/SkillLibraryImportModal.tsx apps/desktop/tests/unit/components/skill-library-import-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Project form save-session follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx --run`: failed first after adding the duplicate-create regression because quickly clicking the project form Add Project action twice called `addSkillProject` twice while the first create-and-scan save was still pending.
- `ProjectFormModal` now has a modal-local save in-flight guard and disabled saving state, so repeated Add Project / Save clicks cannot submit duplicate project creation or update payloads before the parent has completed the async save path.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx --run`: failed first after adding the stale-save regression because a previous create-and-scan save could finish after the user closed and reopened the form, then close the newly opened form.
- `ProjectFormModal` now tracks form open sessions and only lets the save promise close the form or clear the saving state if it still belongs to the current open session. Older save completions are ignored after close / reopen.
- `tests/unit/components/skill-projects-view.test.tsx` now covers both regressions: repeated creation clicks while scan is pending, and an earlier save finishing after the form has been reopened.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx --run`: **24 tests**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx tests/unit/components/skill-library-import-modal.test.tsx tests/unit/components/skill-agents-view.test.tsx --run`: **3 files / 43 tests**, passing. The existing React `act(...)` warnings in agent detail tests still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillAgentsView.tsx apps/desktop/src/renderer/components/skill/SkillLibraryImportModal.tsx apps/desktop/src/renderer/components/skill/SkillProjectsView.tsx apps/desktop/tests/unit/components/skill-library-import-modal.test.tsx apps/desktop/tests/unit/components/skill-projects-view.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.

## Skill quick install duplicate-click follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-quick-install.test.tsx --run`: failed first after adding the duplicate-click regression because quickly clicking Install Selected twice called `batchInstall` twice while the first install promise was still pending.
- `SkillQuickInstall` now has a modal-local install in-flight guard and local pending state. The Install Selected action, select-all control, and platform target choices become disabled immediately after the first click, even before `useSkillPlatform` re-renders `isBatchInstalling`.
- `tests/unit/components/skill-quick-install.test.tsx` now covers the duplicate-click regression in addition to the existing auto-close timer cleanup and accessibility semantics.
- The timer cleanup test now spies on real timers instead of switching the whole file to fake timers, avoiding `userEvent` hangs in later tests while preserving the auto-close cleanup assertion.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-quick-install.test.tsx --run`: **3 tests**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run`: **3 tests**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx --run`: **18 tests**, passing. The existing i18next missing-instance warning still prints in one legacy render path.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Skill store detail translation and safety scan follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx --run`: failed first after adding the duplicate translation regression because quickly clicking AI Translate twice called `translateContent` twice while the first translation promise was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx --run`: failed first after adding the duplicate safety scan regression because quickly clicking Run Scan twice called `window.api.skill.scanSafety` twice while the first scan promise was still pending.
- `SkillStoreDetail` now keeps a detail-local translation in-flight guard shared by AI Translate and Refresh Translation. Repeated translation clicks return while the first translation is pending, while existing cached translations still toggle visibility normally.
- `SkillStoreDetail` now keeps a detail-local safety scan in-flight promise. Repeated Run Scan clicks and install-time safety checks reuse the pending scan result until it settles, then clear the guard and scanning state.
- `tests/unit/components/skill-store-detail-timers.test.tsx` now covers duplicate AI Translate and Run Scan clicks in addition to the existing timer cleanup, duplicate install / remove / update action, and action semantics regressions.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx --run`: **11 tests**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillStoreDetail.tsx apps/desktop/tests/unit/components/skill-store-detail-timers.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean before this record update.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillStoreDetail.tsx apps/desktop/tests/unit/components/skill-store-detail-timers.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches before this record update.

## Full skill detail async action follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding the duplicate full-detail translation regression because quickly clicking AI Translate twice called `translateContent` twice while the first translation promise was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding the duplicate full-detail safety scan regression because quickly clicking Safety Assessment twice called `window.api.skill.scanSafety` twice while the first scan promise was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding duplicate source update regressions because quickly clicking Check Updates or Update from Source twice called the source check / update store actions twice while the first promise was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding duplicate notes / snapshot regressions because quickly clicking Save personal notes or Create Snapshot twice wrote the notes sidecar or created a version snapshot twice while the first write was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding the duplicate delete confirmation regression because quickly clicking Delete in the confirmation dialog called `deleteSkill` twice while the first delete promise was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding the duplicate platform install regression because quickly clicking Install All twice called the platform batch install hook twice while the first install promise was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding the duplicate platform uninstall confirmation regression because quickly clicking Uninstall in the confirmation dialog called the platform uninstall hook twice while the first uninstall promise was still pending.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: failed first after adding duplicate project distribution regressions because quickly clicking Deploy to Selected Projects or confirming Remove from Project twice started duplicate project folder copy/delete operations while the first filesystem promise was still pending.
- `SkillFullDetailPage` now keeps a detail-local translation in-flight guard. Repeated full-detail AI Translate / Refresh Translation clicks return while the first translation is pending, while existing cached translations still toggle visibility normally.
- `SkillFullDetailPage` now keeps a detail-local safety scan in-flight promise. Repeated full-detail Safety Assessment / Rescan clicks reuse the pending scan result until it settles, then clear the guard and scanning state.
- `SkillFullDetailPage` now keeps detail-local source update check / apply in-flight guards. Repeated Check Updates or Update from Source clicks return while the first source operation is pending, avoiding duplicate remote checks or duplicate local source writes before React re-renders disabled state.
- `SkillFullDetailPage` now keeps detail-local personal notes save and snapshot creation in-flight guards. Repeated Save or Create Snapshot clicks return while the first file/version write is pending, avoiding duplicate sidecar writes or duplicate manual snapshots.
- `SkillFullDetailPage` now keeps a delete in-flight guard and passes loading state to the delete `ConfirmDialog`, so repeated Delete confirmations return while the first delete is pending and the dialog controls are disabled.
- `SkillFullDetailPage` now keeps a platform install in-flight guard, so repeated Install All clicks return while the first platform batch install is pending even before `useSkillPlatform` re-renders `isBatchInstalling`.
- `SkillFullDetailPage` now keeps a platform uninstall in-flight guard and passes loading state to the uninstall `ConfirmDialog`, so repeated Uninstall confirmations return while the first platform removal is pending and the dialog cannot be closed mid-operation.
- `SkillFullDetailPage` now keeps project deploy and project removal in-flight guards, so repeated project distribution actions return while the first project copy/delete operation is pending. The project removal confirmation dialog also receives loading state and cannot be closed while removal is in progress.
- `tests/unit/components/skill-full-detail-async-actions.test.tsx` covers the full skill detail duplicate AI Translate, Safety Assessment, Check Updates, Update from Source, personal notes Save, Create Snapshot, Delete confirmation, Install All, Uninstall confirmation, Deploy to Selected Projects, and Remove from Project confirmation regressions with a focused i18n-backed render instead of adding more weight to the large skill smoke file.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: **11 tests**, passing. Existing Vite CJS deprecation and Browserslist age warnings still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx apps/desktop/tests/unit/components/skill-full-detail-async-actions.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx apps/desktop/tests/unit/components/skill-full-detail-async-actions.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Skill full detail action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run -t "keeps header and tab actions"`: failed first after wrapping `SkillFullDetailPage` in an outer form because the full-detail header and tab actions still had implicit submit behavior and visible decorative icons.
- `SkillFullDetailPage` now gives the full-detail Back, project detail, source update, Snapshot, favorite, version history, edit, delete, tab, safety, and Back to Top controls explicit `type="button"` semantics.
- Icon-only header actions now expose localized accessible names through `aria-label`, while decorative header metadata, action, tab, safety, project, and Back to Top icons are hidden from assistive technology.
- The local `SkillFullDetailPage.tsx` button scan now reports no buttons missing an explicit `type`.
- `tests/unit/components/skill-full-detail-async-actions.test.tsx` now also covers full-detail header and tab action non-submit semantics, decorative icon hiding, and outer-form isolation. The file now has **12 tests**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`: **12 tests**, passing. Existing Vite CJS deprecation and Browserslist age warnings still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx apps/desktop/tests/unit/components/skill-full-detail-async-actions.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillFullDetailPage.tsx apps/desktop/tests/unit/components/skill-full-detail-async-actions.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Skill detail view action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-detail-view-timers.test.tsx --run`: failed first after adding the action-semantics regression because the icon-only Close action did not expose an accessible name.
- `SkillDetailView` now gives header, tab, copy/edit, edit-mode, source-open, export, and platform toolbar controls explicit non-submit button semantics and hides decorative action/status icons from assistive technology.
- The platform install target card no longer relies on `div onClick`; uninstalled platform selection is a real button with `aria-pressed`, while installed platform uninstall remains a separate sibling button.
- `tests/unit/components/skill-detail-view-timers.test.tsx` now covers copy timer cleanup, detail action semantics, and platform selection / uninstall action separation.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-detail-view-timers.test.tsx --run`: **3 tests**, passing. Existing Vite CJS deprecation and Browserslist age warnings still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/skill/SkillDetailView.tsx apps/desktop/tests/unit/components/skill-detail-view-timers.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/skill/SkillDetailView.tsx apps/desktop/tests/unit/components/skill-detail-view-timers.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Skill store remote retry follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-remote.test.tsx --run -t "shows retry"`: failed first after wrapping the remote-error state in an outer form because the Retry button had implicit submit behavior.
- `SkillStore` now gives the remote store retry action explicit `type="button"` semantics while preserving the loading disabled state and retry callback.
- `tests/unit/components/skill-store-remote.test.tsx` now verifies the GitHub rate-limit retry action is non-submit and does not submit an outer form.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-remote.test.tsx --run -t "shows retry"`: **1 selected test**, passing. Existing Vite CJS deprecation and expected remote-load error logging still print.
- The local `SkillStore.tsx` button scan now reports no buttons missing an explicit `type`.

## Skill manager action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run -t "renders skill manager actions"`: failed first after wrapping `SkillManager` in an outer form because header toolbar actions had implicit submit behavior.
- `SkillManager` now gives the Batch Manage, gallery/list view, refresh, batch toolbar, and pagination controls explicit `type="button"` semantics.
- Header, batch, and pagination action icons are now hidden from assistive technology, while icon-only gallery/list/refresh and previous/next controls expose stable names through `aria-label`. Page number buttons preserve their numeric accessible names and use `aria-current="page"` for the current page.
- `tests/unit/components/skill-i18n-smoke.test.tsx` now verifies the SkillManager toolbar and batch actions are non-submit controls with decorative icons hidden, and that they do not submit an outer form while preserving the existing selection summary behavior.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run`: **28 tests**, passing. Existing Vite CJS deprecation and Browserslist age warnings still print.
- The local `SkillManager.tsx` button scan now reports no buttons missing an explicit `type`.

## Create skill modal action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run -t "keeps chooser"`: failed first after wrapping `CreateSkillModal` in an outer form because the create-skill chooser actions had implicit submit behavior and the close action had no accessible name.
- `CreateSkillModal` now gives chooser, close, fullscreen, manual editor, AI draft, scan result, rescan, GitHub footer, scan footer, and manual footer controls explicit `type="button"` semantics.
- The close and fullscreen icon-only actions now expose localized accessible names. Decorative chooser, toolbar, scan, GitHub, import, and footer icons are hidden from assistive technology.
- `tests/unit/components/create-skill-modal.test.tsx` now covers chooser and manual-mode action non-submit semantics, decorative icon hiding, and outer-form isolation. The file now has **11 tests**, passing.
- The skill component directory button scan now reports no buttons missing an explicit `type`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run`: **11 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Title bar window control follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/title-bar.test.tsx --run`: failed first after wrapping the Windows `TitleBar` in an outer form because the minimize / maximize / close controls had implicit submit behavior.
- The same focused test then caught a missing localized restore label: after clicking Maximize, the button rendered the raw `common.restore` key.
- `TitleBar` now gives minimize, maximize / restore, and close controls explicit `type="button"` semantics, localized accessible names, and decorative hidden icons. Maximize state now toggles with a functional state update to avoid stale reads on rapid clicks.
- `common.restore` was added to all renderer locales so the Windows restore control no longer falls back to a raw key.
- `tests/unit/components/title-bar.test.tsx` covers Windows-only rendering, window bridge calls, outer-form isolation, decorative icon hiding, and the Maximize to Restore label transition.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/title-bar.test.tsx --run`: **1 test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/i18n-init.test.ts --run`: **4 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Sidebar action semantics follow-up

- The renderer button scan showed `Sidebar.tsx` had 30 remaining implicit-submit buttons across rail navigation, prompt type filters, folder/tag controls, skill store sources, and collapsed tag popovers.
- `Sidebar` now gives rendered navigation, prompt type, folder create, tag collapse/edit/show/clear, tag chip, collapsed tag popover, skill store source, custom store, and skill tag controls explicit `type="button"` semantics.
- Prompt type filters now expose selected state through `aria-pressed`; tag section toggles and collapsed tag buttons expose open state through `aria-expanded`; icon-only close/edit/folder actions have accessible names.
- Decorative navigation, prompt filter, folder, tag, store source, and popover icons are hidden from assistive technology either directly or through an `aria-hidden` wrapper.
- `tests/unit/components/sidebar.test.tsx` now covers rendered Sidebar actions inside an outer form, verifies every rendered button is non-submit, verifies button SVGs are hidden directly or by an aria-hidden ancestor, and confirms common sidebar clicks do not submit the form. The file now has **29 tests**, passing.
- The local `Sidebar.tsx` button scan now reports no buttons missing an explicit `type`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx --run`: **29 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## AI settings action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run -t "keeps configured model"`: failed first after wrapping `AISettings` in an outer form because configured model / provider / translation controls had implicit submit behavior and exposed decorative icons.
- `AISettings` now gives configured chat / image provider groups, model row actions, add/edit form controls, model picker controls, image picker controls, image test result controls, and translation mode choices explicit `type="button"` semantics.
- Provider/category/model/action icons are hidden from assistive technology; icon-only actions expose labels; provider/category groups expose `aria-expanded`; translation mode choices expose `aria-pressed`.
- `tests/unit/components/ai-settings-legacy.test.tsx` covers configured model and translation action non-submit semantics, decorative icon hiding, and outer-form isolation. The file now has **4 tests**, passing.
- The local `AISettings.tsx` button scan now reports no buttons missing an explicit `type`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run -t "keeps configured model"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`: **4 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/AISettings.tsx apps/desktop/tests/unit/components/ai-settings-legacy.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/settings/AISettings.tsx apps/desktop/tests/unit/components/ai-settings-legacy.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Data settings action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "keeps rendered data settings actions"`: failed first after wrapping every `DataSettings` subsection in an outer form because native data-path, recovery, sync, backup, upgrade-backup, and dangerous-action controls still had implicit submit behavior.
- `DataSettings` now gives local data-path actions, recovery scan/path actions, self-hosted / WebDAV / S3 test-upload-download actions, selective/full backup actions, upgrade-backup refresh/delete/restore actions, data-path conflict dialog actions, and clear-data dialog actions explicit `type="button"` semantics.
- Button-contained recovery, sync, backup, refresh, chevron, external-link, and loading icons are hidden from assistive technology so action names come from text or explicit labels instead of decorative glyphs.
- A later selective-export pass failed first because the export-scope rows were
  still non-focusable `div` click targets. The hidden Checkbox inside each row
  exposed a name, but keyboard activation of the row-level card was not
  possible.
- `DataSettings` now renders selective-export scope choices as native
  non-submit buttons with `aria-pressed` selected state. The visual Checkbox is
  hidden from assistive technology so the row has one clear interactive
  surface, while the Media choice still toggles both images and videos.
- `tests/unit/components/data-settings.test.tsx` now covers all rendered DataSettings subsections inside an outer form, verifies every rendered button is non-submit, verifies button SVGs are hidden directly or through an `aria-hidden` ancestor, and verifies keyboard toggling of selective-export scope choices affects the exported payload. The file now has **28 tests**, passing.
- The local `DataSettings.tsx` button scan now reports no buttons missing an explicit `type`.
- The renderer-wide button scan dropped from **174** to **148** missing explicit button types after this pass; the largest remaining files are `CreatePromptModal.tsx` and `EditPromptModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "keeps rendered data settings actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`: **28 tests**, passing. Existing Vite CJS deprecation warning still prints.
- The renderer scan for non-semantic clickable elements dropped from **22** to
  **21** candidates after the selective-export scope rows were moved onto
  native buttons. The renderer-wide title-backed button scan remains
  `buttonTitleWithoutAria=0`.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/AISettings.tsx apps/desktop/tests/unit/components/ai-settings-legacy.test.tsx apps/desktop/src/renderer/components/settings/DataSettings.tsx apps/desktop/tests/unit/components/data-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/settings/AISettings.tsx apps/desktop/tests/unit/components/ai-settings-legacy.test.tsx apps/desktop/src/renderer/components/settings/DataSettings.tsx apps/desktop/tests/unit/components/data-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Prompt modal action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-prompt-modal.test.tsx --run -t "keeps prompt creation actions"`: failed first after wrapping `CreatePromptModal` in an outer form because creation modal actions still had implicit submit behavior.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/edit-prompt-modal.test.tsx --run -t "keeps prompt edit actions"`: failed first after wrapping `EditPromptModal` in an outer form because edit modal actions still had implicit submit behavior.
- `CreatePromptModal` now gives header fullscreen, native fullscreen exit, prompt type, more-settings disclosure, media upload/remove, image URL, bilingual toggle, edit/preview tab, fullscreen editor, tag removal, and user/system editor controls explicit `type="button"` semantics.
- `EditPromptModal` now gives header fullscreen, native fullscreen exit, prompt type, AI rewrite template, more-settings disclosure, media upload/remove, image URL, tag removal, translation, bilingual toggle, and user/system fullscreen controls explicit `type="button"` semantics.
- Button-contained media, prompt-type, disclosure, fullscreen, save, rewrite, translation, tag, and loading icons are hidden from assistive technology; icon-only remove/fullscreen controls expose accessible labels; disclosure and tab-style controls expose `aria-expanded`, `aria-pressed`, or both where relevant.
- `tests/unit/components/create-prompt-modal.test.tsx` and `tests/unit/components/edit-prompt-modal.test.tsx` now cover the modal actions inside an outer form, expand the deeper settings/media surfaces, verify every rendered button is non-submit, verify button SVGs are decorative, and assert common type-switch clicks do not submit the outer form. The files now have **4 tests** combined, passing.
- The local `CreatePromptModal.tsx` and `EditPromptModal.tsx` button scans now report no buttons missing an explicit `type`.
- The renderer-wide button scan dropped from **148** to **110** missing explicit button types after this pass; the largest remaining file is `AiTestModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-prompt-modal.test.tsx --run -t "keeps prompt creation actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/edit-prompt-modal.test.tsx --run -t "keeps prompt edit actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-prompt-modal.test.tsx tests/unit/components/edit-prompt-modal.test.tsx --run`: **2 files / 4 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/CreatePromptModal.tsx apps/desktop/src/renderer/components/prompt/EditPromptModal.tsx apps/desktop/tests/unit/components/create-prompt-modal.test.tsx apps/desktop/tests/unit/components/edit-prompt-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/prompt/CreatePromptModal.tsx apps/desktop/src/renderer/components/prompt/EditPromptModal.tsx apps/desktop/tests/unit/components/create-prompt-modal.test.tsx apps/desktop/tests/unit/components/edit-prompt-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## AI test modal action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run -t "keeps AI test actions"`: failed first after wrapping `AiTestModal` in an outer form because AI test workbench actions exposed decorative icons to assistive technology and still had implicit-submit controls in rendered mode/output/model/action surfaces.
- `AiTestModal` now gives single / compare / image mode selectors, output format choices, run single, run compare, run image generation, model chips, generated-image add/download actions, and existing reference image selection explicit `type="button"` semantics.
- Header expand / close, uploaded image removal, generated image download, and other icon-heavy actions now expose accessible labels where needed while button-contained icons are hidden from assistive technology. Mode, output-format, model, and reference-image choices expose selected state through `aria-pressed`.
- `tests/unit/components/ai-test-workbench.test.tsx` now covers text and image prompt workbench actions inside an outer form, verifies rendered buttons are non-submit, verifies button SVGs are decorative, verifies compare mode state, exercises generated-image actions, and confirms image-test clicks do not submit the outer form. The file now has **14 tests**, passing.
- The local `AiTestModal.tsx` button scan now reports no buttons missing an explicit `type`.
- The renderer-wide button scan dropped from **110** to **97** missing explicit button types after this pass; the largest remaining file is `MainContent.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run -t "keeps AI test actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run`: **14 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/AiTestModal.tsx apps/desktop/tests/unit/components/ai-test-workbench.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/prompt/AiTestModal.tsx apps/desktop/tests/unit/components/ai-test-workbench.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Main content detail action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-inline-edit.integration.test.tsx --run -t "keeps selected prompt detail actions"`: failed first after wrapping `MainContent` in an outer form because selected prompt detail actions still had implicit submit behavior.
- `MainContent` now gives selected prompt detail favorite, share, English toggle, compare, AI response copy, generated image preview/download, bottom copy, AI test, version history, delete, inline edit, and tag controls explicit non-submit button semantics.
- Button-contained detail icons are hidden from assistive technology. Favorite and English toggle controls expose pressed state, and icon-only share/copy/generated-image actions expose stable labels.
- The run also caught `PromptTableView` pagination controls rendered through `MainContent`; previous, page-number, and next buttons now have explicit `type="button"` semantics.
- The selected prompt remove-tag label now strips the untranslated `{{tag}}` placeholder before appending the concrete tag name, preventing accessible names such as `Remove tag {{tag}}: tag-a`.
- `tests/integration/components/main-content-inline-edit.integration.test.tsx` now verifies rendered MainContent actions inside an outer form, checks every rendered button is non-submit, checks button SVGs are decorative, and confirms a representative action does not submit the outer form.
- The local `MainContent.tsx` and `PromptTableView.tsx` button scans now report no buttons missing an explicit `type`; the local `MainContent.tsx` button-icon scan reports no visible lucide icons inside native buttons.
- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-inline-edit.integration.test.tsx --run -t "keeps selected prompt detail actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-inline-edit.integration.test.tsx --run`: **15 tests**, passing. Existing Vite CJS deprecation warning still prints.

## Main content prompt-card selection follow-up

- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-selection-restore.integration.test.tsx --run`:
  failed first after adding a keyboard selection regression because prompt
  cards in the card-mode prompt list were still non-focusable `div` click
  targets, so they could not be found or activated as buttons.
- `MainContent` now renders prompt cards as native non-submit buttons with
  `aria-pressed` selected state and focus-visible styling. The existing click,
  right-click context menu, Ctrl/Cmd multi-select, and Shift selection paths
  keep using the same selection handler.
- Prompt-card pin, image-type, and favorite icons are now decorative to
  assistive technology; the prompt title remains the button's accessible name.
- `tests/integration/components/main-content-selection-restore.integration.test.tsx`
  now verifies a rendered prompt card is a native button and that Enter and
  Space both select the prompt through the real `MainContent` store wiring.
- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-selection-restore.integration.test.tsx --run`:
  **3 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-large-dataset.integration.test.tsx --run`:
  **1 test**, passing, confirming prompt-list virtualization still renders and
  measures the full mocked dataset after the card surface change.
- The renderer scan for non-semantic clickable elements dropped from **24** to
  **23** candidates after the prompt card primary click target was moved onto a
  native button. The renderer-wide title-backed button scan remains
  `buttonTitleWithoutAria=0`.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/layout/MainContent.tsx apps/desktop/tests/integration/components/main-content-selection-restore.integration.test.tsx`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/layout/MainContent.tsx apps/desktop/tests/integration/components/main-content-selection-restore.integration.test.tsx`: no matches.

## Update dialog action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/update-dialog.test.tsx --run -t "keeps rendered update actions"`: failed first after rendering `UpdateDialog` through its modal portal because visible update actions still had implicit submit behavior and exposed decorative SVG icons.
- `UpdateDialog` now gives manual backup, check update, download update, open releases, later, install, open download folder, SHA512 recovery, manual download, and header refresh controls explicit `type="button"` semantics.
- Button-contained refresh, download, external-link, folder, and loading icons are hidden from assistive technology so action names come from text or explicit labels instead of decorative glyphs.
- `tests/unit/components/update-dialog.test.tsx` now verifies rendered portal buttons are non-submit, verifies button SVGs are decorative, and confirms a representative action does not submit a surrounding form.
- The local `UpdateDialog.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/update-dialog.test.tsx --run -t "keeps rendered update actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/update-dialog.test.tsx --run`: **6 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Top bar action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run -t "keeps top bar actions"`: failed first after wrapping `TopBar` in an outer form and opening the create-menu portal because update, split-create, create-menu, and theme actions still had implicit submit behavior and exposed decorative SVG icons.
- `TopBar` now gives the update prompt, split-create primary action, create-menu toggle, create-menu actions, theme toggle, and web sign-out controls explicit `type="button"` semantics.
- Button-contained panel, search navigation, clear, update, create, menu, theme, and sign-out icons are hidden from assistive technology. The create-menu toggle and theme toggle now expose stable labels.
- `tests/unit/components/top-bar.test.tsx` now verifies rendered TopBar and create-menu portal buttons are non-submit, verifies button SVGs are decorative, and confirms the update action does not submit a surrounding form.
- The local `TopBar.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run -t "keeps top bar actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`: **16 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Skill settings action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-settings.test.tsx --run -t "keeps rendered skill setting actions"`: failed first after wrapping `SkillSettings` and `SkillSafetySettingsSection` in an outer form because install-method, platform-order, agent configuration, and safety controls still had implicit submit behavior and exposed decorative SVG icons.
- `SkillSettings` now gives GitHub token visibility, install method, platform-order reset / move, built-in agent edit/save/cancel/reset, custom agent add/browse/save/cancel/edit/delete/browse, and safety scan controls explicit non-submit button semantics.
- Install method and safety toggle choices now expose selected state through `aria-pressed`; platform move and toggle controls have stable accessible names; button-contained action icons are hidden from assistive technology.
- `tests/unit/components/skill-settings.test.tsx` now verifies rendered skill settings actions inside an outer form, checks every rendered button is non-submit, checks button SVGs are decorative, and confirms a representative install-method click does not submit the outer form.
- The local `SkillSettings.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **64** to **56** missing explicit button types after this pass; the largest remaining files are `PromptKanbanView.tsx`, `VersionHistoryModal.tsx`, `SettingsModal.tsx`, `SecuritySettings.tsx`, and `AppearanceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-settings.test.tsx --run -t "keeps rendered skill setting actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-settings.test.tsx --run`: **11 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Prompt kanban action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-kanban-view.test.tsx --run -t "keeps rendered kanban actions"`: failed first after wrapping `PromptKanbanView` in an outer form because card pin, favorite, copy, edit, and AI test controls still had implicit submit behavior.
- `PromptKanbanView` now gives pinned card expand / unpin and unpinned card pin / favorite / copy / edit / AI test controls explicit `type="button"` semantics.
- Card favorite controls expose selected state through `aria-pressed`; pinned card expand controls expose `aria-expanded`; existing button-contained icons remain hidden from assistive technology.
- `tests/unit/components/prompt-kanban-view.test.tsx` now verifies rendered kanban actions inside an outer form, checks every rendered button is non-submit, checks button SVGs are decorative, and confirms a representative copy click does not submit the outer form. The file now has **5 tests**, passing.
- The local `PromptKanbanView.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **56** to **49** missing explicit button types after this pass; the largest remaining files are `VersionHistoryModal.tsx`, `SettingsModal.tsx`, `SecuritySettings.tsx`, and `AppearanceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-kanban-view.test.tsx --run -t "keeps rendered kanban actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-kanban-view.test.tsx --run`: **5 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Prompt version history action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-version-history-modal.test.tsx --run -t "keeps rendered version history actions"`: failed first after rendering a deletable history version because version timeline buttons, Compare, Delete, Cancel, and Restore actions still had implicit submit behavior, and Compare / Delete / Restore exposed decorative SVG icons.
- `VersionHistoryModal` now gives version timeline, Compare / Exit Compare, Delete, Cancel, and Restore controls explicit `type="button"` semantics.
- Detail / Compare / Table view controls and version timeline buttons expose selection through `aria-pressed`; button-contained view, compare, delete, and restore icons are hidden from assistive technology.
- Existing variable snapshot derivation was kept on the shared `parsePromptVariables()` path so default-value variables such as `{{ topic : release notes }}` normalize consistently with prompt editing and table diff views.
- `tests/unit/components/prompt-version-history-modal.test.tsx` now verifies rendered version history actions are non-submit, checks button SVGs are decorative, and keeps coverage for deleting non-initial versions, table field diffs, and default-value variable normalization. The file now has **6 tests**, passing.
- The local `VersionHistoryModal.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **49** to **44** missing explicit button types after this pass; the largest remaining files are `SettingsModal.tsx`, `SecuritySettings.tsx`, and `AppearanceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-version-history-modal.test.tsx --run -t "keeps rendered version history actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-version-history-modal.test.tsx --run`: **6 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Settings modal action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/settings-modal.test.tsx --run`: failed first because the legacy settings modal's theme, language, auto-save, export, and import controls still had implicit submit behavior, and theme option icons were exposed to assistive technology.
- `SettingsModal` now gives theme, language, auto-save, export, and import controls explicit `type="button"` semantics.
- Theme and language options expose selected state through `aria-pressed`; the auto-save toggle exposes `role="switch"` with `aria-checked`; decorative section and option icons are hidden from assistive technology.
- `tests/unit/components/settings-modal.test.tsx` now verifies rendered modal controls are non-submit, button SVGs are decorative, selected theme state updates, and the Done action still closes the modal.
- The local `SettingsModal.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **44** to **39** missing explicit button types after this pass; the largest remaining files are `SecuritySettings.tsx` and `AppearanceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/settings-modal.test.tsx --run`: **1 test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Security settings action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/security-settings.test.tsx --run -t "keeps rendered security actions"`: failed first after wrapping `SecuritySettings` in an outer form because Set Master Password was still an implicit submit action. The same source scan showed Unlock, Lock, Change Password, and Confirm Change were also missing explicit `type="button"` semantics.
- `SecuritySettings` now gives set-master-password, unlock, lock, change-password disclosure, and confirm-change controls explicit non-submit button semantics.
- The change-password disclosure exposes `aria-expanded`; the decorative security status key icon is hidden from assistive technology; existing password fields keep explicit accessible labels.
- `tests/unit/components/security-settings.test.tsx` now renders the unconfigured, configured-locked, and configured-unlocked security states inside an outer form, checks every rendered button is non-submit, checks button SVGs are decorative, verifies the change-password disclosure state, and confirms representative security actions do not submit the outer form. The file now has **8 tests**, passing.
- The local `SecuritySettings.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **39** to **34** missing explicit button types after this pass; the largest remaining file is `AppearanceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/security-settings.test.tsx --run -t "keeps rendered security actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/security-settings.test.tsx --run`: **8 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Appearance settings action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/appearance-settings.test.tsx --run -t "keeps rendered appearance actions"`: failed first after wrapping `AppearanceSettings` in an outer form because theme, color, font-size, and motion controls still had implicit submit behavior, and theme / selected color icons were exposed to assistive technology.
- `AppearanceSettings` now gives theme mode, theme color, custom color, font size, and motion controls explicit non-submit button semantics.
- Theme mode, theme color, custom color, font size, and motion controls expose selected state through `aria-pressed`; font-size buttons expose readable labels such as `Medium, 16px` instead of the concatenated `Medium16px`; decorative drag, empty-preview, theme, checkmark, background, and slider icons are hidden from assistive technology.
- `tests/unit/components/appearance-settings.test.tsx` now verifies rendered appearance settings actions inside an outer form, checks every rendered button is non-submit, checks button SVGs are decorative, verifies selected theme / color / font / motion state, and confirms a representative background toggle does not submit the outer form. The file now has **6 tests**, passing.
- The local `AppearanceSettings.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **34** to **29** missing explicit button types after this pass; the largest remaining file is `ImagePromptReverseModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/appearance-settings.test.tsx --run -t "keeps rendered appearance actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/appearance-settings.test.tsx --run`: **5 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Image prompt reverse action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run -t "keeps rendered image reverse actions"`: failed first after wrapping `ImagePromptReverseModal` in an outer form because the header close, footer cancel, reverse, and create controls still had implicit submit behavior.
- `ImagePromptReverseModal` now gives header close, footer cancel, reverse / regenerate, and create controls explicit `type="button"` semantics.
- The icon-only header close control now has a localized accessible name; decorative header, upload, select-image, type badge, copy, folder, loading, and save icons are hidden from assistive technology.
- `tests/unit/components/image-prompt-reverse-modal.test.tsx` now verifies rendered image reverse actions inside an outer form, checks every rendered native button is non-submit, checks button SVGs are decorative, and confirms copy/create clicks do not submit the outer form. The file now has **19 tests**, passing.
- The local `ImagePromptReverseModal.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **29** to **25** missing explicit button types after this pass; the largest remaining files are `QuickAddModal.tsx`, `VariableInputModal.tsx`, `SettingsPage.tsx`, and `WebWorkspaceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run -t "keeps rendered image reverse actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-prompt-reverse-modal.test.tsx --run`: **19 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/ImagePromptReverseModal.tsx apps/desktop/tests/unit/components/image-prompt-reverse-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/prompt/ImagePromptReverseModal.tsx apps/desktop/tests/unit/components/image-prompt-reverse-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Quick add action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/quick-add-modal.test.tsx --run -t "keeps quick-add actions"`: failed first after wrapping `QuickAddModal` in an outer form because the header close, footer cancel, and create controls still had implicit submit behavior.
- `QuickAddModal` now gives header close, footer cancel, and create controls explicit `type="button"` semantics.
- Header, close, prompt-type, smart-folder, folder, and loading icons are hidden from assistive technology so button names come from text or explicit labels instead of decorative glyphs.
- `tests/unit/components/quick-add-modal.test.tsx` now verifies rendered quick-add actions inside an outer form, checks every rendered native button is non-submit, checks button SVGs are decorative, verifies prompt-type state remains clickable, and confirms representative quick-add clicks do not submit the outer form. The file now has **4 tests**, passing.
- The local `QuickAddModal.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **25** to **22** missing explicit button types after this pass; the largest remaining files are `VariableInputModal.tsx`, `SettingsPage.tsx`, and `WebWorkspaceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/quick-add-modal.test.tsx --run -t "keeps quick-add actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/quick-add-modal.test.tsx --run`: **4 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/QuickAddModal.tsx apps/desktop/tests/unit/components/quick-add-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/prompt/QuickAddModal.tsx apps/desktop/tests/unit/components/quick-add-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Variable input action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/variable-input-modal.test.tsx --run -t "keeps AI test variable actions"`: failed first after wrapping `VariableInputModal` in an outer form because the output format controls only exposed selected state through color and still had implicit submit behavior.
- `VariableInputModal` now gives Text / JSON / Schema output format controls explicit `type="button"` semantics and `aria-pressed` selection state.
- The image attachment remove control now has an explicit accessible name, and variable, history, image, remove, copy, copied, loading, and AI-test icons are hidden from assistive technology.
- `tests/unit/components/variable-input-modal.test.tsx` now verifies rendered AI-test variable actions inside an outer form, checks every rendered native button is non-submit, checks output format pressed state, checks button SVGs are decorative, exercises image attachment removal, and confirms representative clicks do not submit the outer form. The file now has **9 tests**, passing.
- The local `VariableInputModal.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **22** to **19** missing explicit button types after this pass; the largest remaining files are `SettingsPage.tsx` and `WebWorkspaceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/variable-input-modal.test.tsx --run -t "keeps AI test variable actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/variable-input-modal.test.tsx --run`: **9 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/prompt/VariableInputModal.tsx apps/desktop/tests/unit/components/variable-input-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/prompt/VariableInputModal.tsx apps/desktop/tests/unit/components/variable-input-modal.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Settings page navigation semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/settings-page.test.tsx --run -t "keeps settings navigation actions"`: failed first after wrapping `SettingsPage` in an outer form because settings navigation only exposed selected state through color and its native buttons still had implicit submit behavior.
- `SettingsPage` now gives the Back control, primary settings navigation, and Data subsection navigation explicit `type="button"` semantics.
- Primary settings navigation and Data subsection navigation now expose active state through `aria-pressed`; decorative navigation icons are hidden from assistive technology.
- `tests/unit/components/settings-page.test.tsx` now verifies rendered settings navigation inside an outer form, checks every rendered native button is non-submit, checks active state for primary and subsection navigation, checks button SVGs are decorative, and confirms representative navigation clicks do not submit the outer form. The file now has **9 tests**, passing.
- The local `SettingsPage.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **19** to **16** missing explicit button types after this pass; the largest remaining file is `WebWorkspaceSettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/settings-page.test.tsx --run -t "keeps settings navigation actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/settings-page.test.tsx --run`: **9 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/SettingsPage.tsx apps/desktop/tests/unit/components/settings-page.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/settings/SettingsPage.tsx apps/desktop/tests/unit/components/settings-page.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Web workspace navigation semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-workspace-settings.test.tsx --run -t "keeps workspace navigation cards"`: failed first after wrapping `WebWorkspaceSettings` in an outer form because the Device Management, Data & Sync, and Model Services navigation cards still had implicit submit behavior.
- `WebWorkspaceSettings` now gives self-hosted workspace navigation cards explicit `type="button"` semantics.
- Self-hosted workspace status, navigation, and password-section icons are hidden from assistive technology so they remain visual affordances instead of duplicate readable content.
- `tests/unit/components/web-workspace-settings.test.tsx` now verifies rendered workspace navigation cards inside an outer form, checks every rendered native button is non-submit, checks button SVGs are decorative, confirms navigation destinations, and confirms representative card clicks do not submit the outer form. The file now has **2 tests**, passing.
- The local `WebWorkspaceSettings.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **16** to **13** missing explicit button types after this pass; the largest remaining groups are `ImportPromptModal.tsx`, `SortableTreeItem.tsx`, `AboutSettings.tsx`, `WebDeviceSettings.tsx`, and `DataRecoveryDialog.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-workspace-settings.test.tsx --run -t "keeps workspace navigation cards"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-workspace-settings.test.tsx --run`: **2 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/WebWorkspaceSettings.tsx apps/desktop/tests/unit/components/web-workspace-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/settings/WebWorkspaceSettings.tsx apps/desktop/tests/unit/components/web-workspace-settings.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`: no matches.

## Import prompt action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/import-prompt-modal.test.tsx --run -t "keeps import actions"`: failed first after wrapping `ImportPromptModal` in an outer form because Cancel and Import still had implicit submit behavior.
- `ImportPromptModal` now gives Cancel and Import explicit `type="button"` semantics.
- The detected-prompt and import icons are hidden from assistive technology so action names come from text / labels instead of decorative glyphs.
- `tests/unit/components/import-prompt-modal.test.tsx` now verifies rendered import actions inside an outer form, checks every rendered native button is non-submit, checks button SVGs are decorative, and confirms import/cancel clicks do not submit the outer form. The file now has **7 tests**, passing.
- The local `ImportPromptModal.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **13** to **11** missing explicit button types after this pass; the largest remaining groups are `SortableTreeItem.tsx`, `AboutSettings.tsx`, `WebDeviceSettings.tsx`, and `DataRecoveryDialog.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/import-prompt-modal.test.tsx --run -t "keeps import actions"`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/import-prompt-modal.test.tsx --run`: **7 tests**, passing. Existing Vite CJS deprecation warning still prints.

## About settings action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/about-settings.test.tsx -t "keeps rendered about actions" --run`: failed first after wrapping `AboutSettings` in an outer form because the desktop Check for Updates control still had implicit submit behavior.
- `AboutSettings` now gives desktop and web update-check controls explicit `type="button"` semantics.
- Decorative update, repository, issue, copy, contact, and external-link icons are hidden from assistive technology so link / button names come from visible text or explicit labels.
- `tests/unit/components/about-settings.test.tsx` now verifies rendered about-page actions inside an outer form, checks every rendered native button is non-submit, checks button SVGs are decorative, and confirms representative update / copy clicks do not submit the outer form. The file now has **6 tests**, passing.
- The local `AboutSettings.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **11** to **9** missing explicit button types after this pass; the largest remaining groups are `SortableTreeItem.tsx`, `WebDeviceSettings.tsx`, and `DataRecoveryDialog.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/about-settings.test.tsx -t "keeps rendered about actions" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/about-settings.test.tsx --run`: **6 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Web device settings action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-device-settings.test.tsx -t "keeps rendered device actions" --run`: failed first after wrapping `WebDeviceSettings` in an outer form because Refresh and Sign Out still had implicit submit behavior.
- `WebDeviceSettings` now gives Refresh and Sign Out explicit `type="button"` semantics.
- Decorative user, client, refresh, device, store, and logout icons are hidden from assistive technology so labels stay text-driven.
- `tests/unit/components/web-device-settings.test.tsx` now verifies rendered device settings actions inside an outer form, checks every rendered native button is non-submit, checks button SVGs are decorative, and confirms representative refresh / sign-out clicks do not submit the outer form. The file now has **2 tests**, passing.
- The local `WebDeviceSettings.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **9** to **7** missing explicit button types after this pass; the remaining groups are `SortableTreeItem.tsx`, `DataRecoveryDialog.tsx`, `FolderModal.tsx`, `PrivateFolderUnlockModal.tsx`, and `settings/shared.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-device-settings.test.tsx -t "keeps rendered device actions" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/web-device-settings.test.tsx --run`: **2 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Shortcut settings shared action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/shortcuts-settings.test.tsx -t "keeps rendered shortcut actions" --run`: failed first after wrapping `ShortcutsSettings` in an outer form because all rendered clear-shortcut controls still had implicit submit behavior.
- Shared `ShortcutItem` now gives clear-shortcut controls explicit `type="button"` semantics.
- The conflict warning icon is hidden from assistive technology, matching the existing decorative treatment for clear icons and avoiding duplicate icon content in the shortcut row.
- `tests/unit/components/shortcuts-settings.test.tsx` now verifies rendered shortcut actions inside an outer form, checks every rendered native button is non-submit, checks button SVGs are decorative, and confirms clearing a shortcut does not submit the outer form. The file now has **8 tests**, passing.
- The local `settings/shared.tsx` scan now reports no buttons missing an explicit `type` and no visible lucide icons inside native buttons.
- The renderer-wide button scan dropped from **7** to **6** missing explicit button types after this pass; the remaining groups are `SortableTreeItem.tsx`, `DataRecoveryDialog.tsx`, `FolderModal.tsx`, and `PrivateFolderUnlockModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/shortcuts-settings.test.tsx -t "keeps rendered shortcut actions" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/shortcuts-settings.test.tsx --run`: **8 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Data recovery dialog action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-recovery-dialog.test.tsx -t "keeps rendered recovery actions" --run`: failed first after wrapping `DataRecoveryDialog` in an outer form because Start Fresh and Restore Selected Source still had implicit submit behavior.
- `DataRecoveryDialog` now gives recovery footer actions explicit `type="button"` semantics.
- Decorative success, timestamp, count, preview, overwrite-warning, and error icons are hidden from assistive technology so recovery status and warnings are exposed through text.
- `tests/unit/components/data-recovery-dialog.test.tsx` now verifies rendered recovery actions inside an outer form, checks every rendered native button is non-submit, checks all rendered SVGs are decorative, and confirms representative recovery clicks do not submit the outer form. The file now has **5 tests**, passing.
- The local `DataRecoveryDialog.tsx` scan now reports no buttons missing an explicit `type`; the rendered regression checks all SVG exposure directly.
- The renderer-wide button scan dropped from **6** to **4** missing explicit button types after this pass; the remaining groups are `SortableTreeItem.tsx`, `FolderModal.tsx`, and `PrivateFolderUnlockModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-recovery-dialog.test.tsx -t "keeps rendered recovery actions" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-recovery-dialog.test.tsx --run`: **5 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Folder modal action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/folder-modal.test.tsx -t "keeps folder modal controls" --run`: failed first because the header close control had no accessible name and no explicit button type.
- `FolderModal` now gives the header close control an explicit localized accessible name and `type="button"` semantics.
- Decorative close, parent disclosure, parent folder, private-lock, delete, and warning icons are hidden from assistive technology.
- `tests/unit/components/folder-modal.test.tsx` now verifies rendered folder modal buttons have explicit `button` or `submit` types, checks button SVGs are decorative, and confirms the named Close action closes the modal. The file now has **2 tests**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/folder-modal.test.tsx -t "keeps folder modal controls" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.

## Private folder unlock modal action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/private-folder-unlock-modal.test.tsx -t "keeps unlock actions" --run`: failed first because the header close control had no accessible name and no explicit button type.
- `PrivateFolderUnlockModal` now gives the header close control an explicit localized accessible name and `type="button"` semantics.
- The title lock and close icons are hidden from assistive technology.
- `tests/unit/components/private-folder-unlock-modal.test.tsx` now verifies rendered unlock actions inside an outer form, checks every native button is non-submit, checks button SVGs are decorative, and confirms Close / Cancel do not submit the outer form. The file now has **1 test**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/private-folder-unlock-modal.test.tsx -t "keeps unlock actions" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.

## Sortable tree item action semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sortable-tree-item.test.tsx -t "keeps tree item actions" --run`: failed first after wrapping `SortableTreeItem` in an outer form because the expand and edit controls still had implicit submit behavior.
- `SortableTreeItem` now gives expand / collapse and edit controls explicit `type="button"` semantics, localized accessible names, and `aria-expanded` for the disclosure control.
- Decorative chevron, lock, and more-action icons are hidden from assistive technology.
- A later folder-selection pass failed first because the folder content surface
  was still a non-focusable `div` click target. Keyboard users could activate
  expand / edit but could not select a folder from the tree item itself.
- `SortableTreeItem` now renders the folder content as a native non-submit
  button with selected state exposed through `aria-pressed`, focus-visible
  styling, and pointer-down propagation stopped so folder selection does not
  accidentally start a drag interaction.
- `tests/unit/components/sortable-tree-item.test.tsx` now mocks dnd-kit and
  verifies rendered tree item actions inside an outer form, checks every native
  button is non-submit, checks button SVGs are decorative, confirms expand /
  edit clicks do not submit the outer form, and verifies Enter / Space select
  the folder without triggering expand or edit. The file now has **2 tests**,
  passing.
- The local `SortableTreeItem.tsx` scan now reports no buttons missing an explicit `type`.
- The renderer-wide button scan dropped from **4** to **0** missing explicit button types after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sortable-tree-item.test.tsx -t "keeps tree item actions" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sortable-tree-item.test.tsx tests/unit/components/sortable-tree-timers.test.tsx tests/unit/components/folder-modal.test.tsx tests/unit/components/private-folder-unlock-modal.test.tsx --run`: **7 tests**, passing. Existing Vite CJS deprecation warning still prints.
- The renderer scan for non-semantic clickable elements dropped from **23** to
  **22** candidates after the folder content click target was moved onto a
  native button. The renderer-wide title-backed button scan remains
  `buttonTitleWithoutAria=0`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sortable-tree-item.test.tsx --run`: **2 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## AI workbench endpoints section icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-endpoints-section.test.tsx -t "keeps endpoint action icons" --run`: failed first after wrapping `EndpointsSection` in an outer form because rendered endpoint navigation, provider, connection-test, credential, model, and row action buttons exposed decorative SVG icons to assistive technology.
- `EndpointsSection` now hides decorative route, settings, search, add, status, test, edit, credential, fetch, default, and delete icons from assistive technology while keeping labels and existing `aria-label` values as the accessible source of truth.
- `tests/unit/components/ai-workbench-endpoints-section.test.tsx` now renders a minimal endpoint/model group, checks every rendered button is non-submit, checks all button SVGs are decorative, and confirms representative add-provider / test-default / set-default clicks do not submit the outer form. The file has **1 test**, passing.
- The local `EndpointsSection.tsx` button SVG scan now reports no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **101** to **87** after this pass; the remaining largest groups are `SkillProjectsView.tsx`, `SkillAgentsView.tsx`, `RulesManager.tsx`, and `CreateSkillModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-endpoints-section.test.tsx -t "keeps endpoint action icons" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check -- apps/desktop/src/renderer/components/settings/ai-workbench/EndpointsSection.tsx apps/desktop/tests/unit/components/ai-workbench-endpoints-section.test.tsx`: clean.
- `rg -n "[ \t]+$" apps/desktop/src/renderer/components/settings/ai-workbench/EndpointsSection.tsx apps/desktop/tests/unit/components/ai-workbench-endpoints-section.test.tsx`: no matches.

## Skill projects view icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx -t "keeps project action icons" --run`: failed first after wrapping `SkillProjectsView` in an outer form because rendered project header, detail, card, import, and project-form buttons exposed decorative SVG icons to assistive technology.
- `SkillProjectsView` now hides decorative folder, add, refresh, edit, delete, status, library, distribute, import, and loading icons from assistive technology while preserving labels from visible text, `aria-label`, or title-backed icon button names.
- `tests/unit/components/skill-projects-view.test.tsx` now verifies rendered project actions inside an outer form, opens the project form to cover modal controls, checks every rendered native button is non-submit, checks all button SVGs are decorative, and confirms representative add-project / refresh / import clicks do not submit the outer form. The file has **25 tests**, passing.
- The local `SkillProjectsView.tsx` button SVG scan now reports no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **87** to **71** after this pass; the remaining largest groups are `SkillAgentsView.tsx`, `RulesManager.tsx`, `CreateSkillModal.tsx`, and `RulesSidebarPanel.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx -t "keeps project action icons" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning and Browserslist age notice still print.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx --run`: **25 tests**, passing. Existing Vite CJS deprecation warning and Browserslist age notice still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Skill agents view icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-agents-view.test.tsx -t "keeps agent action icons" --run`: failed first after wrapping `SkillAgentsView` in an outer form because the agent platform button accessible name included the decorative platform image alt text (`claude icon`) and rendered agent action buttons exposed decorative SVG icons.
- `PlatformIcon` now accepts standard span attributes, including `aria-hidden`, so callers can mark platform art decorative without losing the shared icon sizing and image fallback behavior.
- `SkillAgentsView` now hides decorative settings, refresh, platform, loading, managed-status, folder, library, import, uninstall, and install icons from assistive technology while preserving button names from visible text, `aria-label`, or title-backed icon button names.
- `tests/unit/components/skill-agents-view.test.tsx` now verifies rendered agent actions inside an outer form, checks every rendered native button is non-submit, checks all button SVGs are decorative, confirms the agent platform button name is not polluted by the platform image alt text, and confirms representative manage / open-folder clicks do not submit the outer form. The file has **15 tests**, passing.
- The local `SkillAgentsView.tsx` button SVG scan now reports no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **71** to **61** after this pass; the remaining largest groups are `RulesManager.tsx`, `CreateSkillModal.tsx`, `RulesSidebarPanel.tsx`, and `SkillFullDetailPage.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-agents-view.test.tsx -t "keeps agent action icons" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning and Browserslist age notice still print.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-agents-view.test.tsx --run`: **15 tests**, passing. Existing Vite CJS deprecation warning, Browserslist age notice, and pre-existing `SkillFullDetailPage` `act(...)` warnings still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Rules manager icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx -t "keeps rules manager actions" --run`: failed first after wrapping `RulesManager` in an outer form and opening a version snapshot because the open-location, snapshot back/restore, AI rewrite, version delete, and history disclosure buttons exposed decorative SVG icons to assistive technology.
- `RulesManager` now hides decorative open-location, back, restore, save, AI, delete, and history disclosure icons from assistive technology while preserving action names from visible text or existing `aria-label` values.
- `tests/unit/components/rules-manager.test.tsx` now verifies rendered rules workbench actions inside an outer form, exercises draft and snapshot-preview controls, checks every rendered native button is non-submit, checks button SVGs are decorative, and confirms representative back/open-location clicks do not submit the outer form. The file has **8 tests**, passing.
- The local `RulesManager.tsx` button SVG scan now reports no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **61** to **54** after this pass; the remaining largest groups were `CreateSkillModal.tsx`, `RulesSidebarPanel.tsx`, `SkillFullDetailPage.tsx`, and `SkillFileEditor.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx -t "keeps rules manager actions" --run`: **1 selected test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx --run`: **8 tests**, passing. Existing Vite CJS deprecation warning still prints.

## Create skill modal result-card icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx -t "scans only|scans a GitHub" --run`: failed first after tightening the existing local-scan and GitHub-scan result tests because scan result cards, select-all controls, optional tag toggles, and tag remove buttons still exposed decorative SVG icons.
- `CreateSkillModal` now hides decorative file, checkbox, hash, and remove icons in GitHub result cards, local scan result cards, optional scan tags, and manual tag controls while preserving labels and selected state through text, visual state, and existing button behavior.
- `tests/unit/components/create-skill-modal.test.tsx` now checks rendered button SVG exposure after both GitHub repository scanning and user-selected local folder scanning, extending the existing chooser/manual non-submit regression coverage. The file has **11 tests**, passing.
- The local `CreateSkillModal.tsx` button SVG scan now reports no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **54** to **47** after this pass; the remaining largest groups are `RulesSidebarPanel.tsx`, `SkillFullDetailPage.tsx`, `SkillFileEditor.tsx`, `PlatformWorkbenchPrototype.tsx`, and `AISettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx -t "scans only|scans a GitHub" --run`: **2 selected tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run`: **11 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Rules sidebar panel icon semantics follow-up

- `RulesSidebarPanel` now hides decorative refresh, disclosure, create-folder,
  platform, remove, and add icons from assistive technology while preserving
  action names from visible text or existing labels.
- `tests/unit/components/rules-sidebar-panel.test.tsx` renders the extracted
  rules sidebar panel inside an outer form, verifies every native button is
  non-submit, verifies all button-contained SVGs are decorative, checks the
  platform button name is not polluted by platform artwork, and confirms
  representative rescan / select / remove actions do not submit the form.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-sidebar-panel.test.tsx --run`:
  **1 test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx -t "rules sidebar|selected rule|Project Rules" --run`:
  selected Sidebar rules coverage passed. Existing Vite CJS deprecation warning
  still prints.

## Skill full detail residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx -t "keeps header and tab actions" --run`:
  failed first after opening personal notes, snapshot, and safety controls
  because a rendered snapshot / notes `SaveIcon` was still exposed to assistive
  technology.
- `SkillFullDetailPage` now gives personal-notes save / cancel / edit icon
  buttons explicit accessible labels and hides their loader, save, cancel, and
  edit icons from assistive technology.
- Snapshot-modal create buttons and the safety rescan button now hide their
  decorative save / refresh icons while preserving visible text labels and
  existing action behavior.
- `tests/unit/components/skill-full-detail-async-actions.test.tsx` now opens the
  preview-only personal notes controls before switching tabs, opens the snapshot
  modal, switches to Safety Assessment, and checks all rendered buttons for
  explicit non-submit semantics plus decorative button SVGs.
- The local `SkillFullDetailPage.tsx` button SVG scan now reports no exposed
  button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **42** before
  this follow-up group to **37** after the `RulesSidebarPanel` and
  `SkillFullDetailPage` passes; the remaining largest groups are
  `SkillFileEditor.tsx`, `PlatformWorkbenchPrototype.tsx`, `AISettings.tsx`,
  `TopBarRulesSearch.tsx`, and `CLISettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx -t "keeps header and tab actions" --run`:
  **1 selected test**, passing. Existing Vite CJS deprecation warning and
  Browserslist age notice still print.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`:
  **12 tests**, passing. Existing Vite CJS deprecation warning and Browserslist
  age notice still print.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-sidebar-panel.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/skill-full-detail-async-actions.test.tsx --run`:
  **42 tests**, passing. Existing Vite CJS deprecation warning and Browserslist
  age notice still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Skill file editor residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx -t "expands nested|renders supported resource" --run`:
  failed first after tightening existing directory expansion and resource
  preview tests because the directory disclosure chevron and image zoom
  minus/reset/plus icons were still exposed to assistive technology.
- `SkillFileEditor` now hides the directory disclosure chevron and the image
  preview zoom control icons from assistive technology while preserving the
  existing `aria-expanded`, `aria-label`, title, and zoom behavior.
- `tests/unit/components/skill-file-editor.test.tsx` now asserts nested
  synthetic directory disclosure icons are decorative and checks every
  rendered button-contained SVG in the supported-resource preview flow is
  hidden from assistive technology.
- The local `SkillFileEditor.tsx` button SVG scan now reports no exposed
  button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **37** to
  **33** after this pass; the remaining largest groups are
  `PlatformWorkbenchPrototype.tsx`, `AISettings.tsx`,
  `TopBarRulesSearch.tsx`, and `CLISettings.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx -t "expands nested|renders supported resource" --run`:
  **2 selected tests**, passing. Existing Vite CJS deprecation warning and
  Browserslist age notice still print.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-file-editor.test.tsx --run`:
  **11 tests**, passing. Existing Vite CJS deprecation warning and Browserslist
  age notice still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Platform workbench prototype semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/platform-workbench-prototype.test.tsx --run`:
  failed first after adding form-wrapped prototype coverage because the
  section and resource selection buttons did not expose pressed state.
- `PlatformWorkbenchPrototype` now exposes active platform-map sections and
  selected resources with `aria-pressed`, keeping the visual selected state
  synchronized with assistive technology.
- Decorative section, filter, primary action, and compare-action icons inside
  buttons are now hidden from assistive technology while preserving visible
  button labels and existing mock prototype behavior.
- `tests/unit/components/platform-workbench-prototype.test.tsx` verifies
  rendered prototype navigation and actions inside an outer form, checks every
  native button is non-submit, checks all button-contained SVGs are
  decorative, confirms section/resource pressed state transitions, verifies
  search filtering, and confirms representative action clicks do not submit
  the outer form.
- The local `PlatformWorkbenchPrototype.tsx` button SVG scan now reports no
  exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **33** to
  **29** after this pass; the remaining largest groups are `AISettings.tsx`,
  `TopBarRulesSearch.tsx`, `CLISettings.tsx`, `HeaderSection.tsx`, and
  `ModelFormModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/platform-workbench-prototype.test.tsx --run`:
  **1 test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## AI settings legacy residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx -t "advanced parameter sliders" --run`:
  failed first after tightening the existing advanced-parameter test because
  the chat add-model fetch icon, advanced-disclosure chevron, and custom
  parameter delete icon were still exposed to assistive technology.
- `AISettings` now hides decorative fetch-model loading / refresh icons,
  advanced-parameter disclosure chevrons, and custom-parameter delete icons
  from assistive technology while preserving existing labels, provider values,
  API endpoint behavior, and model configuration semantics.
- `tests/unit/components/ai-settings-legacy.test.tsx` now verifies
  button-contained SVGs are decorative in both chat advanced-parameter and
  image model add flows.
- The local `AISettings.tsx` button SVG scan now reports no exposed
  button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **29** to
  **25** after this pass; the remaining largest groups are
  `TopBarRulesSearch.tsx`, `CLISettings.tsx`, `HeaderSection.tsx`, and
  `ModelFormModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx -t "advanced parameter sliders|image model provider" --run`:
  **2 selected tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`:
  **4 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Top bar rules search residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx -t "navigates rules search" --run`:
  failed first after tightening the existing rules-search navigation test
  because the previous-result, next-result, and clear-search button icons were
  still exposed to assistive technology.
- `TopBarRulesSearch` now hides the rules search previous / next / clear
  button icons from assistive technology while preserving keyboard Tab /
  Shift+Tab / Enter navigation, title-backed button names, and shared rules
  search state behavior.
- `tests/unit/components/top-bar.test.tsx` now verifies the rules search
  rendered button SVGs are decorative, exercises previous / next result
  buttons in addition to keyboard navigation, and confirms clear search resets
  the rules search query.
- The local `TopBarRulesSearch.tsx` button SVG scan now reports no exposed
  button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **25** to
  **22** after this pass; the remaining largest groups are `CLISettings.tsx`,
  `HeaderSection.tsx`, and `ModelFormModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx -t "navigates rules search" --run`:
  **1 selected test**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`:
  **16 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## CLI settings residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/cli-settings.test.tsx --run`:
  failed first after wrapping the CLI settings install flow in an outer form
  and checking button-contained SVG exposure because the primary install,
  npm fallback install, and refresh buttons exposed decorative icons to
  assistive technology.
- `CLISettings` now hides install loading / download icons and refresh icons
  from assistive technology while preserving standalone CLI status detection,
  install method selection, toast behavior, and refresh behavior.
- `tests/unit/components/cli-settings.test.tsx` now verifies rendered CLI
  settings actions inside an outer form, checks install / fallback / refresh
  buttons are non-submit, checks all button-contained SVGs are decorative, and
  confirms installing with the detected package manager does not submit the
  outer form.
- The local `CLISettings.tsx` button SVG scan now reports no exposed
  button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **22** to
  **19** after this pass; the remaining largest groups are `HeaderSection.tsx`
  and `ModelFormModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/cli-settings.test.tsx --run`:
  **2 tests**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## AI workbench header residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-header-section.test.tsx --run`:
  failed first after adding focused header coverage because the Test Default
  Model and Add Model button icons were still exposed to assistive technology.
- `HeaderSection` now hides the test-default loading / test-tube icons and the
  add-model plus icon from assistive technology while preserving button labels,
  disabled state, and callback behavior.
- `tests/unit/components/ai-workbench-header-section.test.tsx` renders the
  header inside an outer form, verifies test-default / add-model / import
  legacy actions are non-submit, checks all button-contained SVGs are
  decorative, and confirms each action callback fires without submitting the
  form.
- The local `HeaderSection.tsx` button SVG scan now reports no exposed
  button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **19** to
  **17** after this pass; the remaining largest group is `ModelFormModal.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-header-section.test.tsx --run`:
  **1 test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## AI workbench model form modal residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-model-form-modal.test.tsx --run`:
  failed first after adding focused modal coverage because the advanced
  disclosure chevron and Test Current Config button icon were still exposed to
  assistive technology.
- `ModelFormModal` now hides the advanced disclosure chevron plus the test
  draft loading / test-tube icons from assistive technology while preserving
  labels, disabled state, local disclosure state, and callback behavior.
- `tests/unit/components/ai-workbench-model-form-modal.test.tsx` renders the
  model form modal inside an outer form, verifies advanced / test draft /
  cancel / save buttons are non-submit, checks all button-contained SVGs are
  decorative, and confirms the action callbacks fire without submitting the
  form.
- The local `ModelFormModal.tsx` button SVG scan now reports no exposed
  button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **17** to
  **15** after this pass; remaining hits are singletons across prompt, folder,
  skill, settings, AI workbench model-form helpers, and
  `CollapsibleThinking.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-model-form-modal.test.tsx --run`:
  **1 test**, passing. Existing Vite CJS deprecation warning still prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## AI workbench model form helper residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-base-fields.test.tsx --run`:
  failed first after adding fetch-model action coverage because the Fetch
  Models sparkle icon was still exposed to assistive technology.
- `BaseFields` now hides fetch-model loading / sparkle icons from assistive
  technology while preserving the button label, disabled state, and fetch
  callback behavior.
- `tests/unit/components/ai-workbench-base-fields.test.tsx` now verifies the
  Fetch Models action is a non-submit button inside an outer form, keeps
  button-contained SVGs decorative, and calls `onFetchModels` without
  submitting the form.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/available-models-list.test.tsx --run`:
  failed first after adding list-action coverage because fetched-model category
  disclosure buttons did not expose `aria-expanded`.
- `AvailableModelsList` now exposes category collapse state through
  `aria-expanded`, hides the category disclosure / category / search icons from
  assistive technology, and preserves model selection plus category select-all
  behavior.
- `tests/unit/components/available-models-list.test.tsx` now verifies category,
  select-all, and model row actions are non-submit buttons, category disclosure
  state toggles, button-contained SVGs are decorative, and list actions do not
  submit an outer form.
- The local `BaseFields.tsx` and `AvailableModelsList.tsx` button SVG scans now
  report no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **15** to
  **13** after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-model-form-modal.test.tsx tests/unit/components/ai-workbench-base-fields.test.tsx tests/unit/components/available-models-list.test.tsx --run`:
  **3 files / 14 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Settings residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-advanced-section.test.tsx --run`:
  failed first after tightening `AdvancedSection` coverage because the
  translation, advanced-params, and Configure chevron icons were still exposed
  to assistive technology.
- `AdvancedSection` now hides those decorative icons while preserving the
  Translation Mode select label, Configure action label, and `onConfigure`
  callback behavior.
- `tests/unit/components/ai-workbench-advanced-section.test.tsx` now verifies
  the Configure action is a non-submit button inside an outer form, all rendered
  SVG icons are decorative, and clicking Configure does not submit the form.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx -t "manual recovery" --run`:
  failed first after extending the manual recovery flow because the manual path
  removal button's X icon was still exposed to assistive technology.
- `DataSettings` now hides the manual recovery path removal icon while
  preserving the title-backed Delete button name and path removal behavior.
- `tests/unit/components/data-settings.test.tsx` now wraps the manual recovery
  flow in an outer form, verifies the removal action is non-submit, verifies
  the icon is decorative, confirms removal updates the visible path list, and
  confirms scanning still passes the re-added path.
- The local `AdvancedSection.tsx` and `DataSettings.tsx` button SVG scans now
  report no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **13** to
  **11** after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-workbench-advanced-section.test.tsx tests/unit/components/data-settings.test.tsx --run`:
  **2 files / 30 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Shared and picker residual icon semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-prototype.test.tsx -t "default test action" --run`:
  failed first after adding default-test action coverage because the Test
  Default Model button's test-tube icon was still exposed to assistive
  technology.
- `AISettingsPrototype` now hides the Test Default Model icon and explicitly
  marks its loading spinner decorative while preserving the no-default-model
  error toast and non-submit button behavior.
- `tests/unit/components/ai-settings-prototype.test.tsx` now wraps the
  prototype in an outer form, verifies the Test Default Model action is
  non-submit, checks its icon is decorative, and confirms clicking it reports
  the missing default model without submitting the form.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/spinner.test.tsx -t "force a labeled spinner" --run`:
  failed first because a labeled `Spinner` could not be explicitly forced back
  to decorative mode.
- `Spinner` now supports an explicit `aria-hidden` prop. This preserves the
  existing labeled status behavior by default while allowing inline button
  spinners with adjacent text to stay decorative.
- `CollapsibleThinking` now passes explicit decorative spinner props for both
  loading indicators, keeping the existing runtime accessibility behavior and
  removing the conservative source-level scan hit.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/folder-modal.test.tsx --run`:
  failed first after extending the folder modal control test because icon-picker
  buttons in Icon mode had no accessible names.
- `FolderModal` icon-picker buttons now expose stable icon names through
  `aria-label`, expose selection through `aria-pressed`, and hide the Lucide
  icon SVGs from assistive technology.
- `tests/unit/components/folder-modal.test.tsx` now switches into Icon mode,
  verifies the folder icon option can be found by accessible name, verifies
  pressed-state changes after selection, and re-checks button SVGs after the
  icon grid is rendered.
- The local `AISettingsPrototype.tsx`, `CollapsibleThinking.tsx`, and
  `FolderModal.tsx` button SVG scans now report no exposed button-contained
  SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **11** to
  **8** after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-prototype.test.tsx tests/unit/components/spinner.test.tsx tests/unit/components/collapsible-thinking.test.tsx tests/unit/components/folder-modal.test.tsx --run`:
  **4 files / 46 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Prompt editor and AI test residual semantics follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-editor.test.tsx --run`:
  failed first after adding rendered button SVG coverage because the Prompt
  Editor Cancel, Save, and Copy Result button icons were still exposed to
  assistive technology.
- `PromptEditor` now hides those action icons and the URL upload loading icon
  while preserving existing action labels, save/cancel behavior, copy-preview
  behavior, and URL upload behavior.
- `tests/unit/components/prompt-editor.test.tsx` now verifies rendered
  PromptEditor button SVGs are decorative after opening URL entry and switching
  preview state.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx -t "AI test actions" --run`:
  failed first after adding reference-image selection assertions because the
  reference image button was named by thumbnail alt text plus state text rather
  than by the selection action.
- `AiTestModal` reference image buttons now expose explicit Select / Deselect
  reference image action names, keep `aria-pressed` as the selection state, and
  mark thumbnail images decorative within those buttons.
- `LocalImage` now supports `aria-hidden` passthrough for callers that already
  provide the accessible name at a wrapper control.
- `tests/unit/components/ai-test-workbench.test.tsx` now verifies the selected
  reference image button has a Deselect action name, toggles to a Select action
  name after click, and remains non-submit with decorative button icons.
- The local `PromptEditor.tsx` and `AiTestModal.tsx` button SVG scans now
  report no exposed button-contained SVGs.
- The renderer-wide possible exposed button SVG scan dropped from **8** to
  **5** after this pass; remaining hits are all under skill components.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-editor.test.tsx tests/unit/components/ai-test-workbench.test.tsx --run`:
  **2 files / 20 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Skill residual button icon semantics follow-up

- `SkillStoreCard` now marks the primary card `SkillIcon` and visual variant
  badges decorative because the primary button already exposes the card name /
  description through `aria-label`.
- `SkillIcon` now accepts an explicit `aria-hidden` prop and treats it as
  decorative rendering, preserving default accessible icon output for ordinary
  non-button icon use.
- `SkillIconPicker`, `SkillQuickInstall`, `SkillBatchDeployDialog`, and
  `SkillDetailView` now pass explicit decorative semantics to preset or
  platform icons rendered inside button controls.
- `SkillVariantBadgeList` now forwards standard div attributes so parent
  controls can mark purely visual badge groups decorative without changing the
  default badge-list behavior elsewhere.
- `tests/unit/components/skill-store-card.test.tsx`,
  `skill-icon-picker.test.tsx`, `skill-quick-install.test.tsx`,
  `skill-batch-deploy-dialog.test.tsx`, and
  `skill-detail-view-timers.test.tsx` now assert that button-contained
  SVG/image/role-img media is hidden by itself or an `aria-hidden` ancestor.
- The renderer-wide possible exposed button SVG/component scan dropped from
  **5** to **0** after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-icon-picker.test.tsx tests/unit/components/skill-quick-install.test.tsx tests/unit/components/skill-batch-deploy-dialog.test.tsx tests/unit/components/skill-detail-view-timers.test.tsx --run`:
  **5 files / 31 tests**, passing. Existing Vite CJS deprecation,
  i18next fallback warning in `skill-store-card.test.tsx`, and Browserslist
  notice still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.
- `git diff --check` for the touched skill semantic files and change records:
  clean.
- Trailing whitespace scan for the touched skill semantic files and change
  records: no matches.

## Search input accessible-name follow-up

- A renderer-wide input naming scan reported two possible unlabeled inputs:
  `TopBarRulesSearch.tsx` and `AvailableModelsList.tsx`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/available-models-list.test.tsx --run`:
  failed first after adding a role/name query because the model search input
  exposed an empty accessible name while only showing placeholder text.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx -t "rules" --run`:
  failed first after switching rules-search tests to role/name queries because
  the top-bar rules search input also exposed an empty accessible name.
- `AvailableModelsList` and `TopBarRulesSearch` now give their search inputs
  localized `aria-label` values matching their visible placeholder copy.
  `TopBarRulesSearch` also marks its decorative search glyph `aria-hidden`.
- `tests/unit/components/available-models-list.test.tsx` now verifies the model
  search field can be found by name and still filters the rendered model list.
- `tests/unit/components/top-bar.test.tsx` now verifies the rules search field
  through its accessible name while preserving prompt-search isolation, Tab /
  Enter navigation, and clear-button behavior.
- The renderer-wide possible unlabeled input scan dropped from **2 files** to
  **0 files** after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/available-models-list.test.tsx tests/unit/components/top-bar.test.tsx --run`:
  **2 files / 21 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Available model list action-name follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/available-models-list.test.tsx --run`:
  failed first after tightening action-name assertions because category
  disclosure buttons were named like `GPT1`, category select-all buttons shared
  the duplicate name `Select All`, and model row buttons were named by
  concatenated row text such as `gpt-4oopenai`.
- `AvailableModelsList` now gives category disclosure buttons state-specific
  names (`Expand / Collapse {{category}} models`), category select-all buttons
  category-specific names, and model row buttons explicit Select / Deselect
  names with `aria-pressed`.
- The checkbox indicator inside each model row is now decorative, so selected
  state is exposed through the button state instead of an incidental checkmark.
- New action-name strings were added to all seven renderer locales.
- `tests/unit/components/available-models-list.test.tsx` now uses a stateful
  harness to verify model row pressed state updates after selection while
  preserving non-submit behavior and decorative icon semantics.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/available-models-list.test.tsx tests/unit/services/i18n-init.test.ts --run`:
  **2 files / 9 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- Locale JSON parse check for `en`, `zh`, `zh-TW`, `ja`, `fr`, `de`, and `es`:
  clean.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Top bar search action-name follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`:
  failed first after tightening icon-only search action assertions because the
  regular top-bar search and lazy rules search previous / next / clear buttons
  only exposed names through `title`, with no explicit `aria-label`.
- `TopBar` and `TopBarRulesSearch` now keep their existing hover titles while
  also passing localized `aria-label` values to the previous-result,
  next-result, and clear-search icon buttons.
- `tests/unit/components/top-bar.test.tsx` now verifies the regular prompt
  search controls and rules search controls have explicit labels while
  preserving result navigation, query clearing, and non-rendering of navigation
  buttons when there is only one result.
- A local scan of `TopBar.tsx` and `TopBarRulesSearch.tsx` now reports
  `missingHeaderSearchAriaLabel=0` for header previous / next / clear search
  buttons.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`:
  **1 file / 16 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Sidebar title-backed action-name follow-up

- A renderer scan for icon-only / title-backed buttons highlighted Sidebar
  navigation and settings rail buttons as title-only controls without explicit
  `aria-label`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx -t "rendered sidebar actions" --run`:
  failed first after tightening the test because the `Prompts` navigation
  button had `title="Prompts"` but no matching `aria-label`.
- `Sidebar` now gives `NavItem`, rail module buttons, and the rail Settings
  button explicit labels matching their tooltip text, preserving visible labels
  and current click behavior.
- `tests/unit/components/sidebar.test.tsx` now checks every rendered Sidebar
  button with a title also has a matching `aria-label`, while preserving the
  existing non-submit and decorative-icon assertions.
- Local Sidebar scan now reports `sidebarButtonTitleWithoutAria=0`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx --run`:
  **1 file / 29 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Project add button action-name follow-up

- A renderer scan for unnamed icon-only buttons reported one remaining
  candidate: the `SkillProjectsView` sidebar Add Project icon button.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx -t "project action icons" --run`:
  failed first after tightening the test because the Add Project button only
  had a `title`, with no explicit `aria-label`.
- `SkillProjectsView` now gives that icon-only Add Project button a localized
  `aria-label` matching its tooltip while preserving the existing click
  behavior and visual icon-only layout.
- `tests/unit/components/skill-projects-view.test.tsx` now verifies the Add
  Project action has an explicit label in addition to the existing non-submit
  and decorative-icon checks.
- The renderer-wide possible unnamed icon button scan now reports
  `possibleUnnamedIconButtons=0`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx --run`:
  **1 file / 25 tests**, passing. Existing Vite CJS deprecation and
  Browserslist notices still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Full skill detail title-backed action-name follow-up

- A renderer scan for buttons with `title` but no explicit accessible label
  highlighted the full skill detail source update and snapshot actions. Their
  visible labels were shorter than the intended action names (`Check Updates`
  / `Snapshot`), so assistive technology could miss the full intent.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run -t "keeps header and tab actions"`:
  failed first after tightening the test because the header source update
  action was still exposed as `Check Updates` and the snapshot action as
  `Snapshot`, with no explicit `aria-label`.
- `SkillFullDetailPage` now gives the source update and snapshot header
  buttons localized `aria-label` values matching their full tooltip/action
  names while keeping the visible compact labels unchanged.
- Added `skill.checkSourceUpdatesAction` to all seven renderer locales so the
  complete source-update action name is translated independently from the
  compact button text.
- `tests/unit/components/skill-full-detail-async-actions.test.tsx` now verifies
  the full `Check Source Updates`, `Update from Source`, and `Create Snapshot`
  action names, including the two distinct `Create Snapshot` buttons after the
  snapshot modal opens.
- The renderer-wide title-backed button scan dropped from **14** to **12**
  remaining candidates after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx tests/unit/services/i18n-init.test.ts --run`:
  **2 files / 16 tests**, passing. Existing Vite CJS deprecation and
  Browserslist notices still print.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Edit prompt translation action-name follow-up

- The remaining title-backed button scan highlighted the edit prompt bilingual
  translation buttons: the visible controls were symbolic (`-> EN` / `EN ->`)
  while the tooltip carried the actual action.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-modal-structure.test.tsx --run -t "translate"`:
  failed first after switching the stale translation tests to the localized
  action names because both buttons were still exposed as the arrow text.
- `EditPromptModal` now gives the translate-to-English and translate-from-
  English buttons explicit localized `aria-label` values. Tooltip text still
  reports disabled reasons when applicable.
- `tests/unit/components/prompt-modal-structure.test.tsx` now finds both
  translation actions by their Chinese action names and checks the explicit
  labels before exercising stale async result handling.
- The renderer-wide title-backed button scan dropped from **12** to **10**
  remaining candidates after this pass.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-modal-structure.test.tsx tests/unit/components/edit-prompt-modal.test.tsx --run`:
  **2 files / 14 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Top bar update action-name follow-up

- The remaining title-backed button scan highlighted the `TopBar` update
  notification action. Its visible version label is hidden on smaller
  breakpoints, so the icon-only state needed a stable explicit button name.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run -t "keeps top bar actions"`:
  failed first after tightening the test because the update button was exposed
  as `v0.5.9 available` and had no explicit `aria-label`.
- `TopBar` now gives the update notification action an explicit localized
  `aria-label` matching its tooltip (`settings.updateAvailable`) while keeping
  the visible version label unchanged.
- `tests/unit/components/top-bar.test.tsx` now verifies the update button can
  be found by the stable action name and has the explicit label before clicking
  it inside a surrounding form.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`:
  **1 file / 16 tests**, passing. Existing Vite CJS deprecation warning still
  prints.

## Create skill AI polish action-name follow-up

- The title-backed button scan highlighted the manual create-skill AI Polish
  action, whose tooltip changes between disabled reasons and the normal
  polishing hint.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run -t "chooser and manual actions"`:
  failed first after tightening the test because the AI Polish button lacked an
  explicit `aria-label`.
- `CreateSkillModal` now gives the AI Polish action a stable localized
  `aria-label`, while leaving `title` available for disabled reasons or the
  detailed polish hint.
- `tests/unit/components/create-skill-modal.test.tsx` now checks the explicit
  AI Polish label in the existing manual-action non-submit / decorative-icon
  regression test.
- The renderer-wide title-backed button scan dropped from **10** to **8**
  remaining candidates after the TopBar and CreateSkillModal passes.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run`:
  **1 file / 11 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Skill manager batch action-name follow-up

- The remaining title-backed button scan highlighted the SkillManager batch
  toolbar controls, where compact visible labels and tooltip titles were not
  consistently backed by explicit `aria-label` values.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run -t "SkillManager"`:
  failed first after tightening the toolbar assertions around title-backed
  batch actions and stale source-update / snapshot labels.
- `SkillManager` now gives Batch Manage, Select All / Clear, Add Favorite /
  Remove Favorite, Batch Tags, Batch Deploy, and Delete explicit localized
  action labels while preserving the existing tooltip titles and click
  behavior.
- `tests/unit/components/skill-i18n-smoke.test.tsx` now verifies the batch
  toolbar action names and updates stale expectations from compact `Snapshot`
  / `Check Updates` labels to `Create Snapshot` / `Check Source Updates`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run`:
  **1 file / 28 tests**, passing. Existing Vite CJS deprecation warning still
  prints.

## Detail and settings title-backed action-name follow-up

- The remaining title-backed button scan highlighted the SkillStoreDetail
  refresh-translation action and the DataSettings import backup action as
  controls whose full accessible names depended on visible text or title-only
  behavior.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx tests/unit/components/data-settings.test.tsx --run -t "refresh|import"`:
  failed first after tightening the assertions because those actions lacked
  explicit `aria-label` values.
- `SkillStoreDetail` now gives the refresh-translation action a stable
  localized `aria-label`, including the cached-translation state where the
  primary translation button changes to `Show Original`.
- `DataSettings` now gives the import backup action an explicit localized
  `aria-label` while preserving the existing import workflow.
- `tests/unit/components/skill-store-detail-timers.test.tsx` and
  `tests/unit/components/data-settings.test.tsx` now verify those explicit
  labels through user-visible action queries.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx tests/unit/components/data-settings.test.tsx --run`:
  **2 files / 38 tests**, passing. Existing Vite CJS deprecation warning still
  prints.

## Renderer title-backed action-name close-out

- The final renderer-wide scan for `<button>` elements with `title` but no
  explicit `aria-label` / `aria-labelledby` now reports
  `buttonTitleWithoutAria=0`.
- One intermediate scanner hit in `SkillManager` was a scanner artifact caused
  by an arrow-function `>` inside a multiline `title` expression before the
  existing `aria-label`. The prop order was adjusted so the simple scanner and
  the real JSX agree on the same accessible-name coverage.
- The latest focused verification for this close-out batch:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx --run`:
    **1 file / 16 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run`:
    **1 file / 11 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run`:
    **1 file / 28 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-detail-timers.test.tsx tests/unit/components/data-settings.test.tsx --run`:
    **2 files / 38 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: clean.
  - `pnpm --filter @prompthub/desktop lint`: clean.

## Local image clickable-surface follow-up

- The renderer-wide non-semantic clickable scan highlighted `LocalImage`'s
  failed-image fallback as a real shared-component hit: when `onClick` was
  passed, the fallback rendered as a clickable `div`, while the loaded-image
  path relied on an `img` click handler.
- `LocalImage` now renders clickable loaded and fallback images as named
  `type="button"` controls with a visible focus ring. Decorative and background
  image usages without `onClick` keep their previous non-interactive image /
  fallback rendering.
- Prompt detail preview thumbnails in `MainContent` and
  `PromptDetailModal` now pass localized `prompt.previewReferenceImage` action
  names across all renderer locales instead of exposing technical `image-N`
  alt text as the interactive label.
- `tests/unit/components/local-image.test.tsx` now covers the clickable loaded
  image and fallback branches, including non-submit semantics, keyboard
  activation, and decorative inner image semantics.
- The latest non-semantic clickable scan dropped from **21** to **20**
  remaining candidates after this pass; the remaining hits are mostly modal
  backdrops, stop-propagation containers, or separate components that need
  case-by-case review.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/local-image.test.tsx --run`:
  **1 file / 3 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: clean.
- `pnpm --filter @prompthub/desktop lint`: clean.

## Rules conflict overlay dismiss follow-up

- The renderer-wide non-semantic clickable scan also highlighted the
  `RulesManager` sync-conflict overlay. That backdrop dismisses the conflict
  prompt temporarily, so it is a real user-facing action rather than a passive
  layout wrapper.
- The conflict overlay is now a named `type="button"` control with localized
  `rules.conflictDismiss` text across all renderer locales. It keeps the same
  click behavior and is disabled while conflict resolution is in progress.
- `tests/unit/components/rules-manager.test.tsx` now verifies the dismiss
  control is exposed as a non-submit button before exercising the existing
  "keep external version" confirmation flow.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx --run`:
  **1 file / 8 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- Combined verification after the `LocalImage` and `RulesManager` follow-ups:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/local-image.test.tsx tests/unit/components/rules-manager.test.tsx --run`:
    **2 files / 11 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: clean.
  - `pnpm --filter @prompthub/desktop lint`: clean.
  - Locale JSON parse check: clean.
  - Renderer-wide scans: `buttonTitleWithoutAria=0` and
    `nonSemanticClickWithoutRole=19`.

## Prompt table row-action isolation follow-up

- The renderer-wide non-semantic clickable scan highlighted
  `PromptTableView`'s action-cell wrapper. The wrapper only stopped click
  propagation around real buttons, so the behavior belonged on the buttons
  rather than on a non-semantic container.
- Row action click isolation is now handled by the Copy, AI Test, Version
  History, Favorite, Edit, and Delete button handlers themselves. The action
  cell wrapper no longer has an `onClick` handler.
- `tests/unit/components/prompt-table-view.test.tsx` now verifies each row
  action still invokes its callback while preventing clicks from bubbling to an
  ancestor click handler.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-table-view.test.tsx --run`:
  **1 file / 10 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- The latest renderer-wide non-semantic clickable scan dropped from **19** to
  **18** remaining candidates after this pass.

## Image preview event-boundary follow-up

- The renderer-wide non-semantic clickable scan highlighted
  `ImagePreviewModal`'s image-container `stopPropagation` wrapper. Because the
  close behavior is attached to a separate backdrop layer behind the preview
  content, the wrapper click handler was redundant.
- The image preview content wrapper no longer has an `onClick` handler. The
  backdrop retains the existing pointer-close behavior, and the modal already
  exposes keyboard close through Escape plus the named Close button.
- `tests/unit/components/image-preview-modal.test.tsx` now verifies clicking
  the image keeps the preview open while clicking the backdrop closes it.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/image-preview-modal.test.tsx --run`:
  **1 file / 9 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- The latest renderer-wide non-semantic clickable scan dropped from **18** to
  **17** remaining candidates after this pass.

## Shared backdrop presentation follow-up

- The remaining shared UI primitive scan hits were pointer backdrops in
  `Modal`, `ConfirmDialog`, `UnsavedChangesDialog`, `CloseDialog`, and
  `ImagePreviewModal`. These are redundant pointer-close affordances, while
  keyboard and assistive-technology users already have named close/cancel
  buttons and/or Escape handling.
- The shared backdrops are now marked `role="presentation"` and
  `aria-hidden="true"` instead of being converted into focusable buttons. This
  keeps the keyboard tab order focused on real dialog controls while making the
  pointer-only layer explicit.
- The related unit tests now verify each backdrop keeps its click-close
  behavior and remains presentational/hidden from assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx tests/unit/components/confirm-dialog.test.tsx tests/unit/components/unsaved-changes-dialog.test.tsx tests/unit/components/close-dialog.test.tsx tests/unit/components/image-preview-modal.test.tsx --run`:
  **5 files / 45 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- The latest renderer-wide non-semantic clickable scan dropped from **17** to
  **12** remaining candidates after this pass.

## Folder backdrop presentation follow-up

- The renderer-wide non-semantic clickable scan highlighted the folder modal
  family: the primary `FolderModal`, its nested unlock / delete-options /
  duplicate-name / private-delete dialogs, and `PrivateFolderUnlockModal`.
- These pointer backdrops now use `role="presentation"` and
  `aria-hidden="true"` while keeping their existing click-close behavior. This
  preserves the existing folder creation, private-folder unlock, delete option,
  duplicate-name, and private-delete workflows without adding extra keyboard tab
  stops.
- `tests/unit/components/folder-modal.test.tsx` and
  `tests/unit/components/private-folder-unlock-modal.test.tsx` now verify the
  primary folder and private-folder unlock backdrops are presentational while
  preserving click close behavior.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/folder-modal.test.tsx tests/unit/components/private-folder-unlock-modal.test.tsx --run`:
  **2 files / 5 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- The latest renderer-wide non-semantic clickable scan dropped from **12** to
  **6** remaining candidates after this pass.

## Prompt and skill backdrop scan close-out

- The final renderer-wide non-semantic clickable scan hits were pointer
  backdrops in `QuickAddModal`, `ImagePromptReverseModal`, `CreateSkillModal`,
  `EditSkillModal`, and `SkillFileEditor`.
- These prompt / skill modal backdrops now use `role="presentation"` and
  `aria-hidden="true"` while preserving the existing close behavior, including
  the `SkillFileEditor` unsaved-change guard around its modal backdrop close.
- The related unit tests now verify each modal backdrop remains
  presentational/hidden from assistive technology and still invokes the
  relevant close path.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/quick-add-modal.test.tsx tests/unit/components/image-prompt-reverse-modal.test.tsx tests/unit/components/create-skill-modal.test.tsx tests/unit/components/edit-skill-modal.test.tsx tests/unit/components/skill-file-editor.test.tsx --run`:
  **5 files / 52 tests**, passing. Existing Vite CJS deprecation and
  Browserslist data-age warnings still print.
- Renderer-wide scans now report `buttonTitleWithoutAria=0` and
  `nonSemanticClickWithoutRole=0`.

## Button-contained decorative icon close-out

- A follow-up renderer-wide scan for icon components / `svg` elements inside
  buttons without explicit accessibility treatment found two remaining hits:
  the `RulesManager` sync-conflict alert icon and the `SkillListView` primary
  row `SkillIcon`.
- The rules conflict alert icon is now explicitly hidden from assistive
  technology. The skill list row icon is marked decorative / `aria-hidden`
  because the row button's accessible name already includes the skill name.
- `tests/unit/components/rules-manager.test.tsx` now verifies the conflict
  alert icon is decorative, and
  `tests/unit/components/skill-list-view-actions.test.tsx` verifies the
  primary row button still has a stable action name while its visual icon
  content is hidden.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx tests/unit/components/skill-list-view-actions.test.tsx --run`:
  **2 files / 11 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- The renderer-wide button-contained icon scan now reports
  `buttonSvgWithoutA11yAttr=0`.

## Textbox accessible-name follow-up

- A renderer-wide native input / textarea scan highlighted remaining textboxes
  whose accessible names were still relying on surrounding visual context or
  placeholder text.
- `SkillFileEditor` now gives the new-file, new-folder, and rename dialog
  inputs explicit localized `aria-label` values. The unit test now opens all
  three dialogs and locates their textboxes by role and accessible name.
- `RulesManager` now gives the AI rewrite instruction textarea and the main
  rule-content editor textarea explicit localized `aria-label` values. The
  unit test now locates those controls by role and accessible name while
  preserving the existing AI rewrite and save behavior assertions.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx tests/unit/components/skill-file-editor.test.tsx --run`:
  **2 files / 21 tests**, passing. Existing Vite CJS deprecation and
  Browserslist data-age warnings still print.
- `pnpm --filter @prompthub/desktop typecheck`: passing.
- `pnpm --filter @prompthub/desktop lint`: passing.
- The renderer-wide native input / textarea accessible-name hint scan dropped
  from **94** to **89** remaining candidates after the targeted textbox fixes.

## Prompt tag and edit prompt textbox follow-up

- `TagManagerModal` now gives the tag search, new-tag, and inline tag rename
  inputs explicit accessible names. The unit test now verifies all three
  controls through role/name queries while preserving tag loading, creation,
  click-mode, and skill-tag rename behavior.
- `EditPromptModal` now gives the inline AI rewrite instruction textarea an
  explicit localized accessible name. The unit test now verifies the AI rewrite
  textbox is discoverable by role/name alongside the core prompt fields and
  prompt-type state.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/tag-manager-modal.test.tsx tests/unit/components/edit-prompt-modal.test.tsx --run`:
  **2 files / 6 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: passing.
- `pnpm --filter @prompthub/desktop lint`: passing.
- A wider custom Input / Textarea accessible-name hint scan dropped from **8**
  to **7** remaining candidates after the edit prompt AI rewrite fix. The tag
  manager inputs were still real accessibility hardening despite not appearing
  in that wider scan because they previously relied on placeholder or visual
  context, and are now locked by role/name tests.

## Project and full-detail textbox follow-up

- `SkillProjectsView` now gives the project root path and extra scan path
  inputs explicit accessible names. The project creation/layout test now
  verifies both textboxes by role/name while keeping the existing browse,
  auto-name, add, save, and scan behavior assertions.
- `SkillFullDetailPage` now gives the personal notes textarea and snapshot
  note textarea explicit accessible names. The async action regression test now
  locates both textboxes by role/name while preserving duplicate-save and
  duplicate-snapshot guards.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-projects-view.test.tsx tests/unit/components/skill-full-detail-async-actions.test.tsx --run`:
  **2 files / 37 tests**, passing. Existing Vite CJS deprecation and
  Browserslist data-age warnings still print.
- `pnpm --filter @prompthub/desktop typecheck`: passing.
- `pnpm --filter @prompthub/desktop lint`: passing.
- The wider custom Input / Textarea accessible-name hint scan dropped from
  **7** to **3** remaining candidates after this pass. The remaining
  `PromptQuickRewriteDialog` and `SkillLibraryImportModal` hits already have
  explicit labels but are still reported because the lightweight scanner stops
  early on JSX arrow functions; `PlatformWorkbenchPrototype` remains a real
  follow-up candidate.

## Platform workbench textbox follow-up

- `PlatformWorkbenchPrototype` now gives the resource search input an explicit
  localized accessible name and marks the adjacent search icon decorative.
  The prototype unit test now locates the search field by role/name before
  verifying filtering behavior.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/platform-workbench-prototype.test.tsx --run`:
  **1 file / 1 test**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop typecheck`: passing.
- `pnpm --filter @prompthub/desktop lint`: passing.
- The wider custom Input / Textarea accessible-name hint scan dropped from
  **3** to **2** remaining candidates. A structured follow-up scan that tracks
  JSX expression braces across the whole opening tag reports
  `customInputTextareaWithoutNameHintStructured=0`; the two lightweight
  scanner leftovers are already-labelled controls in `PromptQuickRewriteDialog`
  and `SkillLibraryImportModal`.

## Appearance wallpaper slider accessible-name follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/appearance-settings.test.tsx --run -t "wallpaper adjustment sliders"`:
  failed first because the background visibility and blur `input[type=range]`
  controls exposed slider roles with empty accessible names.
- `AppearanceSettings` now binds the existing visible background visibility
  and blur labels to their range inputs with generated ids, so the sliders can
  be reached by role/name without adding duplicate visual copy.
- `tests/unit/components/appearance-settings.test.tsx` now verifies both
  wallpaper adjustment sliders by visible accessible name and confirms their
  store update values.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/appearance-settings.test.tsx --run -t "wallpaper adjustment sliders"`:
  **1 selected test**, passing. Existing Vite CJS deprecation warning still
  prints.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/appearance-settings.test.tsx --run`:
  **1 file / 6 tests**, passing. Existing Vite CJS deprecation warning still
  prints.
- The renderer-wide native input / textarea accessible-name hint scan dropped
  from **9** to **7** remaining candidates after this pass.

## Skill delete copy-distribution checkbox accessible-name follow-up

- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run -t "skill manager actions"`:
  failed first because the SkillManager copied-distribution delete checkbox
  accessible name concatenated the primary label and help text.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run -t "copied-distribution delete checkbox"`:
  failed first for the same checkbox naming issue in the full skill detail
  delete confirmation.
- `SkillManager` and `SkillFullDetailPage` now give the copied-distribution
  delete checkbox generated ids, bind the primary label through
  `aria-labelledby`, and keep the explanatory text attached through
  `aria-describedby`.
- `tests/unit/components/skill-i18n-smoke.test.tsx` now verifies the
  SkillManager batch delete confirmation can find the checkbox by the primary
  label only, with a stable copy-installation status mock so the confirmation
  does not depend on fallback timing.
- `tests/unit/components/skill-full-detail-async-actions.test.tsx` now verifies
  the full detail delete confirmation exposes the same checkbox name when a
  copied platform installation exists.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run`:
  **1 file / 28 tests**, passing. Existing Vite CJS deprecation and
  Browserslist data-age warnings still print.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-full-detail-async-actions.test.tsx --run`:
  **1 file / 13 tests**, passing. Existing Vite CJS deprecation and
  Browserslist data-age warnings still print.
- `pnpm --filter @prompthub/desktop typecheck`: passing.
- `pnpm --filter @prompthub/desktop lint`: passing.
- The renderer-wide native input / textarea accessible-name hint scan dropped
  from **7** to **5** remaining candidates after this pass; the remaining
  candidates are hidden file inputs triggered by named controls.

## Hidden file input accessible-name follow-up

- A renderer-wide native input / textarea scan highlighted the final remaining
  accessible-name candidates: hidden file inputs used for AI image attachments,
  `.md` skill import, and icon upload. These controls are visually triggered by
  named buttons, but the native inputs still need explicit names for tests and
  assistive technology.
- Failing-first evidence:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-icon-picker.test.tsx --run`:
    failed first after changing the upload assertion to locate the file input
    by `Upload Icon`.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run -t "chooser and manual actions"`:
    failed first after asserting the hidden `.md` chooser input was reachable
    by `Upload .md`.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run -t "passes uploaded chat attachments to single-model"`:
    failed first after switching the attachment upload to the visible `Add
    Images` accessible name.
  - `tests/unit/components/variable-input-modal.test.tsx` already passed under
    the label-query assertion because the file input was wrapped by visible
    label text; it now has an explicit `aria-label` as well so the native
    control remains self-named if the surrounding structure changes.
- `AiTestModal` and `VariableInputModal` now give their hidden image upload file
  inputs explicit localized `prompt.aiTestAddImages` labels.
- `CreateSkillModal` now gives both hidden `.md` import file inputs explicit
  localized `skill.uploadMd` labels.
- `SkillIconPicker` now gives the hidden icon upload input an explicit
  localized `skill.uploadIcon` label.
- The related unit tests now use label queries for the upload inputs instead of
  anonymous DOM selectors.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-icon-picker.test.tsx --run`:
    **1 file / 2 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/create-skill-modal.test.tsx --run`:
    **1 file / 12 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-test-workbench.test.tsx --run`:
    **1 file / 14 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/variable-input-modal.test.tsx --run`:
    **1 file / 9 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.

## Database recovery database-file symlink rejection follow-up

- A follow-up pass found the same filesystem-boundary risk on database files
  themselves: directory candidates with symlinked `prompthub.db`, standalone
  backup-file candidates that were symlinks, and direct recovery from a
  symlinked `.db` file could dereference external database content.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-recovery.test.ts -t "symlink" --run`:
  failed first after adding directory DB symlink, standalone backup-file
  symlink, and direct symlinked `.db` restore regressions.
- `database/index.ts` now requires recoverable database files to be link-safe:
  directory candidates must be real directories, `data/prompthub.db` and
  legacy `prompthub.db` are only accepted when every path component below the
  candidate root is not a symlink, and standalone backup-file recovery uses
  `lstat` so symlinked `.db` files are skipped instead of copied.
- The recovery path remains fail-soft for directory sources: if a directory has
  no link-safe DB but does contain real renderer/workspace/file storage, that
  sidecar data can still be recovered; symlink-only DB sources are reported as
  having no recoverable data.
- Stable data-recovery documentation now records that recovery database files
  and standalone backup files must be link-safe and must not be dereferenced
  through symlinks.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-recovery.test.ts -t "symlink" --run`:
    **1 file / 8 selected tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-recovery.test.ts --run`:
    **1 file / 38 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-recovery.test.ts tests/unit/main/upgrade-backup.test.ts tests/unit/main/upgrade-backup-restore.test.ts tests/unit/main/upgrade-backup-startup.test.ts tests/unit/main/data-layout-migration.test.ts --run`:
    **5 files / 85 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched recovery implementation/test/spec
    files: clean.
  - `git diff --check -- apps/desktop/src/renderer/components/prompt/AiTestModal.tsx apps/desktop/src/renderer/components/prompt/VariableInputModal.tsx apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx apps/desktop/src/renderer/components/skill/SkillIconPicker.tsx apps/desktop/tests/unit/components/ai-test-workbench.test.tsx apps/desktop/tests/unit/components/variable-input-modal.test.tsx apps/desktop/tests/unit/components/create-skill-modal.test.tsx apps/desktop/tests/unit/components/skill-icon-picker.test.tsx spec/changes/active/desktop-renderer-ui-test-coverage/tasks.md spec/changes/active/desktop-renderer-ui-test-coverage/implementation.md`:
    clean.
  - Renderer-wide native input / textarea accessible-name hint scan now reports
    `nativeInputTextareaWithoutNameHint=0`, down from **5** remaining
    candidates before this pass.

## Shared Modal dialog semantics follow-up

- A renderer dialog-semantics audit found that the shared `Modal` primitive
  rendered visual titles, subtitles, and close controls but did not expose the
  modal container as a `dialog` with `aria-modal` and title/description
  associations.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx --run -t "renders title|generic accessible name"`:
  failed first because the titled modal could not be found by
  `role="dialog"` / `Edit prompt`, and the titleless modal had no generic
  dialog name.
- `Modal` now marks its container as `role="dialog"` with `aria-modal="true"`.
  Titled modals bind `aria-labelledby` to the rendered `h2`, subtitle text is
  bound through `aria-describedby`, and titleless modals use the localized
  `common.dialog` fallback name.
- The no-title branch also avoids a dangling `aria-describedby` reference when
  callers pass a subtitle that is not rendered without a title.
- `tests/unit/components/modal.test.tsx` now verifies the titled dialog role,
  modal state, accessible description, localized titleless fallback name, and
  missing dangling description reference.
- `common.dialog` was added to all seven renderer locales.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx --run -t "renders title|generic accessible name"`:
    **1 file / 2 selected tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx --run`:
    **1 file / 13 tests**, passing.
  - Locale JSON parse check for `en`, `zh`, `zh-TW`, `ja`, `fr`, `de`, and
    `es`: passing.
  - Renderer dialog role scan reports `dialogRoleWithoutAriaModal=0`.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.

## Shared Modal focus-management follow-up

- A follow-up focus audit found that the shared `Modal` primitive had dialog
  semantics but still did not move keyboard focus into the modal on open or
  restore focus to the triggering control on close. This left keyboard users
  visually inside a modal while the active element could remain behind it.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx --run -t "moves focus|auto-focused"`:
  failed first because the dialog container was not focusable and did not
  receive focus after opening. The same selected run also protected the
  existing child `autoFocus` behavior.
- `Modal` now records the previously focused element when it opens, focuses the
  dialog container after the portal has actually rendered, and restores focus
  on close / unmount when the previous element is still connected.
- The focus-in behavior is intentionally conditional: if a child control has
  already focused itself inside the modal, the shared container does not steal
  focus.
- `tests/unit/components/modal.test.tsx` now verifies open focus transfer,
  close focus restoration, focusable dialog `tabIndex`, and child `autoFocus`
  preservation.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx --run -t "moves focus|auto-focused"`:
    **1 file / 2 selected tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/modal.test.tsx --run`:
    **1 file / 15 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.

## Confirm dialog alert semantics and focus restoration follow-up

- A shared confirm-dialog audit found that `ConfirmDialog` already focused the
  cancel action on open, but the visible confirmation panel was not exposed as
  an `alertdialog`, its title and message were not associated with the dialog,
  and closing the dialog left focus on `body` instead of returning to the
  triggering control.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/confirm-dialog.test.tsx --run -t "renders message|confirm action|restores focus"`:
  failed first because titled and titleless confirmations could not be found by
  `role="alertdialog"`, and the close path did not restore focus to the opener.
- `ConfirmDialog` now renders the confirmation surface as
  `role="alertdialog"` with `aria-modal="true"`, binds titles through
  `aria-labelledby`, binds message content through `aria-describedby`, and uses
  the confirmation action text as a fallback accessible name when no title is
  provided.
- `ConfirmDialog` now records the previously focused element before its delayed
  cancel-button focus, then restores focus on close / unmount when the previous
  element is still connected and focus is still inside the dialog or on `body`.
- `tests/unit/components/confirm-dialog.test.tsx` now verifies titled
  alertdialog semantics, titleless fallback naming, accessible descriptions,
  existing cancel-first focus behavior, and close focus restoration.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/confirm-dialog.test.tsx --run -t "renders message|confirm action|restores focus"`:
    **1 file / 3 selected tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/confirm-dialog.test.tsx --run`:
    **1 file / 13 tests**, passing.
  - Renderer dialog role scan reports `dialogRoleWithoutAriaModal=0`.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.

## Close and unsaved alertdialog focus follow-up

- A follow-up pass over the remaining shared confirmation-style dialogs found
  two related gaps:
  - `CloseDialog` exposed a visual title, message, and actions, but the surface
    was not an `alertdialog` and focus stayed behind the dialog on open.
  - `UnsavedChangesDialog` already focused the Save action on open, but its
    confirmation surface was not an `alertdialog` and focus was not restored to
    the opener after close.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/close-dialog.test.tsx tests/unit/components/unsaved-changes-dialog.test.tsx --run -t "alertdialog|restores focus|wires up"`:
  failed first because neither dialog could be found by `role="alertdialog"`,
  and both close paths left focus on `body` instead of returning it to the
  triggering control.
- `CloseDialog` now renders the app-close choice surface as
  `role="alertdialog"` with `aria-modal="true"`, binds the localized title and
  message through `aria-labelledby` / `aria-describedby`, focuses the dialog
  container on open, and restores focus on close / unmount.
- `UnsavedChangesDialog` now renders the save/discard confirmation as
  `role="alertdialog"` with `aria-modal="true"`, binds its localized title and
  message, preserves the existing delayed Save-button initial focus, and
  restores focus on close / unmount.
- `tests/unit/components/close-dialog.test.tsx` now verifies app-close
  alertdialog semantics, description, focusable dialog container, focus entry,
  and close focus restoration.
- `tests/unit/components/unsaved-changes-dialog.test.tsx` now verifies
  unsaved-changes alertdialog semantics, description, existing Save-first
  focus, and close focus restoration.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/close-dialog.test.tsx tests/unit/components/unsaved-changes-dialog.test.tsx --run -t "alertdialog|restores focus|wires up"`:
    **2 files / 4 selected tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/close-dialog.test.tsx tests/unit/components/unsaved-changes-dialog.test.tsx --run`:
    **2 files / 16 tests**, passing.
  - Renderer dialog role scan reports `dialogRoleWithoutAriaModal=0`.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.

## Data recovery source selection state follow-up

- After the shared `Modal` focus / dialog improvements, `DataRecoveryDialog`
  inherited the correct outer dialog semantics, but its internal recovery source
  list still exposed the selected source only through visual styling.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-recovery-dialog.test.tsx --run -t "multiple candidates"`:
  failed first after the multi-candidate regression test began asserting
  `aria-pressed` on the selected and unselected recovery source buttons.
- Each recovery source button now exposes `aria-pressed={isSelected}`, so the
  current source selection is available to assistive technology and keyboard
  users while preserving the existing preview / restore behavior.
- `tests/unit/components/data-recovery-dialog.test.tsx` now verifies the
  initial selected source is pressed, the alternate source is not pressed, and
  the pressed states swap after choosing a different recovery source.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-recovery-dialog.test.tsx --run -t "multiple candidates"`:
    **1 file / 1 selected test**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-recovery-dialog.test.tsx --run`:
    **1 file / 5 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.

## Rules history disclosure state follow-up

- A disclosure-state scan highlighted the `RulesManager` version history
  show-more / show-less control: it used chevron icons and changing visible text
  for expansion, but did not expose the expanded state on the button.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx --run -t "rules manager actions"`:
  failed first after the existing action-semantics test began asserting
  `aria-expanded="false"` before opening the history list and `"true"` after
  expanding it.
- `RulesManager` now sets `aria-expanded={showAllVersions}` on the history
  disclosure button, preserving the existing version list and snapshot preview
  behavior.
- `tests/unit/components/rules-manager.test.tsx` now verifies the disclosure
  state transition inside the existing rendered-action regression test.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx --run -t "rules manager actions"`:
    **1 file / 1 selected test**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-manager.test.tsx --run`:
    **1 file / 8 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.

## Data settings upgrade backup disclosure state follow-up

- The disclosure-state scan also highlighted the Data Settings automatic
  upgrade-backup "Show all / Collapse" control. It visually switched chevron
  direction and button text, but did not expose its collapsed / expanded state
  through the button semantics.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "latest three upgrade backups"`:
  failed first after the existing compact-list regression test began asserting
  `aria-expanded="false"` before expansion.
- `DataSettings` now sets `aria-expanded={showAllUpgradeBackups}` on the
  upgrade-backup history disclosure button, preserving the existing latest-three
  default list and expanded full-history behavior.
- `tests/unit/components/data-settings.test.tsx` now verifies the disclosure
  state before opening the full upgrade-backup history and after the button
  changes to Collapse.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run -t "latest three upgrade backups"`:
    **1 file / 1 selected test**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/data-settings.test.tsx --run`:
    **1 file / 28 tests**, passing.

## Folder parent selector disclosure state follow-up

- The same disclosure-state scan identified the folder modal parent-folder
  selector. The control rotated a chevron and opened the parent menu, but did
  not expose the open / closed state to assistive technology.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/folder-modal.test.tsx --run -t "controls explicitly typed"`:
  failed first after the existing folder-modal control semantics regression
  began asserting `aria-expanded="false"` before opening the parent selector.
- `FolderModal` now sets `aria-expanded={showParentSelect}` on the parent-folder
  selector trigger, preserving the current root-folder default and menu
  behavior.
- `tests/unit/components/folder-modal.test.tsx` now verifies the trigger state
  before and after opening the parent selector.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/folder-modal.test.tsx --run -t "controls explicitly typed"`:
    **1 file / 1 selected test**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/folder-modal.test.tsx --run`:
    **1 file / 3 tests**, passing.

## Remaining disclosure semantics scan follow-up

- The next disclosure-state pass handled the remaining true expandable controls
  from the chevron-button scan:
  - `RulesSidebarPanel` global / project section headers now expose
    `aria-expanded={!collapsedRuleSections[section.id]}`.
  - `SkillPlatformPanel` advanced project import settings now expose
    `aria-expanded={showProjectAdvanced}`.
  - Legacy `AISettings` advanced chat parameters now expose
    `aria-expanded={showAdvancedParams}`.
  - `ContextMenu` submenu parent items now expose `aria-haspopup="menu"` and
    `aria-expanded` while preserving hover-open behavior.
- Failing-first evidence:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-sidebar-panel.test.tsx --run -t "rules sidebar actions"`:
    failed first because the section header had no `aria-expanded`.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run -t "project selection"`:
    failed first because the advanced project import trigger had no
    `aria-expanded`.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run -t "advanced parameter sliders"`:
    failed first because the legacy advanced-parameter trigger had no
    `aria-expanded`.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/context-menu.test.tsx --run -t "submenu open"`:
    failed first because submenu parent items had no `aria-haspopup` /
    `aria-expanded`.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/rules-sidebar-panel.test.tsx --run`:
    **1 file / 1 test**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-platform-panel.test.tsx --run`:
    **1 file / 4 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/ai-settings-legacy.test.tsx --run`:
    **1 file / 4 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/context-menu.test.tsx --run`:
    **1 file / 10 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched disclosure files and active change docs:
    clean.
  - The chevron-button scan now reports `chevronButtonWithoutAriaExpanded=9`.
    The remaining hits are pagination, search-result navigation, and a configure
    navigation action, not expandable disclosure controls.

## Platform icon asset integrity follow-up

- A renderer asset/security scan found that two files under
  `apps/desktop/src/renderer/assets/platforms/` were named `.png` but contained
  full HTML documents instead of image data:
  - `amp.png` was an HTML sign-in page, about 79 KB.
  - `roo.png` was an HTML documentation page, about 24 KB.
- `PlatformIcon` imported `amp.png`, so the bad asset could enter the renderer
  bundle and fail image rendering for Amp instead of using the existing fallback
  icon path.
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/platform-icon.test.tsx --run -t "real PNG"`:
  failed first after the platform asset integrity test began checking PNG magic
  bytes and reported `["amp.png", "roo.png"]`.
- `PlatformIcon` no longer imports or maps `amp.png`; Amp now uses the existing
  Zap fallback icon until a real verified asset is added.
- The bad `amp.png` and `roo.png` files were deleted, removing about 100 KB of
  invalid asset payload from the renderer source tree.
- `tests/unit/components/platform-icon.test.tsx` now verifies every bundled
  `.png` platform asset starts with the PNG signature.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/platform-icon.test.tsx --run -t "real PNG"`:
    **1 selected test**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/platform-icon.test.tsx --run`:
    **1 file / 2 tests**, passing.
  - `find apps/desktop/src/renderer/assets/platforms -maxdepth 1 -type f -name '*.png' -print0 | xargs -0 file`:
    all remaining `.png` platform assets are reported as PNG image data.
  - `rg -n "amp\\.png|roo\\.png" apps/desktop/src/renderer apps/desktop/tests packages spec -S`:
    no remaining references.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched platform icon files, removed assets, and
    active change docs: clean.

## Main Help menu official link follow-up

- A desktop shell link scan found that the main-process Help menu still opened
  placeholder repository URLs:
  - `https://github.com/xxx/PromptHub`
  - `https://github.com/xxx/PromptHub/issues`
- The About settings page, updater, CLI installer, and release helpers already
  point at the official `legeling/PromptHub` repository, so the Help menu was
  the inconsistent user-facing path.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/menu.test.ts --run`:
  failed first after the new menu regression test invoked the Help menu click
  handlers and captured `shell.openExternal("https://github.com/xxx/PromptHub")`.
- `menu.ts` now uses local official repository constants for the Help menu
  documentation and issue-reporting actions:
  - `https://github.com/legeling/PromptHub`
  - `https://github.com/legeling/PromptHub/issues`
- `tests/unit/main/menu.test.ts` mocks Electron's `Menu` and `shell`, captures
  the built menu template, invokes the Help menu actions directly, and asserts
  the placeholder repository is not opened.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/menu.test.ts --run`:
    **1 file / 1 test**, passing.

## Main external window protocol allowlist follow-up

- The same desktop shell pass found that `createWindow` handled every
  renderer `target="_blank"` / new-window URL by directly calling
  `shell.openExternal(url)` before denying the in-app window. That meant
  user-authored markdown or other renderer content could ask the OS to open
  unsafe or app-internal protocols such as `javascript:`, `file:`, `data:`,
  `local-image:`, or malformed relative URLs.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/external-links.test.ts --run`:
  failed first with the permissive behavior because the new allowlist regression
  expected unsafe protocols to be denied without calling `shell.openExternal`.
- Added `apps/desktop/src/main/external-links.ts` as a focused main-process
  policy helper. The main window now delegates `setWindowOpenHandler` to
  `handleExternalWindowOpen`, keeping the existing `{ action: "deny" }`
  behavior while only opening `http:`, `https:`, `mailto:`, and `tel:` URLs in
  the system handler.
- The helper rejects empty, whitespace-padded, relative, malformed, file,
  JavaScript, data, FTP, and app-local media protocol URLs before they reach
  Electron's `shell.openExternal`.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/external-links.test.ts --run`:
    **1 file / 13 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/menu.test.ts --run`:
    **1 file / 1 test**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **2 files / 14 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched shell-link files and active change docs:
    clean.

## Main directory-open validation follow-up

- The shell boundary pass also found that `shell:openPath` validated existing
  non-directory paths, but if `lstat` failed it still called Electron
  `shell.openPath` with the raw input. This allowed missing paths and URL-like
  strings such as `https://example.com` to be handed to the OS shell and
  reported as success if Electron returned an empty error string.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/shell-open-path.test.ts --run`:
  failed first after adding missing-path and URL-like input regressions because
  both cases returned `{ success: true }` under the old permissive fallback.
- `openDirectoryPath` now fails closed when the path cannot be accessed during
  `lstat`, returning `Directory does not exist or cannot be accessed` and never
  invoking `shell.openPath`. Existing symlink reveal behavior and existing
  non-directory rejection are preserved.
- A follow-up path-token check found two expansion edge cases in the same helper:
  - `~team/skills` was incorrectly expanded as if it were the current user's
    home-relative path.
  - Lowercase `%appdata%` was not expanded, even though Windows environment
    variable spelling is commonly case-insensitive and the platform installer
    path resolver already handles this form.
- `expandShellOpenPath` now only expands bare current-user home tokens (`~`,
  `~/...`, and `~\...`) and expands `%APPDATA%` case-insensitively.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/shell-open-path.test.ts --run`:
    **1 file / 7 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **2 files / 14 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **3 files / 21 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched shell path / link files and active
    change docs: clean.

## Media open shell failure propagation follow-up

- The main-process media IPC pass found that `IMAGE_OPEN` and `VIDEO_OPEN`
  awaited Electron `shell.openPath`, but ignored Electron's string error
  contract. If the OS reported a failure such as "No application is associated
  with the file", the handlers still returned `true`, so the renderer could
  show success even though nothing opened.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts --run`:
  failed first after adding image and video OS-open failure regressions because
  both handlers returned `true` when the mocked shell returned a non-empty error
  string.
- `image.ipc.ts` now routes image and video open requests through
  `openPathWithResult`, which returns `false` for non-empty `shell.openPath`
  error strings while preserving thrown-error handling and filename traversal
  validation.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts --run`:
    **1 file / 6 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **3 files / 21 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **4 files / 27 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched media open files and active change docs:
    clean.

## Local media protocol path boundary follow-up

- A main-process local media protocol pass found that `local-image://` and
  `local-video://` path resolution lived inline in `index.ts`, duplicated the
  same traversal checks, and depended on platform `path.normalize` behavior for
  mixed slash / backslash input.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/local-media-protocol.test.ts --run`:
  failed first because there was no pure local media protocol resolver to test.
- `local-media-protocol.ts` now owns `resolveLocalMediaProtocolPath`, which
  accepts only the expected scheme, decodes percent-encoded paths, rejects
  malformed encodings, absolute paths, `.` / `..` segments, encoded traversal,
  and backslash traversal, then resolves the final path under the configured
  media directory. The `local-image` and `local-video` protocol registrations
  now share this helper.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/local-media-protocol.test.ts --run`:
    **1 file / 3 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/local-media-protocol.test.ts tests/unit/main/image-ipc.test.ts --run`:
    **2 files / 9 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched local media protocol implementation,
    tests, main-process registration, and active change docs: clean.

## Media URL encoding parity follow-up

- A renderer media URL pass found that `resolveLocalImageSrc` encoded desktop
  `local-image://` filenames, while `resolveLocalVideoSrc` appended raw desktop
  filenames. Video filenames containing URL-significant characters such as
  spaces, `#`, or `?` could therefore be parsed as a truncated or malformed
  `local-video://` URL before reaching the main-process protocol resolver.
- `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts --run`:
  failed first after adding the special-character filename regression because
  `resolveLocalVideoSrc("clip #1?.mp4")` returned
  `local-video://clip #1?.mp4` instead of the encoded protocol URL.
- `media-url.ts` now encodes desktop local video filenames the same way it
  already encoded desktop local image filenames and web media route segments.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts --run`:
    **1 file / 3 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts tests/unit/main/local-media-protocol.test.ts --run`:
    **2 files / 6 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts tests/unit/main/local-media-protocol.test.ts tests/unit/utils/media-url.test.ts --run`:
    **3 files / 14 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched media URL implementation, tests, media
    IPC files, and active change docs: clean.

## Local media URL idempotency follow-up

- The same renderer media URL pass found that helpers accepted existing
  `local-image://` / `local-video://` URLs but treated the already encoded path
  as a raw filename. Re-rendering `local-image://hero%20%231%3F.png` therefore
  produced `local-image://hero%2520%25231%253F.png`, breaking protocol URLs that
  had already been normalized once. Background image settings had a related
  issue: `local-image://hero%20image.png` was stored as `hero%20image.png`
  instead of the decoded file name.
- `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts --run`:
  failed first after adding protocol-idempotency coverage because encoded
  local image URLs were double-encoded.
- `pnpm --filter @prompthub/desktop test -- tests/unit/stores/settings-background-image.test.ts --run`:
  failed first after adding encoded background-image protocol coverage because
  the settings store kept `%20` in the stored file name.
- `media-url.ts` now decodes only values that already carry the relevant local
  media protocol before re-encoding them into a canonical protocol/API URL.
  Raw filenames still preserve literal `%` characters. `settings.store.ts`
  applies the same protocol-only decode rule for background-image filenames.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts --run`:
    **1 file / 4 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/stores/settings-background-image.test.ts --run`:
    **1 file / 10 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts tests/unit/main/local-media-protocol.test.ts tests/unit/stores/settings-background-image.test.ts --run`:
    **3 files / 17 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts tests/unit/main/local-media-protocol.test.ts tests/unit/utils/media-url.test.ts tests/unit/stores/settings-background-image.test.ts --run`:
    **4 files / 25 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched media URL, settings, media IPC, tests,
    and active change docs: clean.

## Web media API route idempotency follow-up

- A web-runtime media URL pass found the same re-entry issue for already
  resolved self-hosted media routes. Passing `/api/media/images/hero%20.png`
  back through `resolveLocalImageSrc` produced an encoded filename route such as
  `/api/media/images/%2Fapi%2Fmedia%2Fimages%2Fhero%2520.png` instead of
  preserving the route. The same bug applied to `/api/media/videos/...`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts --run`:
  failed first after adding web media API route idempotency coverage.
- `media-url.ts` now treats `/api/media/images/` and `/api/media/videos/`
  sources as already resolved media URLs for their matching helper, preserving
  them without another filename encoding pass.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts --run`:
    **1 file / 5 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/utils/media-url.test.ts tests/unit/main/local-media-protocol.test.ts tests/unit/stores/settings-background-image.test.ts --run`:
    **3 files / 18 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts tests/unit/main/local-media-protocol.test.ts tests/unit/utils/media-url.test.ts tests/unit/stores/settings-background-image.test.ts --run`:
    **4 files / 26 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched media URL, settings, media IPC, tests,
    and active change docs: clean.

## Media clear partial-failure follow-up

- A main-process media cleanup pass found that `IMAGE_CLEAR` and `VIDEO_CLEAR`
  used an all-or-nothing unlink batch. One non-file entry or transient per-entry
  unlink failure caused the whole clear operation to return `false`, even when
  other media entries were removable.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts --run`:
  failed first after adding image and video clear regressions because the IPC
  handler still returned `false` when a single `fs.unlink` call rejected.
- `image.ipc.ts` now routes both clear handlers through `clearMediaDirectory`,
  which treats a missing media directory as already clear, deletes entries one
  by one, logs and skips per-entry unlink failures, and returns `false` only for
  top-level clear failures such as directory listing errors.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts tests/unit/main/local-media-protocol.test.ts --run`:
    **2 files / 11 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched media clear implementation, tests, and
    active change docs: clean.
  - `rg -n "[ \t]+$"` for the new local media protocol source and test files:
    no trailing whitespace reported.

## macOS updater manual installer open failure follow-up

- The same Electron shell failure-propagation scan found that the macOS updater
  install path called `shell.openPath` for the downloaded DMG, or the Downloads
  folder fallback, without awaiting or interpreting Electron's non-empty string
  error contract. If the OS failed to open the file/folder, the install handler
  still returned `{ success: true, manual: true }`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/updater-install.test.ts --run`:
  failed first on macOS after adding a manual-installer open failure regression
  because the handler still returned success when `shell.openPath` resolved to
  `No application can open this file`.
- `updater.ts` now uses `openPathOrError` in the macOS manual installation
  branch. The handler preserves the upgrade backup path but returns
  `{ success: false, manual: true, error: ... }` when the OS cannot open the
  downloaded update or Downloads fallback.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/updater-install.test.ts --run`:
    **1 file / 4 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **4 files / 27 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/updater-install.test.ts tests/unit/main/image-ipc.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **5 files / 32 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched updater install files and active change
    docs: clean.

## Updater downloaded installer reveal validation follow-up

- `updater:openDownloadedUpdate` trusted `autoUpdater.installerPath` whenever
  the field existed. If the path was stale or the installer had already been
  moved/deleted, the handler still called `shell.showItemInFolder` and returned
  `{ success: true }`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/updater-install.test.ts --run`:
  failed first after adding a stale-installer-path regression because
  `shell.showItemInFolder("/tmp/missing-installer.exe")` was still called.
- `updater.ts` now checks `fs.existsSync(installerPath)` before revealing the
  downloaded installer. Missing installer paths fall back to opening Downloads
  and return `{ success: false, error: "Downloaded update file is missing" }`
  instead of reporting a successful reveal.
- A follow-up fallback regression also covers the no-download case where opening
  the Downloads folder itself fails. `updater:openDownloadedUpdate` is now async
  and uses `openPathOrError(downloadDir)` so that the fallback failure is
  included in the returned error instead of being silently swallowed.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/updater-install.test.ts --run`:
    **1 file / 6 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/image-ipc.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **4 files / 27 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/updater-install.test.ts tests/unit/main/image-ipc.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **5 files / 33 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched updater install files and active change
    docs: clean.

## Data layout migration symlink rejection follow-up

- The storage-boundary scan found that legacy data-layout migration used
  `statSync`, fast-path `rename`, and recursive copy without rejecting symbolic
  links first. A root legacy entry such as `workspace -> /outside/path`, or a
  nested symlink inside `workspace/prompts/`, could be treated as a successful
  migration and leave an external reference inside `data/`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-layout-migration.test.ts --run`:
  failed first after adding root-directory and nested-file symlink regressions
  because both scenarios returned `status: "migrated"`.
- `data-layout-migration.ts` now uses `lstatSync` before moving a legacy entry,
  rejects source and target symlinks, and recursively rejects symlinks inside
  source and existing target directories before the `rename` / copy-verify-delete
  move path runs.
- The migration remains fail-soft: rejected symlink entries are recorded as
  `failedEntries`, the legacy source is preserved, and normal non-symlink
  migration behavior is unchanged.
- Stable data-layout documentation now records that migration refuses symlinked
  legacy entries instead of dereferencing or preserving links into `data/`.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-layout-migration.test.ts --run`:
    **1 file / 12 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-layout-migration.test.ts tests/unit/main/updater-install.test.ts tests/unit/main/image-ipc.test.ts tests/unit/main/shell-open-path.test.ts tests/unit/main/external-links.test.ts tests/unit/main/menu.test.ts --run`:
    **6 files / 45 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched data-layout migration files, active
    change docs, and stable data-layout doc: clean.

## Upgrade backup and restore symlink rejection follow-up

- The follow-up backup/recovery pass found the same external-reference class in
  the pre-upgrade snapshot flow. `createUpgradeDataSnapshot` used recursive
  `fs.promises.cp` without rejecting symbolic links, so a symlink inside
  `workspace` could be preserved in the backup and later restored into
  `userData`.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/upgrade-backup.test.ts --run`:
  failed first after adding a symlinked-user-data regression because snapshot
  creation still resolved successfully and included `workspace` in
  `copiedItems`.
- `upgrade-backup.ts` now rejects symlinks in the snapshot copy filter after
  transient database files are skipped. If snapshot creation fails, the
  just-created backup directory is removed so the backup root is not left with
  a manifest-less partial snapshot.
- Legacy sibling backup migration now uses the same copy filter. A legacy
  backup snapshot containing a symlink is skipped, the partial new-root copy is
  removed, and the original legacy backup remains available for manual
  inspection or a future retry.
- The restore side had a separate old-backup risk: a valid manifest snapshot
  could already contain a symlink. `pnpm --filter @prompthub/desktop test -- tests/unit/main/upgrade-backup-restore.test.ts --run`
  failed first because restore succeeded and copied the symlink into current
  data.
- `upgrade-backup-restore.ts` now rejects symlink sources before restore copy
  and through the recursive copy filter. The existing insurance-snapshot
  rollback path then restores current data and reports a failure instead of
  importing the external link.
- Because layout migration creates a pre-migration upgrade snapshot before it
  moves legacy entries, `data-layout-migration.ts` now converts only symlink
  snapshot failures into its own fail-soft `partial-failure` result. Other
  snapshot failures still surface as hard errors.
- Stable data-recovery documentation now records that pre-upgrade backup and
  restore refuse symlinks instead of dereferencing or preserving them, including
  migrated legacy backup snapshots.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/upgrade-backup.test.ts --run`:
    **1 file / 22 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/upgrade-backup-restore.test.ts --run`:
    **1 file / 7 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/upgrade-backup.test.ts tests/unit/main/upgrade-backup-restore.test.ts tests/unit/main/upgrade-backup-startup.test.ts tests/unit/main/data-layout-migration.test.ts --run`:
    **4 files / 47 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched upgrade backup / restore / migration
    files, active change docs, and stable data-recovery doc: clean.

## Database recovery asset symlink skipping follow-up

- A follow-up pass through `performDatabaseRecovery` found that the database
  recovery path merged associated asset/workspace/browser-storage directories
  with `copyDirMerge`, which used `statSync`/`copyFileSync` behavior that could
  follow symlinked source directories or files and import content from outside
  the selected recovery source.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-recovery.test.ts --run`:
  failed first after adding symlinked asset-directory and symlinked asset-file
  regressions because both external files appeared under the target `images`
  directory after recovery.
- `database/index.ts` now uses `lstatSync` for recovery merge source checks.
  Root asset directories that are symlinks are skipped, and recursive merge
  skips symlink entries before copying files. Normal DB recovery, regular asset
  merge, no-overwrite behavior, and renderer storage recovery are unchanged.
- The candidate detection pass now uses the same link-safe filesystem boundary
  for workspace prompt counts, file/browser storage sizes, and skill directory
  counts. Candidates whose only apparent data is reached through symlinks are
  no longer surfaced in the recovery dialog.
- Stable data-recovery documentation now records that database recovery must not
  import symlinked sidecar assets from outside the selected recovery source,
  and that recovery candidate detection must not count symlinked external data.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-recovery.test.ts --run`:
    **1 file / 34 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-recovery.test.ts tests/unit/main/upgrade-backup.test.ts tests/unit/main/upgrade-backup-restore.test.ts tests/unit/main/upgrade-backup-startup.test.ts tests/unit/main/data-layout-migration.test.ts --run`:
    **5 files / 79 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop lint`: passing.
  - `git diff --check` for the touched database recovery files, active change
    docs, and stable data-recovery doc: clean.

## Follow-up recommended

- A small `tests/helpers/store.ts` factory that snapshots & restores Zustand
  store state per test, so view-level tests can wire realistic seeded data
  without poking internals.
- A `tests/helpers/window-overrides.ts` helper that wraps the window mock
  installer for ad-hoc namespace stubs (we did this inline for
  `window.api.settings` in `general-settings.test.tsx`).
- After those helpers land, revisit the deferred Wave 2 items above.

## Release-harness closeout

- `pnpm verify:release:quick` surfaced a desktop unit-test regression in
  `tests/unit/components/ai-settings-prototype.test.tsx`: fetched model
  selection assertions still targeted the older concatenated accessible names
  such as `gpt-4.1openai`, while the current UI exposes clearer action names
  such as `Select model gpt-4.1`.
- The test now uses a small `getFetchedModelButton(modelId)` helper scoped to
  the `Fetch Models` modal and selects model rows by the current button
  semantics. This keeps the batch-add coverage aligned with the production UI
  and avoids matching unrelated page-level `Add Model` actions.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-settings-prototype.test.tsx`:
    **1 file / 33 tests**, passing.
  - `pnpm verify:release:quick`: rerun completed shared/db/core typecheck,
    CLI lint/typecheck/test/build, desktop lint/typecheck/unit/build, web
    lint/typecheck, and web test execution. The only failing item was
    `tests/integration/docker-runtime-deps.integration.test.ts`, whose body
    runs `pnpm install --prod --frozen-lockfile --ignore-scripts` and needs
    registry/network access.
  - `pnpm --filter @prompthub/web test -- --run tests/integration/docker-runtime-deps.integration.test.ts --reporter verbose`:
    rerun with network permission, **1 file / 1 test**, passing.
  - `git diff --check`: clean.

## Residual test-quality scan

- A final scan for `as any`, `@ts-ignore`, and `toMatchSnapshot()` across the
  desktop/web/CLI/shared test surfaces found existing legacy matches in older
  main-process, service, store, and integration tests. This means the broad
  "No `as any`, no `@ts-ignore`, no `toMatchSnapshot()`" verification gate
  cannot honestly be marked complete for the repository or active test suite.
- The `AISettingsPrototype` release-harness fix itself does not introduce any
  of those forbidden patterns, and the remaining matches are tracked as
  legacy cleanup rather than being folded into this release-harness closeout.

## Interactive element semantics sweep

- A renderer/client scan for native `<button>` elements without explicit
  `type` found no remaining production TSX hits.
- A renderer/client scan for `target="_blank"` anchors without `rel` found no
  remaining production TSX hits.
- A renderer/client scan for `<img>` elements without `alt` found no remaining
  production TSX hits.
- A renderer/client scan for non-interactive elements with `onClick` found two
  actionable hits:
  - `MainContent` generated-image previews now expose the clickable image as a
    real non-submit button while keeping the nested image decorative.
  - `PromptKanbanView` card titles now keep their heading semantics while the
    title action itself is a real non-submit button with a localized accessible
    detail label.
- The only remaining non-interactive `onClick` scan hit is `LocalImage`'s
  internal implementation, which is a false positive because callers with
  `onClick` are wrapped in a native non-submit button.
- Verification:
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/prompt-kanban-view.test.tsx tests/integration/components/main-content-inline-edit.integration.test.tsx`:
    **2 files / 20 tests**, passing.
  - `git diff --check` for the touched MainContent / PromptKanban files:
    clean.

## Clipboard copy failure follow-up

- A renderer clipboard scan found direct `navigator.clipboard.writeText()`
  calls in Skill detail surfaces and About settings, while prompt surfaces
  already used a textarea fallback wrapper.
- Added shared `utils/clipboard.ts` and kept `prompt-copy-utils` re-exporting
  `copyTextToClipboard()` so existing prompt callers keep the same import
  surface.
- `AboutSettings`, `SkillDetailView`, and `SkillFullDetailPage` now use the
  shared clipboard helper. Skill copy actions only show copied feedback after
  the copy succeeds; failures show the localized `Copy failed` toast instead
  of a false success state.
- `skill-detail-view-timers.test.tsx` no longer uses fake timers for the copy
  timer cleanup case, because that left Testing Library async waits in later
  tests exposed to fake timer state. The test still verifies the copy feedback
  reset timer is scheduled and cleared on unmount.
- The production clipboard scan now reports direct `clipboard.writeText`
  access only inside the shared clipboard helper.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-detail-view-timers.test.tsx tests/unit/components/prompt-copy-utils.test.ts tests/unit/components/about-settings.test.ts tests/unit/components/skill-full-detail-async-actions.test.tsx`:
    **4 files / 35 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `git diff --check` for the touched clipboard, prompt copy, settings, Skill
    detail, and test files: clean.

## Global event listener cleanup sweep

- Scanned production desktop renderer and web client code for
  `addEventListener` / `removeEventListener` usage on `window`, `document`,
  `MediaQueryList`, and temporary DOM elements.
- Reviewed conditional React effects, custom app events, drag listeners,
  paste/keyboard handlers, modal dismissal handlers, resize/scroll listeners,
  and the web desktop file-input bridge.
- No actionable listener leak or add/remove callback identity mismatch was
  found in this pass. The temporary web file input removes itself after
  `change` or `cancel`, and the remaining global listeners are paired with
  matching cleanup paths.
- No production code change was made for this sweep.
- Verification:
  - `rg -n "addEventListener|removeEventListener" apps/desktop/src apps/web/src packages --glob '*.{ts,tsx}'`:
    reviewed.
  - `git diff --check` for the current review/fix files: clean before this
    documentation-only note.

## AI response Markdown link safety follow-up

- A renderer Markdown-link scan found that prompt content already uses
  `resolvePromptMarkdownHref()` to downgrade unsafe protocols to plain text,
  but AI test responses still used a direct `ReactMarkdown` renderer.
- Model-generated responses containing links such as `javascript:` or `file:`
  were sanitized by rehype, but still rendered as empty clickable anchors. This
  was misleading and inconsistent with prompt Markdown rendering.
- `AiTestModal` now applies the same prompt Markdown link resolver to AI
  response links. Unsafe protocols render as text, while safe `http`, `https`,
  `mailto`, `tel`, and local hash links keep their intended link behavior.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-test-workbench.test.tsx -t "unsafe AI response markdown links"`:
    failed first because `javascript:` remained inside an anchor, then passed
    after the link renderer override.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-test-workbench.test.tsx`:
    **1 file / 17 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.

## AI generated-image download cleanup follow-up

- A generated-image download scan found that `AiTestModal` had a component-local
  download path even though `utils/download-generated-image.ts` already owns
  generated-image URL validation, remote blob download, temporary anchor
  cleanup, and object URL revocation.
- The local `AiTestModal` path appended a temporary anchor and removed it only
  after `anchor.click()` returned. If the browser or test environment blocked
  the click and threw, the temporary DOM node could remain attached.
- `AiTestModal` now reuses `downloadGeneratedImage()` for generated-image
  downloads. Remote image downloads use the shared fetch/blob/object URL path,
  and temporary anchors plus object URLs are cleaned up even when clicking the
  download link fails.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-test-workbench.test.tsx -t "cleans up generated image download links"`:
    failed first because the component-local download path did not fetch or
    revoke the generated-image object URL, then passed after the shared helper
    was reused.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-test-workbench.test.tsx`:
    **1 file / 18 tests**, passing.

## Update release-note Markdown link safety follow-up

- The update dialog release-note renderer also used a direct `ReactMarkdown`
  instance. Unsafe release-note links could therefore survive as clickable
  anchors without an accepted destination, which was inconsistent with prompt
  and AI-response Markdown behavior.
- `UpdateDialog` now applies `resolvePromptMarkdownHref()` to release-note
  links. Unsafe protocols render as text, while safe `http`, `https`,
  `mailto`, `tel`, and local hash links remain clickable with
  `noopener noreferrer`.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/update-dialog.test.tsx -t "unsafe release-note"`:
    **1 focused test**, passing.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/update-dialog.test.tsx`:
    **1 file / 8 tests**, passing.

## Appearance background-image failure feedback follow-up

- A desktop file-selection pass found that `AppearanceSettings` reset the
  background-image picker loading state when `selectImage()` or `saveImage()`
  failed, but did not show any user-visible error.
- The background image picker now reports a localized error toast when the
  selected file cannot be saved or the picker/save call throws. User cancel
  still stays quiet, and successful selections still call
  `applyBackgroundImageSelection()`.
- Added `settings.backgroundImageSaveFailed` to all renderer locales.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/appearance-settings.test.tsx -t "background image save fails"`:
    failed first because no toast was shown when `saveImage()` returned no file,
    then passed after the failure feedback was added.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/appearance-settings.test.tsx`:
    **1 file / 7 tests**, passing.

## Skill code pane source action semantics follow-up

- A local-source action scan found that `SkillCodePane` rendered local Skill
  source metadata as an `<a>` with no `href`. Mouse clicks still opened the
  folder through `window.electron.openPath()`, but the element was not exposed
  as a standard keyboard-accessible button or real link.
- Local source metadata now renders as a real `button type="button"` and keeps
  the same visual source-card layout. Remote source metadata remains a normal
  external link with `target="_blank"` and `noopener noreferrer`.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-code-pane.test.tsx -t "local source metadata"`:
    failed first because no local-source button was present, then passed after
    the local card was converted to a button.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-code-pane.test.tsx`:
    **1 file / 2 tests**, passing.

## Skill code pane local source failure feedback follow-up

- A local-source open failure pass found that `SkillCodePane` called
  `window.electron.openPath()` for local Skill source folders but ignored a
  failed `{ success: false }` result or thrown error. Users therefore got no
  feedback when the folder was missing, moved, or rejected by the OS.
- Local source opens now check failed results and thrown errors, then show a
  localized error toast with the returned error message or
  `skill.openLocalSourceFailed`. The local source action keeps the button
  semantics from the previous follow-up.
- Added `skill.openLocalSourceFailed` to all renderer locales.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-code-pane.test.tsx -t "open failures"`:
    **1 focused test**, passing.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-code-pane.test.tsx`:
    **1 file / 3 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.

## About settings web update failure feedback follow-up

- A web-runtime update-check pass found that `AboutSettings` reset the web
  update state to idle when the GitHub release lookup failed, but did not show
  any user-visible feedback. Users could click Check for Updates and see no
  explanation when the network, GitHub API, or response failed.
- A malformed release-response pass then found that a successful GitHub
  response without `tag_name` was treated as "current version is latest",
  because the parsed latest version collapsed to an empty string.
- A current-version boundary pass found that if `/health` did not return the
  deployed web version, the release check could still mark the unknown current
  version as latest and render an empty version string.
- Web update checks now show the existing localized
  `settings.updateCheckFailed` error toast when the release lookup fails or
  lacks a release tag, or when the current web version is unavailable, while
  preserving the idle reset so the user can retry.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/about-settings.test.tsx -t "web update check failures"`:
    failed first because no toast was shown, then passed after the failure
    feedback was added.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/about-settings.test.tsx -t "malformed web update responses"`:
    failed first because an empty release tag was reported as latest, then
    passed after missing tags were routed through the failure path.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/about-settings.test.tsx -t "current web version is unknown"`:
    failed first because an unknown current version rendered as latest with an
    empty version string, then passed after missing current versions were routed
    through the failure path.
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/about-settings.test.tsx`:
    **1 file / 9 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.

## MCP and Plugin parity coverage follow-up

- A module coverage scan found that Skill surfaces already had much denser
  focused regression coverage than MCP and Plugin surfaces. MCP/Plugin coverage
  was strengthened without expanding the existing oversized manager test files.
- Added a Plugin store regression for delete behavior. The test verifies that
  delete options are passed through to the desktop bridge, and that deleting one
  Plugin clears only that Plugin's package health, source update, and version
  caches while preserving unrelated Plugin runtime caches.
- Added an MCP store regression for delete behavior. The test verifies that
  deleting the selected MCP server removes it from the library, moves selection
  to the first remaining server, and clears stale preview state.
- Added standalone MCP batch deploy dialog coverage. The tests verify enabled
  target filtering, disabled-target warnings, select/deselect behavior,
  non-submit button semantics, hidden decorative media, and duplicate-click
  protection while a batch deploy is pending.
- Added standalone Plugin Agent target picker coverage. The tests verify
  copy/symlink distribution mode, selected Agent target payloads,
  non-submit button semantics, hidden decorative media, clear/empty selection
  behavior, and duplicate-click protection while distribution is pending.
- The new duplicate-click tests exposed two real race conditions: rapid repeated
  clicks could call MCP batch deploy or Plugin Agent distribution twice before
  React re-rendered the disabled state. Both components now use a local
  in-flight ref guard in addition to visible loading state.
- Verification:
  - `pnpm --filter @prompthub/desktop test -- tests/unit/stores/plugin.store.test.ts --run`:
    **1 file / 13 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/stores/mcp.store.test.ts --run`:
    **1 file / 4 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/mcp-batch-deploy-dialog.test.tsx --run`:
    **1 file / 4 tests**, passing.
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/plugin-agent-target-picker.test.tsx --run`:
    **1 file / 3 tests**, passing.
  - MCP/Plugin focused suite:
    `pnpm --filter @prompthub/desktop test -- tests/unit/components/mcp-batch-deploy-dialog.test.tsx tests/unit/components/plugin-agent-target-picker.test.tsx tests/unit/stores/plugin.store.test.ts tests/unit/stores/mcp.store.test.ts --run`:
    **4 files / 24 tests**, passing.
  - `pnpm --filter @prompthub/desktop typecheck`: passing.
  - `git diff --check`: passing.
