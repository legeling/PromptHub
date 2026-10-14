# Desktop Image Generation Workbench Design QA

## Current shell requirement (2026-10-13)

`FR-IGW-016` now requires the shared TopBar, persistent Prompt search and one fixed
sidebar toggle across Prompt views. The historical v4 review below that suppressed
TopBar is superseded on this point; it is not current acceptance evidence.

Verification: `pnpm --dir apps/desktop exec vitest run --project unit
tests/unit/components/top-bar.test.tsx tests/unit/components/image-generation-workbench.test.tsx
tests/unit/components/sidebar-prompt-view-mode.test.tsx --maxWorkers=1 --minWorkers=1`
passed all 77 cases. The component boundary covers shared control identity across view
switches, search input/shortcut/Escape, transient sidebar state and inspector mutual
exclusion; generation services are mocked. Desktop `typecheck:tests`, targeted ESLint,
Prettier and diff whitespace checks passed. Live Electron visual acceptance was not
performed because GUI-control authorization was not provided for this change.

## Reference-image contract update (2026-10-13)

Current `FR-IGW-005` and `FR-IGW-017` remove model-name/provider allowlists and
application reference-count caps. Upload, Prompt-media selection and continuing from
an output retain all selected references without substituting the chosen model. Reference
requests use the configured OpenAI-compatible/Gemini transport, including arbitrary model
names; endpoint errors propagate normally. File byte/type/source checks still use the
existing media boundary. Attachment reads run in order, with O(n) iterations and request
memory proportional to the selected image bytes, without starting one IPC read per image
simultaneously. No storage schema or migration changes.

Verification: `pnpm --dir apps/desktop exec vitest run --project unit
tests/unit/components/image-generation-workbench.test.tsx
tests/unit/components/image-generation-workbench-i18n.test.ts
tests/unit/services/generation-workbench-runner.test.ts tests/unit/services/ai.test.ts
--maxWorkers=1 --minWorkers=1` passed all 99 cases. Regressions exercise arbitrary model
and provider labels, five ordered references, upload without truncation, retaining the
model when continuing from an output, configured-protocol serialization and endpoint
errors. Generation persistence/native media bridges and network transport are mocked at
their respective test boundaries. Desktop `typecheck:tests`, targeted ESLint, Prettier
and diff whitespace checks passed. Live supplier requests and Electron GUI acceptance
were not performed.

## Reference

- Accepted concept: `assets/workbench-ui-concept-v3.png`
- Target hierarchy: dominant left result canvas, fixed right generation inspector,
  on-demand batch drawer, and bright card surfaces with restrained neutral controls.

## Implementation Review

- Navigation placement matches the Prompts secondary-navigation boundary.
- The former oversized form-and-empty-canvas layout has been replaced by the
  accepted three-zone workbench hierarchy.
- Gallery sort, density controls, multi-selection, batch selection, cancel/retry,
  favorite, download, Prompt attachment, and new-batch controls are interactive.
- Generated originals remain local; Prompt attachment uses an explicit copied media
  asset and does not change the generation original.

## Visual Result

- First implementation capture failed visual QA: viewport breakpoints were based on
  the whole window instead of the narrowed workbench column. The configuration row
  overflowed beneath the fixed queue, compressed the Generate label vertically, and
  forced an unnecessary horizontal gallery-toolbar scrollbar.
- The configuration row now uses intrinsic auto-fit tracks, compact fixed actions,
  and natural wrapping. The gallery toolbar wraps without horizontal scrolling.
- Post-fix Electron capture completed at the reference viewport, `1596x986`. The
  generated local capture is `output/playwright/image-generation-workbench-1596x986.png`.
- Browser measurements report no document, configuration-row, or gallery-toolbar
  horizontal overflow; the Generate control remains a stable `103x36` px element.
- The screenshot seed now uses the persisted `icon:<name>` folder-icon format, removing
  fixture-only text/icon overlap from visual QA.
- Status: passed for the empty workbench hierarchy and responsive overflow regression.
  Populated gallery states remain covered by component tests and still need a dedicated
  visual fixture before final convergence.

## 2026-07-17 UI Refinement

- Tightened the composer hierarchy with stable 40 px controls, clearer focus treatment,
  a stronger primary action, and an explicit local-device storage indicator.
- Added an actionable missing-image-model state instead of leaving Generate disabled
  without explanation.
- Removed the stacked empty placeholders in the right panel. An empty library now has
  one queue state; batch provenance appears only when a batch exists.
- At viewports below 1440 px, the fixed queue no longer compresses the result canvas.
  It moves into a closable, Escape-aware side sheet while the queue trigger remains in
  the workbench header.
- Batch cards now expose determinate progress semantics and status icons. Selected output
  previews use the available panel width, and list density includes useful model/time
  metadata instead of behaving like a short image tile.
- Component verification covers the missing-model explanation, compact queue sheet,
  Escape/close behavior, and single empty-state invariant.
- A revised Electron screenshot was attempted after a successful production build, but
  both the direct Playwright launch and the existing Electron smoke test timed out before
  the first window became available. The earlier capture remains a baseline only; no
  post-refinement visual-pass claim is recorded.

## 2026-07-22 Two-Column Redesign

- The user explicitly replaced the prior top-composer direction with
  `assets/workbench-ui-concept-v2.png`.
- The implementation capture is `assets/workbench-ui-implementation-v2.png`, recorded
  at the same `1586x992` viewport as the accepted concept.
- The result canvas now owns the dominant left region. Prompt, model, ratio, quality,
  count, execution Prompt, references, advanced disclosure and the Generate action live
  in the fixed right inspector.
- User review found the queue under the composer too cumbersome. The right inspector now
  contains generation settings only; clicking the running-batch status opens a temporary
  drawer for batch switching, provenance and new-batch actions.
- Main work surfaces use the white `card` token instead of the gray page `background`
  token. Muted gray is limited to controls, dividers and secondary status surfaces.
- User review clarified that the fixed inspector is part of the workbench rather than an
  optional compact control. The previous below-`1280px` settings sheet and header trigger
  were removed; the full inspector now remains visible at every supported Desktop width.
- At the user's effective `1008x622` CSS viewport, the inspector measured 323 px and the
  result canvas 317 px. The toolbar switched to two rows; its children stayed within the
  canvas and the document reported no horizontal overflow.
- Fixed-inspector presence, empty state, toolbar wrapping and populated-gallery
  interactions are covered by the focused component suite.
- At `1008x622`, the closed state had no queue content in the inspector and no document
  overflow. The on-demand drawer opened at 380 px, exposed one close action, and closed
  through both Escape and its explicit close control.
- Remaining P3: capture a deterministic populated gallery fixture before final change
  convergence; this does not block the accepted structure and empty-state visual pass.
- Final result: passed.

## 2026-08-03 Focused Review Layout

- The accepted v3 reference is `assets/workbench-ui-concept-v3.png`; the populated
  Electron implementation capture is `assets/workbench-ui-implementation-v3.png`.
- Generation mode now collapses the standalone Prompts panel and retains only the global
  module rail. The initial capture exposed that the app mounts rail and panel as separate
  Sidebar instances; the panel-specific regression test failed before the controller was
  corrected.
- The current batch uses one `object-contain` review image, a fixed 80 x 96 px thumbnail
  strip, and compact icon actions. Pending and unsuccessful slots no longer allocate
  full gallery-height destructive cards.
- The fixed inspector exposes Generation settings and a bounded History works tab. The
  history tab mounts at most 100 batch rows and reports when additional history exists.
- The populated Playwright Electron run used an isolated temporary user-data directory.
  At a `1586 x 740` renderer viewport it measured a 389 px inspector, a 1084 x 400 px
  primary review area, four thumbnails, and no document-level horizontal overflow.
- Visual QA also exposed invalid encoded-slash URLs for nested generated assets. The
  renderer now preserves `/` path separators while encoding each segment, allowing the
  main-process allowlisted protocol handler to load the image without weakening traversal
  checks.
- Final result: passed for populated review, thumbnail switching, settings/history tabs,
  rail-only navigation, local generated-image rendering, and horizontal overflow.

## 2026-09-01 Lightweight Review Direction

- Accepted reference: `assets/workbench-selected-direction-v4-simplified.png`, based on the
  user's supplied normal gallery screenshot rather than the later free-canvas concept.
- Target hierarchy: one dominant review image, a thumbnail strip, one compact workbench menu,
  one image More/context menu, and a right-side Details inspector only while requested.
- Static implementation review confirms that the generation runner and data contracts are not
  touched. All formerly visible gallery and image operations remain reachable through their
  progressive-disclosure surfaces.
- Source visual truth: the user screenshot
  `/var/folders/mg/8kvpxvzs54g_ygxpmpzkzy1h0000gn/T/codex-clipboard-40676b0c-82fe-437c-b03d-0a03326b16dd.png`
  at 449 x 349 px, plus the accepted normalized direction
  `assets/workbench-selected-direction-v4-simplified.png` at 1487 x 1058 px. Both were opened
  at original density before this review.
- Implementation screenshot path: unavailable. No Electron window or browser was started
  because the current request did not authorize GUI/browser control under the repository's
  GUI boundary. Viewport, CSS size, and density normalization therefore cannot be measured.
- Intended comparison state: populated current batch, first output focused, inspector and
  workbench menus closed. Full-view and focused-region visual comparisons are blocked because
  there is no rendered implementation capture in the same state.
- Fonts/typography, spacing/layout rhythm, colors/tokens, image quality, and copy were checked
  statically against existing PromptHub tokens and the accepted reference. Static inspection
  cannot establish visual fidelity; no pass claim is made for those surfaces.
- Automated evidence passed: 32 workbench component cases, 7 locale cases, Desktop typecheck,
  focused ESLint, production build, focused diff check, and source-file size review.
- Comparison history: no visual iteration was possible in this pass. The previously fixed
  component failures were hook ordering, draft drawer availability, and the post-submit Details
  entry; the focused suite passed after those fixes, but that is behavioral rather than visual
  evidence.
- Blocker: explicit authorization is required before launching and controlling Electron or a
  browser to capture the populated workbench at the reference viewport.

### Pass 1 — 1200 x 740 populated review

- Implementation screenshot: `assets/workbench-ui-implementation-v4-pass1.png`.
- Combined comparison evidence: `assets/workbench-ui-comparison-v4-pass1.png`; the accepted
  reference is normalized to 1200 px width beside the unscaled 1200 x 740 Electron capture.
- [P1] Duplicate generic Prompt toolbar. The implementation stacked Search Prompt and a second
  New action above the workbench identity row; the reference has one header. Fix: suppress the
  generic TopBar in generation mode and keep the sidebar toggle in the workbench header.
- [P1] Portrait thumbnail strip. The implementation used 80 x 96 thumbnails while both the user
  screenshot and accepted direction use landscape thumbnails. Fix: use responsive 16:9 items
  bounded from 112 to 180 px wide.
- [P2] Details drawer covered workbench-level actions. Fix: offset the drawer below the 56 px
  identity header and add a top divider.
- [P3] The visible image-action label was longer than the reference. Fix: retain the descriptive
  accessible name “More actions” while shortening visible copy to “More”.
- Pass 1 interaction evidence: batch switcher, More menu, Details drawer, five thumbnail outputs,
  and Continue from this image were all visible and operable. No production profile or existing
  PromptHub process was changed.

Pass 2 capture and the final five-surface fidelity review are pending.

### Pass 2 — 1200 x 740 populated review and drawer

- Implementation screenshot: `assets/workbench-ui-implementation-v4-pass2.png`.
- Combined comparison evidence: `assets/workbench-ui-comparison-v4-pass2.png` using the same
  normalization as pass 1.
- The P1 duplicate toolbar is removed: the workbench now owns one identity row and retains the
  transient sidebar toggle without the unrelated search/create controls.
- The P1 thumbnail mismatch is resolved with five landscape thumbnails whose width scales with
  the viewport. The P2 drawer overlap is resolved; the drawer begins below the workbench header,
  so batch identity and New/history/actions stay reachable.
- [P2] More still touched the image edge because it was absolutely positioned inside the preview
  container. Fix: allocate a centered, non-overlapping action row before the preview.
- Existing PromptHub shell differences are intentional product constraints rather than workbench
  drift: the 80 px global rail and its compact app mark remain instead of reproducing the mock's
  105 px rail and rasterized brand lockup.
- The drawer open state was inspected after pass 2. It preserved header actions, exposed explicit
  close/settings/history controls, and used no blocking backdrop.

Pass 3 will re-capture the populated review after the final P2 fix and check the same interactions.

### Pass 3 — final populated review

- Implementation screenshot: `assets/workbench-ui-implementation-v4-pass3.png`, 1200 x 740 px
  at a 1200 x 740 CSS window and 1x capture density.
- Combined comparison evidence: `assets/workbench-ui-comparison-v4-pass3.png`, 2424 x 898 px.
  The 1487 x 1058 reference is downsampled to 1200 px width without cropping; the implementation
  remains at native 1200 x 740. The different source aspect ratio is preserved and called out
  rather than distorted into a false same-height match.
- Full-view comparison: the implementation now has one workbench header, a centered More row,
  one dominant 16:9 review image, five landscape thumbnails, a right-edge Details affordance,
  and the continuation action in the same visual order as the reference. No P0/P1/P2 difference
  remains at this responsive desktop viewport.
- Focused interaction comparison: More opens the four expected image actions; right-clicking the
  primary image opens the same menu; the workbench menu exposes filters/sort/density; the Details
  drawer begins below the header and closes explicitly. The batch switcher and sidebar toggle
  retain visible names and keyboard semantics.
- Fonts and typography: the implementation uses PromptHub's existing system type stack and
  12/14/18 px hierarchy. Weight and wrapping match the product shell; no text collision or
  unintended truncation was visible.
- Spacing and layout rhythm: header, centered action row, image, thumbnails, and continuation use
  the existing 4/8 px token rhythm. The image and thumbnail strip remain centered with no document
  horizontal overflow at 1200 x 740.
- Colors and tokens: all UI surfaces use semantic PromptHub tokens. The restrained white/neutral
  palette, blue primary emphasis, borders, focus ring, and menu elevation match the reference's
  light visual hierarchy.
- Image quality and asset fidelity: the deterministic fixture uses a clean 940 x 585 crop from the
  accepted visual source and four real crop variants. The primary image is sharp, uncropped under
  normal review, and thumbnails use `object-cover` only within explicit 16:9 frames.
- Copy and content: Image Workbench, batch identity, More, Details, New batch, and Continue from
  this image match the selected direction. The longer “More actions” remains only as the accessible
  name. Seven locales carry both strings.
- Console/runtime check: no workbench renderer error surfaced during the three captured passes.
  The unpackaged Electron harness logged an existing missing tray-template warning when minimizing;
  it does not affect the renderer or the shipped packaged asset path.
- Residual P3: the production shell intentionally keeps its 80 px global rail and compact app mark
  instead of rasterizing the mock's wider PromptHub lockup. The continuation control omits the
  mock-only send/sliders pair because those operations are intentionally disclosed through More,
  right-click, and Details.
- Comparison history: pass 1 fixed the duplicate toolbar, portrait thumbnails, and drawer overlap;
  pass 2 confirmed those fixes and moved More out of the image; pass 3 confirmed all earlier P1/P2
  findings are resolved with no new blocking visual issue.

final result: passed

## 2026-09-02 Auxiliary Sidebar Mutual Exclusion

- Scope: compact `900x650` workbench with the global module rail, Prompts secondary panel, review
  canvas and settings inspector.
- Left-only state: the 80 px global rail and 288 px Prompts panel remain visible; the inspector is
  absent and the gallery receives 532 px. The main header removes its duplicate visible title,
  keeps the batch switcher, and compresses New batch to an accessible plus button without overlap.
- Right-only state: the Prompts panel is fully collapsed; the global rail remains; 820 px of content
  splits into a 500 px gallery and 320 px inspector. Normal heading and New batch copy return.
- Bidirectional interaction passed: opening the left panel closed the inspector; Details collapsed
  the left panel before reopening settings. New, History and Continue use the same coordinated
  entry in component tests.
- State preservation passed: `room-1.png` remained focused through right -> left -> right. No stable
  state produced document horizontal overflow.
- Evidence:
  - `output/playwright/image-generation-workbench/04-left-panel-only.png`
  - `output/playwright/image-generation-workbench/05-right-panel-only.png`
  - `output/playwright/image-generation-workbench/06-sidebar-mutual-exclusion.png`
- Evidence limit: the run validates rendered geometry, visible controls and focus identity, but not
  a full screen-reader traversal.

final result: passed

## 2026-09-01 Non-Overlay Inspector Correction

- Audit source: the maintainer's rendered screenshot showed the right settings panel covering the
  right side of the primary review canvas, thumbnails and continuation region. This is a structural
  overlap, not a panel-width polish issue.
- Implementation correction: the workbench header now spans the complete workbench. Gallery and
  Inspector are in-flow siblings below it, so opening settings/history reflows and recenters the
  review surface instead of painting above it.
- Wide acceptance (`1200x740`): content 964.57 px, gallery 604.57 px, inspector 360 px. Gallery
  right and inspector left both measured 840 px; the preview and Continue from this image stayed
  inside the gallery. Closing the panel expanded the gallery to 1120 px.
- Compact acceptance (`900x650`): content 820 px, gallery 500 px, inspector 320 px. The sibling
  boundary measured exactly 580 px; preview, thumbnail strip and continuation remained usable and
  the document had no horizontal overflow.
- Accessibility implication: covered controls no longer remain visually hidden behind a panel
  while still being keyboard reachable. Semantic tabs, close action and focus behavior were not
  changed; full assistive-technology compliance still requires a separate screen-reader run.
- Current-run screenshots:
  - `output/playwright/image-generation-workbench/01-inflow-wide.png`
  - `output/playwright/image-generation-workbench/02-inflow-compact.png`
  - `output/playwright/image-generation-workbench/03-before-after.png`
- Automated evidence: 32 workbench component tests, Desktop typecheck, focused ESLint, production
  build, file-size gate, spec index/traceability and diff check passed. The isolated profile and
  Electron process were cleaned.

final result: passed

## 2026-09-01 Whole-Image Editing Acceptance

- Implementation screenshot: `assets/workbench-edit-mode-qa.png`, captured from the production
  build at a `1200 x 740` Electron viewport with an isolated E2E profile.
- The fixture reused the existing visual seed and five existing workbench design assets as
  managed generation outputs. It did not read or mutate the user's production Data directory,
  model credentials or running PromptHub process.
- Interaction path passed: load persisted history -> focus output 1 -> Continue from this image
  -> open reference disclosure. The drawer showed GPT Image, the prior execution Prompt,
  `1 / 4 selected`, the managed filename, Generated output and the fixed Edit image action.
- Runtime measurements: drawer width 360 px; main preview visible; generation-reference preview
  visible through `local-generation-image`; document width did not overflow the 1200 px viewport.
- Visual review: the edit state retains the accepted single-header, dominant review image,
  landscape thumbnail strip and on-demand right drawer. Editing adds no permanent mode switch or
  extra canvas toolbar; complexity remains inside the existing reference disclosure.
- Initial diagnostic found the old visual seed's `settings.aiModels` was insufficient after the
  shared AI settings authority change. The final isolated profile therefore used the current
  `config/ai-models.json` authority; this was a QA fixture correction, not a product-code change.
- Paid Provider output was not requested. This acceptance proves local history, mode feedback,
  reference preview and request-contract plumbing, not live account/network/billing behavior.

final result: passed
