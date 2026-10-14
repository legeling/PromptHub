# Image Generation Workbench UI Acceptance Matrix

## Selected Direction

The accepted visual reference is
[`assets/workbench-selected-direction-v4-simplified.png`](./assets/workbench-selected-direction-v4-simplified.png). It defines the
information architecture and relative visual hierarchy; production implementation must
reuse the current PromptHub tokens and components rather than rasterizing the mock.

## Navigation And Entry

| Case                          | Acceptance                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Direct entry                  | Prompts remains selected in the global rail; the Prompts secondary panel is hidden. |
| Shared top bar                | Prompt search and the single sidebar toggle stay visible in the same shell position across graph and generation modes, including while toggling the secondary panel. |
| Existing Prompt entry         | Current Prompt ID/version, resolved content and references prefill a draft.         |
| Top Prompt type filters       | “全部 / 文本 / 绘图” remain Prompt list filters and do not select the workbench.    |
| Navigate away during a batch  | Generation continues; returning restores current counts and selected batch.         |
| Browser-style back navigation | Returning to Prompt view does not discard a submitted batch or mutate Prompt.       |

The Prompt store gains a distinct `generation` view mode rather than a new global app
module. Folder/tag selection is preserved but does not filter the workbench. Selecting a
folder, Prompt filter or relationship graph exits generation view explicitly.

The global 80 px module rail remains visible. The transient Prompts secondary panel and the
right settings/history panel are mutually exclusive: opening either closes the other without
changing the ordinary Prompt sidebar preference.

The shared TopBar stays above both the secondary panel and workbench. The workbench's
own header contains batch actions only, not a duplicate sidebar toggle. Opening the
secondary panel closes the settings/history panel; closing the sidebar does not reopen
that panel. Current authority: `FR-IGW-016` supersedes the older single-header mock.

## Wide Layout

At widths `>= 1440px`:

- Existing global rail retains its width; Prompts secondary navigation is suppressed.
- The workbench replaces normal Prompt list/detail columns with one continuous surface.
- Current-batch results use one dominant `object-contain` preview and a fixed thumbnail
  strip. All/favorite/failed filters retain stable result-grid density modes.
- Generation settings and bounded history share an on-demand in-flow right panel. The panel is
  closed during ordinary review; when opened it reserves its own column and the review canvas
  reflows rather than being covered.
- Generation controls must not span the top of the result canvas.
- The bottom selection bar stays inside the result region and never covers the right
  panel.

## Compact Layout

The Desktop minimum remains `800x600`.

| Width          | Required behavior                                                     |
| -------------- | --------------------------------------------------------------------- |
| `1100..1439px` | Review canvas reflows beside the in-flow right panel; no overlay.     |
| `800..1099px`  | Gallery and panel remain siblings; thumbnails scroll inside gallery.  |
| Any supported  | No overlap or horizontal page scrolling; only content regions scroll. |

At compact widths, model/ratio/quality/count controls keep stable hit targets inside the
panel. Secondary actions live in accessible menus; the primary generation action stays
visible whenever settings are open. Text does not scale with viewport width.

## Composer States

| State                         | Visible behavior                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------- |
| No image model configured     | Model warning and Settings action; Generate is disabled with reason.             |
| Direct entry, no source       | Prompt selector and adhoc input are available; no Prompt is created implicitly.  |
| Prompt with variables         | Missing variables are identified inline; resolved preview updates before submit. |
| Unsupported model parameter   | Control is disabled/hidden from capability data; no silent request downgrade.    |
| Reference image selection     | Every image model allows references; all selected images remain in order with no application count cap or automatic model substitution. |
| Count invalid                 | Only integer `1..100` is accepted; Generate remains disabled.                    |
| New draft count               | Defaults to one image and resets to one when a new batch is created.             |
| Valid submission              | Button press creates visible queued batch immediately and clears no source data. |

Source Prompt/version, model, execution Prompt, required variables, ratio/size, quality
and count remain visible together after opening the settings drawer. Count has a visible
field label inside the configuration flow rather than appearing as an unlabeled footer
stepper; the footer contains only the primary Generate action. Reference images live in an explicit
disclosure whose collapsed summary exposes the current count. Seed, style and provider-
specific allowlisted parameters remain secondary and appear only when supported.

Reference selection is always explicit: choosing a source Prompt does not silently add
its media. The disclosure supports the native file picker, file drop, Prompt-media
selection, removal and drag ordering. Each selected item identifies its source, and the
Prompt-media grid reveals thumbnails in bounded pages rather than mounting the complete
library at once.

## Batch And Result States

| State               | Result wall                                           | Right panel / actions                                                     |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Empty library       | Operational creation empty state, not marketing.      | Recent source suggestions only when real.                                 |
| New draft           | Current-batch view is empty; history is not rendered. | Settings remain visible and history is reachable from the inspector.      |
| Queued              | Stable slot placeholders.                             | Position/status and Cancel remaining.                                     |
| Running             | Completed images appear progressively.                | Accurate total counts and bounded progress.                               |
| Partially succeeded | Successes remain fully actionable.                    | Failed filter, Retry failed, Cancel remaining.                            |
| Succeeded           | All available outputs shown.                          | Export batch and duplicate/adjust actions.                                |
| Failed with zero    | Compact neutral failure states, no fake image.        | Correct model/settings recovery action.                                   |
| Cancelling          | Pending and in-flight local slots visibly cancelled.  | Explain provider-side compute may continue, but late output is discarded. |
| Cancelled           | Earlier successful outputs remain visible.            | Duplicate the batch to regenerate cancelled targets.                      |
| Interrupted         | Durable successes remain; unknown slots marked.       | Resume polling only when supported, otherwise retry.                      |
| Missing local file  | Broken output isolated with recovery indicator.       | Never claim downloadable success.                                         |

Progress text includes succeeded, failed, cancelled/interrupted and total counts. Color
is supplementary; icons and text communicate every non-success state.

## Selection And Review

- Clicking an image selects it for detail; checkbox/multi-select mode supports range and
  additive keyboard selection without changing grid geometry.
- The selected tile uses border plus check state, not color alone.
- No selection: the right drawer stays closed unless the user requests settings or history.
- One focused output: one `More` trigger and right-click expose image actions; those actions
  are absent from the default canvas chrome.
- One selection: the lightbox shows a large preview and direct image actions; provenance
  remains associated with the selected output and batch without occupying a third column.
- Multiple selection: the contextual action bar shows aggregate count and applicable bulk
  actions, not misleading single-output provenance.
- Bottom contextual bar exposes favorite, set as reference, download, export selected
  and clear selection. Delete is visually separated and always confirms scope.
- “调整后生成” creates a child draft/batch; it never mutates historical provenance.

## Filtering And Performance

- Primary filters: current batch, all local outputs, favorites and failures.
- Secondary filters: date, source Prompt, model, batch status and favorites.
- Sort: newest, oldest and batch/slot order where meaningful.
- Density control changes stable tile dimensions and column count without reloading
  originals.
- Result wall uses `@tanstack/react-virtual` or an equivalent existing project pattern,
  mounts only visible media and requests thumbnails before originals.
- 10,000 metadata records and a 100-output active batch must not mount all images or make
  queue controls unresponsive.

## Keyboard And Accessibility

- All composer fields, tabs, tiles, menus and batch actions are reachable by keyboard.
- Icon-only actions use Lucide icons plus tooltip and accessible name.
- Grid tiles expose output status, position and selection through semantics, not only
  visual overlays.
- Progress uses determinate semantics when total is known and announces terminal state
  changes without announcing every thumbnail insertion.
- Focus returns to the triggering control after dialogs/sheets close.
- Reduced/off motion settings use existing PromptHub motion tokens and never remove
  state feedback.

## Destructive And Local-Only Copy

- Prompt deletion confirmation states that generated work remains local and keeps its
  historical Prompt snapshot.
- Batch/output deletion confirmation names exact item count and never implies cloud
  deletion because no cloud copy exists in the first release.
- Workbench and Data Settings disclose that generation assets stay on this device and
  are excluded from remote sync.
- “添加到 Prompt” explains that the selected image becomes normal Prompt media; it does
  not upload the rest of the batch.
- Future membership/cloud controls are absent, not disabled placeholders.

## Required Component/E2E Scenarios

1. Enter directly, submit an adhoc 4-image batch and observe progressive durable output.
2. Enter from a variable image Prompt, resolve variables and retain Prompt version
   provenance after the Prompt changes.
3. Run a 50-image partial-success batch, select successes, export and retry only failures.
4. Cancel with one provider request in flight and verify honest cancelling/final counts.
5. Navigate to relationship graph and back while generation continues.
6. Restart with completed and running slots; verify successful assets and interrupted
   recovery actions.
7. Delete the source Prompt; verify workbench images remain and live link is detached.
8. Add one output to a Prompt; verify only that Prompt media enters existing sync input.
9. Exercise `1440x900`, `1100x700` and `800x600` without overlap, clipped controls or
   horizontal page scrolling.
10. Exercise keyboard-only selection, detail, retry, favorite, export and delete flows.
