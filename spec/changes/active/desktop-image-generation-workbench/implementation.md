# Desktop Image Generation Workbench Implementation

## Product

Desktop

## Status

in progress. The first Desktop slice exists; broader performance, recovery and release acceptance remain open.

- Production implementation: first Desktop vertical slice implemented; broader
  performance, backup/recovery, sync exclusion, and release-harness work remains.

## Current-State Findings

- Navigation clarification: the workbench belongs to Prompts secondary navigation,
  peer to relationship graph, rather than the global left rail.
- Product defaults recorded: generated assets outlive their source Prompt, a batch is
  capped at 100 outputs, and one batch uses one model.
- Data-layout review corrected the draft boundary: generation manifests and originals
  live under `data/` as filesystem truth; SQLite remains a rebuildable index.
- Sync decision recorded: generation records and originals remain device-local and are
  excluded from every remote payload in the first release.
- Desktop 已有 image Prompt、参考图、image-generation route 和多个图片模型 adapter。
- Prompt AI 测试当前以单张结果为主，测试抽屉持有临时生成状态。
- 生成图片可以下载或添加回 Prompt，但没有独立的持久批次、attempt、output 和
  provenance 数据边界。
- Prompt gallery 展示 Prompt 的首张媒体，不能替代批量作品工作台。
- 图片文件已经通过 runtime path 和 main-process IPC 落到本地 assets，新增设计必须
  复用该安全边界，不能让 renderer 直接操作任意路径。

## Shipped

- Accepted UI concept stored at `assets/workbench-ui-concept.png`; it confirms the
  Prompts secondary-navigation placement and canvas-first workbench hierarchy.
- Added the Prompts secondary-navigation entry and a dedicated Desktop image
  generation workbench.
- Added compact generation controls, resolved Prompt variables and references,
  result filters, sortable density modes, multi-selection, output actions, a fixed
  batch queue, progress, and provenance detail.
- Added local generation contracts, runtime paths, manifest-backed storage,
  SQLite indexing, IPC/preload exposure, runner orchestration, retry/cancel/favorite,
  recovery, and explicit copy-to-Prompt-media behavior.
- Generation originals and manifests remain under the local generation library;
  adding an output to a Prompt copies it into the existing Prompt media boundary.
- Review hardening moved originals to `data/generations/assets/`, preserves legacy
  Prompt-media selection when the obsolete generated subdirectory exists, and migrates
  legacy workbench outputs on read without moving them into Prompt media.
- Remote URL results now pass through the main-process SSRF/size boundary and commit
  directly to the generation library. PNG, JPEG and WebP are detected from bytes rather
  than being recorded as a hard-coded PNG.
- Reference images are preflighted and forwarded for supported Gemini and GPT Image
  adapters. Unsupported model/reference combinations are blocked before batch creation;
  provider-specific aspect ratios are normalized before request execution.
- Per-batch mutations are serialized. Cancelling also terminalizes the running slot,
  rejects late provider output, and metadata-only favorite changes preserve the original
  completion timestamp.
- The 2026-07-22 UI redesign replaces the horizontal composer with a dominant left
  result canvas and a fixed right generation inspector. The inspector remains visible
  across supported Desktop window widths instead of collapsing behind a settings button.
  Batch history moved out of the persistent inspector into an on-demand drawer opened
  from the running-batch status. White card surfaces replace the previous gray canvas
  treatment.

## Verification

- Documentation checks:
  - `pnpm spec:index`: passed; regenerated `spec/changes/index.md`.
  - `pnpm spec:index:check`: passed.
  - `pnpm spec:test`: passed all commit-rule, governance, inventory and
    single-source checks.
  - Prettier write/check for all nine change Markdown documents: passed.
  - `git diff --check`: passed.
  - ID audit: all 15 `FR-IGW-*` requirements and `NFR-IGW-SYNC-001` appear in
    their delta specs and the `FR/NFR -> DES -> TEST -> T` traceability table.
  - Warning: a direct Prettier check of generated `spec/changes/index.md`
    reports generator-format differences. The generated file was not manually
    reformatted because `spec:index:check` is its canonical validation.
- Runtime tests:
  - Core generation policy: 13 tests passed.
  - Desktop generation library: 16 tests passed.
  - Desktop generation runner: 6 tests passed.
  - Desktop workbench component: 9 tests passed.
  - Runtime paths, local media protocol, remote image policy, media URL, and AI transport:
    46 focused tests passed.
  - Combined focused Desktop verification: 74 tests passed across 8 files.
  - Desktop sidebar regression: 19 tests passed.
  - Desktop TypeScript check: passed.
  - Focused ESLint for the workbench, queue, and component tests: passed.
  - Focused coverage run: 32 tests passed; generation library reached 100% functions,
    94.72% lines and 84.89% branches; remote download reached 100% functions/lines and
    93.75% branches; runner remains 72.5% lines and 58.46% branches. The open
    coverage gap remains recorded under `T-IGW-009`/`T-IGW-013`; no full-coverage claim
    is made.
  - Desktop production build: passed after the latest gallery interaction follow-up;
    existing chunk-size warnings remain.
  - 2026-07-17 focused workbench ESLint and Desktop TypeScript check: passed.
  - 2026-07-22 focused workbench component suite: 9 tests passed after the two-column
    redesign; focused ESLint and Desktop TypeScript check passed.
  - 2026-07-22 Desktop production build passed. The workbench chunk is 33.62 kB
    (9.28 kB gzip); existing repository chunk-size warnings remain unchanged.
  - 2026-07-17 file-size guard: failed on the unrelated existing
    `apps/desktop/tests/unit/services/database-backup.test.ts` size of 1,511 lines versus
    the script's preferred 1,500-line limit; the changed workbench files remain below
    their configured limits.
- Visual QA:
  - Reference review completed against `assets/workbench-ui-concept.png`.
  - Revised Electron implementation captured at the reference `1596x986` viewport.
  - Empty-state hierarchy passed visual review; runtime measurements found no document,
    configuration-row, or gallery-toolbar horizontal overflow. Populated-state capture
    remains pending before convergence.
  - The 2026-07-17 post-refinement Electron capture remains blocked because the app did
    not expose its first window before the 60-second Playwright timeout. Production build
    and component verification passed, but they do not replace the pending visual capture.
  - 2026-07-22 in-app browser capture passed at the accepted `1586x992` viewport.
    The initial responsive implementation used a side sheet below `1280px`; user review
    clarified that the right inspector must remain visible and that behavior was removed.
  - 2026-07-22 fixed-inspector follow-up passed at the user's effective `1008x622` CSS
    viewport: the 323 px inspector stayed visible, the obsolete settings trigger was
    absent, toolbar children remained within the result canvas, and the page had no
    horizontal overflow.

## Analyze

- Traceability drafted: yes.
- Analyze gate passed: yes for requirements/design/test/task alignment.
- Blocking product decisions: none.
- Confirmed decisions:
  - Prompts secondary-navigation placement;
  - output lifetime after Prompt deletion;
  - 100-output batch maximum;
  - one model per batch in the first release.
  - generation records and originals are local-only in the first release.
- Navigation reference:
  - `spec/changes/archive/2026/08/2026-08-18-app-shell-left-rail/` remains unchanged because no global item
    is added.
- Sync reference:
  - `spec/changes/active/web-sync-contract-completion/` continues its existing supported
    payload contract and excludes this feature's local-only directories.
- Detailed plan artifacts:
  - `data-contract.md`
  - `orchestration.md`
  - `ui-acceptance.md`
- Production implementation: partial; first-slice tests preceded the main storage,
  runner, navigation, and renderer behavior. Remaining test methods stay open in
  `tasks.md`.

## Converge

- Stable workflow/knowledge/rules synced: no; active delta is not implemented.
- Issues/releases/ADRs/indexes synced: pending.
- Final change destination: remain active until implementation and convergence.

## Synced Docs

- None yet. Stable documents remain the description of currently shipped behavior.

## Desktop-Native Layout Batch (2026-07-22, `FR-IGW-016`, `DES-IGW-010`, `T-IGW-016`)

- Three-pane layout replaces the drawer architecture: permanent left batch rail
  (`ImageGenerationBatchRail.tsx`, thumbnails + progress + status + new-batch action),
  center gallery, right composer that is collapsible (auto-collapses after a successful
  submit, slim expand strip when collapsed). The modal queue drawer, backdrop,
  `queueOpen` state, and `ImageGenerationBatchQueue.tsx` are removed.
- Gallery header: `ImageGenerationBatchSwitcher.tsx` carries batch identity (status dot,
  title, done/total) with a listbox dropdown for direct switching; a slim progress bar
  renders below the header while the selected batch is queued/running.
- `ImageGenerationLightbox.tsx`: dialog with backdrop close, keyboard left/right cycling
  through visible outputs, Escape close, and an action bar (favorite/download/copy
  execution prompt/attach to source Prompt) sharing the workbench handlers with the
  bottom selection bar.
- Selection semantics: multi-select mode toggle removed; tile checkbox (hover/selected
  only) or Shift/Ctrl+click toggles selection, plain click opens the lightbox. The empty
  Advanced toggle and its props are removed.
- i18n: 9 new `generation.*` keys in all seven locales; 6 dead keys removed after
  zero-reference grep. One pre-existing gap recorded: `generation.referenceUnsupported`
  is missing in fr/de/es locales from earlier work.
- Verification: rewritten `image-generation-workbench.test.tsx` (16 cases: rail
  persistence and switching, composer collapse lifecycle, header switcher and progress,
  lightbox keyboard/actions, selection semantics, no drawer/Advanced remnants);
  components suite green (174 files / 1317 tests), i18n regression, ESLint, and
  `tsc --noEmit` green; full desktop suite green (411 files / 3802 tests).

## Follow-Ups

- Add a deterministic populated-generation fixture and capture gallery, selection, and
  failure states at the accepted concept viewport.
- Complete stress, backup/recovery, remote-payload exclusion, coverage, and release
  harness verification before convergence.

## Explicit Reference Selection Follow-Up (2026-08-03, `T-IGW-020`)

- Removed the implicit first-two-images behavior when a source Prompt is selected.
  Reference images are now independent draft state and are sent only after an explicit
  user selection.
- Added native file selection, file drop, Prompt-media selection, removal and native drag
  ordering. The Prompt-media chooser filters to PNG/JPEG/WebP and mounts 24 thumbnails at
  a time. Prompt deletion leaves an existing reference visibly identified as Prompt media.
- Local picker files are filtered before copying and capped to the remaining adapter
  capacity. Dropped files are capped at 20 MiB each, imported sequentially to bound peak
  memory, byte-sniffed in the main process, and stored under a generated managed-media
  filename. Absolute external paths never enter the batch manifest.
- The current provider capability boundary remains conservative: supported Gemini image
  adapters accept at most two ordered references; other adapters expose zero and reject
  references before batch creation. Managed Prompt and local references share the safe
  `readImageBase64` bridge at execution time.
- Test-first evidence: the original explicit-selection suite failed 7 cases before the
  implementation; the unsupported-picker-copy regression also failed before filtering,
  and the 25-image bounded-gallery regression failed before pagination. The focused
  component, locale, runner and image-IPC suites now pass 57 tests. The extracted
  reference picker reaches 100% lines, functions and branches. Desktop typecheck,
  focused ESLint, file-size guard and production build pass. The build retains the
  existing large-chunk and mixed static/dynamic `fflate` warnings.
- Visual Computer Use verification was attempted against PromptHub, but the local native
  Computer Use pipe did not start. No duplicate Electron process or development server
  was started; component interaction tests cover the picker, drop target, limit, removal,
  ordering, paging and unsupported-model states.

## Conservative Default Count Follow-Up (2026-08-03, `T-IGW-021`)

- Changed a new generation draft from eight outputs to one. The count remains editable
  within `1..100`, but the application no longer commits eight provider requests by
  default.
- Creating a new batch also resets a previously edited count to one. Existing historical
  batches retain their persisted target and tiles; this change does not rewrite history.
- Test-first evidence: the default-count and clean-draft assertions both failed with the
  previous value of eight, then passed after the shared default was applied to initial
  state and draft reset.

## Labeled Count Configuration Follow-Up (2026-08-03, `T-IGW-022`)

- Moved the image-count stepper from the fixed footer into the persistent configuration
  flow and added the visible existing `generation.count` label. Ratio, quality and count
  now read as explicit basic generation parameters rather than leaving a bare number beside
  the primary action.
- Reduced the footer to one full-width Generate button, preserving a stable primary action
  while the configuration content scrolls independently.
- Test-first evidence: the focused component test failed because no visible count label
  existed and the input was nested in the footer, then passed after the field was moved.
  The full 28-case workbench suite, Desktop typecheck, focused ESLint, file-size gate,
  production build, spec index/traceability checks and `git diff --check` passed. The build
  retains the existing large-chunk and mixed static/dynamic `fflate` warnings. Focused
  composer coverage is 100% statements/functions/lines and 95.23% branches; the two
  uncovered branches are the pre-existing empty variable and resolved-Prompt fallbacks.

## Progressive-Disclosure Layout Follow-Up (2026-08-03, `T-IGW-017`)

- Removed the permanent batch rail. The gallery and compact right composer are now the
  only persistent workbench regions; batch history lives in the header switcher and a
  separate icon action creates a new draft.
- Kept current-batch, all-output, favorite, and failed filters visible. Sort direction
  and gallery density moved into one dismissible gallery-options menu.
- Kept source Prompt, model, execution Prompt, required variables, image count, and the
  primary generate action visible. Ratio, quality, and reference images moved into an
  explicit, collapsed secondary-settings section with a value summary.
- Split the gallery toolbar and composer sections by responsibility instead of adding
  more workbench conditionals. Updated the seven supported locales and added a locale
  contract test for the new copy.
- Test-first evidence: the revised component contract initially failed 4 cases and
  passed 14; after implementation, the workbench suite passed 22 cases and the seven
  locale contracts passed 7 cases. Focused coverage reached 100% lines/branches for the
  extracted gallery toolbar and 100% lines/functions plus 96.22% branches for the
  composer; its two uncovered branches are the pre-existing empty variable/resolved-Prompt
  fallbacks. The legacy workbench remains at 94.72% lines and 82.10% branches. Desktop
  typecheck, focused ESLint, production build, file-size gate, and `git diff --check`
  passed.
- Visual QA used the existing user-owned Electron development instance without starting
  or stopping another service. The populated failed/cancelled batch, compact gallery
  options menu, and collapsed/expanded secondary settings passed at `1200x740`; the same
  layout passed at the supported compact `800x740` window without horizontal overflow or
  control overlap. The original window width and collapsed settings state were restored.
- The production build retained the existing `>500 kB` chunk warning and the existing
  mixed static/dynamic `fflate` import warning. The workbench chunk was 36.05 kB
  (10.17 kB gzip).

## Clean Draft Follow-Up (2026-08-03, `T-IGW-018`)

- Corrected the new-batch action so it enters an explicit draft state instead of being
  immediately overridden by the newest-batch fallback.
- The current-batch gallery now becomes empty, Prompt/draft/selection state is reset,
  and the composer expands. Historical batches remain reachable through a neutral
  history switcher and selecting one restores its outputs. The empty-state copy now
  describes starting a new batch instead of incorrectly calling it the first batch;
  all seven locales carry the new message.
- Test-first evidence: the new regression initially failed because the previous batch
  image remained visible after “New batch”; the focused workbench suite passed 22 cases
  after implementation. The combined workbench and locale suites passed 29 cases;
  Desktop typecheck, focused ESLint, file-size, traceability, `git diff --check`, and the
  production build also passed.
- Visual QA in the existing user-owned Electron instance confirmed that “New batch”
  removes all failed historical tiles, shows the operational empty state, expands a
  blank composer, and leaves the neutral batch-history control available. Selecting a
  prior batch restored its historical state. No additional process or port was started.
- Focused coverage reported 94.84% lines / 82.38% branches for the legacy workbench and
  89.10% lines / 90% branches for the existing batch switcher; the new draft/no-selection
  branches are covered. Remaining uncovered branches predate this follow-up. The final
  workbench chunk is 36.38 kB (10.26 kB gzip); the build retains the existing large-chunk
  and mixed static/dynamic `fflate` import warnings.

## Persistent Basic Parameters Follow-Up (2026-08-03, `T-IGW-019`)

- Promoted aspect ratio and quality from the optional disclosure into the persistent
  composer flow so the core generation parameters remain visible while drafting.
- Narrowed the disclosure to optional reference images, renamed it to the concrete
  “Reference images” action, and retained the collapsed reference-count summary.
- Test-first evidence: the revised contract initially failed because ratio and quality
  were absent until “More settings” opened. The workbench and seven-locale suites passed
  29 cases after implementation.
- Desktop TypeScript, focused ESLint, and the file-size gate passed. The production build
  passed with the pre-existing large-chunk and mixed static/dynamic `fflate` import
  warnings; the workbench chunk is 36.22 kB (10.21 kB gzip).
- Visual QA in the existing user-owned Electron instance confirmed that ratio and quality
  remain visible as a compact two-column row while reference images remain collapsed with
  a zero-count summary. No additional process or port was started.

## Focused Review Workbench Follow-Up (2026-08-03, `T-IGW-023`)

- Implemented the confirmed v3 hierarchy: generation mode keeps only the global module
  rail, the center surface focuses one selected output with a fixed thumbnail strip, and
  the fixed right inspector switches between generation settings and bounded history.
- Ratio, quality, and count remain visible basic parameters. Reference images remain a
  concrete disclosure, and the fixed footer contains only the primary Generate action.
- Plain thumbnail clicks change focus; modifier clicks and the hover checkbox preserve
  existing multi-selection. The main image opens the existing keyboard-capable lightbox,
  and favorite, download, prompt-copy, and attach actions reuse existing handlers.
- Failed, interrupted, running, and pending states use compact neutral tiles instead of
  filling the review surface with repeated destructive cards.
- Visual QA found two integration bugs that component-only checks did not expose. The app
  mounts its module rail and secondary panel separately, so the panel layout now collapses
  explicitly during generation mode. Generated-image URLs now encode path segments while
  preserving separators, which keeps Chromium's custom-scheme URL valid and still relies
  on the main-process extension, traversal, and root allowlist.
- Test-first evidence: the v3 component contract initially failed eight cases. A second
  targeted red run reproduced the standalone panel and encoded-slash image failures before
  their fixes. The final seven-file focused suite passes 92 tests; Desktop typecheck,
  focused ESLint, file-size guard, and the production build pass. Focused coverage for the
  new inspector and review stage plus the changed sidebar controller and media URL helper is
  100% statements, branches, functions, and lines. The build retains the existing
  large-chunk and mixed static/dynamic `fflate` warnings.
- Populated Electron Playwright QA passed with an isolated temporary profile at a
  `1586 x 740` renderer viewport: four generated assets rendered, the inspector measured
  389 px, the focused review area measured 1084 x 400 px, and the document had no
  horizontal overflow. All Electron processes and the temporary profile were cleaned up.

## Reference Drop Surface Polish (2026-08-03)

- Replaced the expanded reference section's small target, disabled action row, impossible
  `0 / 0` selection count, and destructive warning treatment with a full-width dashed drop
  surface. Compatible models expose a 112 px click-or-drop target; unsupported models keep
  the same clear spatial affordance but present it as a neutral non-interactive capability
  explanation.
- Local file selection now shares the drop surface instead of competing with it as a small
  secondary button. Prompt-library selection remains a separate explicit action.
- The collapsed summary now states that references are unavailable for the selected model,
  while compatible models retain the reference count, local upload, drag-and-drop, Prompt
  library, ordering, and removal workflow.
- Corrected the seven-locale guidance so it points to selecting a reference-capable image
  model; switching to a temporary Prompt does not change model capability.
- Test-first evidence: the focused regressions failed while the drop target remained only
  48 px tall and the unsupported state lacked the dashed reference surface. The final
  workbench and locale suites pass
  39 tests; Desktop typecheck, focused ESLint, production build, Prettier, and
  `git diff --check` pass. The changed reference picker reports 100% statements, branches,
  functions, and lines. The build retains the existing large-chunk and mixed
  static/dynamic `fflate` warnings.

## Workbench Sidebar Toggle Correction (2026-08-04, `T-IGW-024`)

- Fixed the global top-bar sidebar control in generation mode. Entering the workbench still
  starts rail-only, but the control now visibly expands and collapses the Prompts secondary
  panel instead of mutating an invisible global preference.
- Added a transient `isWorkbenchSidebarExpanded` state shared by the top bar and the separate
  sidebar panel mount. It is excluded from persisted storage and reset on workbench entry, so
  the ordinary Prompt sidebar preference remains unchanged when the user leaves.
- Test-first evidence reproduced four failures across top-bar interaction, standalone panel
  visibility, entry reset, and persistence. The final focused suite passes 68 tests; Desktop
  typecheck, focused ESLint, production build, Prettier, and `git diff --check` pass. Focused
  coverage was 87.62% statements / 88.24% branches overall because the selected legacy files
  contain unrelated paths; every new workbench-toggle branch is exercised. The build retains
  the existing large-chunk and mixed static/dynamic `fflate` warnings.

## Lightweight Review Surface Follow-Up (2026-09-01, `T-IGW-025`)

- Replaced the persistent gallery toolbar with one header-level workbench menu. Current/all,
  favorite/failed filtering, sort, density, cancel, and retry retain their existing handlers
  but no longer compete with the image during ordinary review.
- Replaced the fixed settings/history column with an overlay inspector that opens from New
  batch, History works, Details, or Continue from this image. A loaded or newly submitted
  batch returns to the full-width review surface; submission failure keeps the draft visible.
- Moved focused-image favorite, download, Prompt copy, and Prompt attachment into a single
  More actions menu. The same menu is reachable through the primary image context menu.
- Kept the existing runner, provider adapters, IPC/preload contracts, storage layout, local
  generation library, and Prompt media-copy boundary unchanged.
- Added component contracts for progressive disclosure, drawer lifecycle, context-menu parity,
  continued drafting, bounded history, and hidden batch controls. Added the new interaction copy
  to all seven supported locales.
- Verification passed for 32 workbench component cases and 7 locale cases. Desktop
  `tsc --noEmit`, focused ESLint, production Vite build, focused `git diff --check`, and
  source-file size review also passed. The workbench source remains 989 lines; the built
  workbench chunk is 54.32 kB (14.24 kB gzip).
- Live populated Electron comparison was not run because the current request did not
  authorize GUI or browser control. The accepted source visuals were opened directly, but
  automated and build evidence do not substitute for the missing same-state screenshot;
  visual QA therefore remains blocked rather than passed.
- The maintainer subsequently authorized live UI inspection. Pass 1 used an isolated E2E
  profile and deterministic five-image fixture at 1200 x 740. It exposed a duplicate generic
  Prompt top bar, portrait thumbnails that contradicted the accepted landscape strip, and a
  drawer that covered the workbench identity actions. The implementation now suppresses the
  generic top bar in generation mode, moves the transient sidebar toggle into the workbench
  header, uses responsive landscape thumbnails, shortens the visible More label, and offsets
  the drawer below the workbench header. Pass 2 confirmed those structural corrections and
  exposed one remaining overlap: the More trigger still sat on the image edge. The trigger now
  occupies its own centered action row above the preview. Pass 3 at 1200 x 740 passed the final
  side-by-side comparison: one header, centered image, separate More row, five landscape
  thumbnails, right-edge Details, and Continue from this image match the accepted hierarchy.
- Live interactions verified the More menu, right-click parity, workbench menu, Details drawer,
  thumbnail focus strip, and sidebar toggle. The isolated Electron harness surfaced only the
  existing unpackaged tray-template warning; no workbench renderer error appeared. All isolated
  Electron processes were stopped and temporary profiles were removed after capture.
- Final automated evidence: 32 workbench component tests, 7 locale tests, and 29 TopBar tests
  passed; Desktop typecheck, focused ESLint, production build, focused diff check, and file-size
  review passed. The final workbench chunk is 54.81 kB (14.37 kB gzip).

## Whole-Image Editing Follow-Up (2026-09-01, `T-IGW-026`)

- Added an explicit generate/edit dual path without changing the existing generation history,
  manifest, Data-root, Prompt-media-copy or batch orchestration truth sources. The presence of
  references is the single mode source: the primary action and Prompt guidance become editing
  copy, then return to generation copy when the final reference is removed.
- Preserved Gemini multimodal references and added GPT Image multipart `/images/edits` with a
  four-reference PromptHub bound. JSON generation still uses `/images/generations`; unverified
  adapters remain blocked before batch creation. The main AI transport validates mutually
  exclusive bodies, file count, MIME, base64, file names and 20 MiB size before creating
  `FormData`, and lets fetch own the multipart boundary.
- Extracted the OpenAI generation/edit adapter into `ai-image-openai.ts` instead of expanding the
  legacy mixed-provider `ai.ts`. The final file-size gate passes: new files stay below 1,500 lines,
  legacy files do not grow, and the 2,000-line hard limit remains intact.
- “Continue from this image” now creates a generation reference backed by batch/output/file
  identifiers, seeds the prior execution Prompt, chooses a compatible configured model when
  needed, resets output count to one and opens the progressive-disclosure settings drawer.
- Desktop main reopens generated bytes only after output lookup, basename, regular-file,
  byte-size, MIME and SHA-256 verification. Renderer previews keep using the existing
  `local-generation-image` protocol; no output is copied into Prompt media implicitly.
- Product boundary: whole-image editing only. Masks, brush selection and partial inpainting are
  deferred to a separate change.
- Verification: 108 focused tests passed across AI provider routing, multipart IPC, generation
  storage, runner, workbench and seven locales. Desktop typecheck and focused ESLint passed.
  Production Vite build, `spec:index:check`, `spec:test` including traceability, and
  `git diff --check` passed.
- Isolated Electron acceptance used a temporary E2E profile, the existing visual seed and five
  existing workbench design assets as local generation outputs. At `1200x740`, history loaded,
  “Continue from this image” exposed GPT Image, `1 / 4 selected`, Generated output and the fixed
  Edit image action; the 360 px drawer, main preview and generated-reference preview were visible
  with no document horizontal overflow. The profile and Electron process were cleaned. Evidence:
  `assets/workbench-edit-mode-qa.png`.
- No real paid Provider request was made. Unit/transport evidence proves request formation and
  local behavior, but not the user's API key, provider account, network proxy or billable model
  acceptance.

## In-Flow Inspector Follow-Up (2026-09-01, `T-IGW-027`)

- Trigger: the maintainer's rendered screenshot showed the on-demand right inspector covering the
  main preview, thumbnail strip and continuation region instead of resizing the review canvas.
- Decision: keep progressive disclosure and the same bounded panel, but make it an in-flow sibling
  of the gallery below a full-width workbench header. No supported Desktop width uses an overlay.
- Implementation: the workbench root is now a vertical shell. Its 56 px identity header spans the
  full surface; a `min-height: 0` flex row below owns the `min-width: 0` gallery and the bounded,
  non-shrinking inspector. Closing the inspector removes that sibling and returns its complete
  width to the gallery. Existing tabs, state, submit lifecycle and Details affordance are unchanged.
- Verification: the revised component contract failed before implementation and then passed. The
  complete 32-case workbench suite, Desktop typecheck, focused ESLint, production Vite build,
  file-size gate, spec index/traceability and `git diff --check` passed.
- Isolated Electron acceptance passed at `1200x740`: 964.57 px content width split into a
  604.57 px gallery and 360 px inspector; the closed gallery reclaimed 1120 px. It also passed at
  `900x650`: 820 px content split into a 500 px gallery and 320 px inspector. Both states had exact
  sibling boundaries, a full-width header, preview and continuation controls inside the gallery,
  and no document horizontal overflow.
- Current-run evidence lives under `output/playwright/image-generation-workbench/`:
  `01-inflow-wide.png`, `02-inflow-compact.png`, and `03-before-after.png`. The isolated Electron
  process and temporary profile were cleaned after capture.

## Auxiliary Sidebar Coordination Follow-Up (2026-09-02, `T-IGW-028`)

- Trigger: the non-overlay inspector solved right-side occlusion, but an explicitly expanded
  Prompts secondary panel could still combine with the 320–390 px inspector and over-compress the
  review canvas.
- Decision: keep the global module rail and make only the two auxiliary sidebars mutually
  exclusive. All right-panel entry points collapse the secondary panel; expanding the secondary
  panel closes the inspector.
- Implementation: `openInspector(tab)` now owns every New, History, Details and Continue transition
  and collapses the Prompts secondary panel before opening the requested right tab. The workbench
  sidebar toggle closes the inspector before expanding the left panel. Closing either side does not
  implicitly reopen the other or mutate the ordinary persisted Prompt sidebar preference.
- Compact-header correction: with the left panel expanded, the secondary navigation already names
  Image Workbench, so the duplicate main heading becomes screen-reader-only and New batch becomes
  an icon button with the same accessible name. The batch switcher receives the remaining width;
  ordinary labels return when the left panel collapses.
- Verification: 62 workbench/TopBar component tests, Desktop typecheck, focused ESLint, production
  build, file-size gate, spec index/traceability and `git diff --check` passed.
- Isolated Electron acceptance at `900x650` passed after waiting for the existing sidebar width
  transition to settle. Right-only state: 820 px content, 500 px gallery and 320 px inspector.
  Left-only state: 288 px Prompts panel plus a 532 px gallery and no inspector. Reopening the right
  panel restored the first geometry. The global module rail and focused generation source remained
  unchanged, and every stable state had no document horizontal overflow.
- Evidence: `output/playwright/image-generation-workbench/04-left-panel-only.png`,
  `05-right-panel-only.png`, and `06-sidebar-mutual-exclusion.png`. Temporary scripts, profiles and
  Electron processes were cleaned.
