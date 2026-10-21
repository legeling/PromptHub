# Design

> Completed change history. Current requirements: [owning topic](../../../knowledge/behavior/prompt-workspace.md). Earlier proposals and designs below are retained as evidence, not current instructions.

<!-- traceability: enforced -->

## Current Boundary And Root Cause

`usePromptWorkspaceCopyFlow.ts` owns output-format resolution, language
selection, variable queuing, clipboard composition, usage tracking, and toast
behavior for menu actions. `PromptDetailActionBar.tsx` defines a separate
`useCopyPromptAction()` that reads the selected Prompt and copies only its raw
user content.

The source of truth is the workspace copy flow. The bottom action bar is a
presentation surface and must not own a second durable copy rule.

## `DES-COPY192-001`: One canonical command

Expose `handleCopyPrompt(prompt)` through
`PromptWorkspaceDetailPaneProps` and its existing context. The bottom action
bar invokes that handler with `selectedPrompt`. Remove the local raw clipboard,
settings, toast, and usage orchestration from `PromptDetailActionBar.tsx`.

The context carries a command, not output-format data. This keeps business
rules inside the owning workspace flow and avoids coupling the action bar to
Prompt maps or queue state.

All same-named entry points use this handler:

- context/menu action;
- list/table copy action where the same label is used;
- bottom action bar;
- variable modal continuation.

## `DES-COPY192-002`: Explicit copy plan and source attribution

Extract the existing queue selection into a small pure planner returning:

```text
{
  sourcePromptId,
  promptsInOrder
}
```

The source identity never changes when an output item points to another
Prompt. Completion increments `sourcePromptId` exactly once for a one-item or
multi-item plan. Missing target rows are ignored; when every configured target
is missing, the plan falls back to the source Prompt, preserving the current
user-visible fallback.

The planner filters the in-memory output-format rows once and sorts only the
matching rows. For `n` workspace rows and `m` matching rows, planning costs
`O(n + m log m)` time and `O(m)` temporary memory. No new cache or persistent
index is introduced because this is a user-triggered action and current data is
already resident in memory.

## `DES-COPY192-003`: Atomic completion and cleanup

The flow collects formatted text in memory and performs one final clipboard
write. Usage count and copied feedback occur only after that write succeeds.
Both the single-item and multi-item paths call the same completion helper.

Queue/modal state resets in `finally` on completion, cancellation, or failure.
An error remains visible through the existing error/toast boundary; it is not
converted to success. Variable entry continues item-by-item, but no partial
clipboard write occurs.

## Test-First Design

The first red component test renders the workspace with one source Prompt and
two ordered output items, then invokes the menu action and bottom action
separately. It asserts the current bottom action produces different content
before implementation.

Required methods:

- black-box UI: both buttons write the same exact text;
- white-box branches: no format, one item, multiple items, missing targets,
  English fallback, source attribution;
- failure: variable cancel and clipboard rejection leave usage unchanged and
  reset state;
- performance: pure planner with many unrelated rows, without timers or fake
  async delays;
- manual UI: repeat the issue's bottom-button and menu sequence in the running
  desktop renderer.

## Affected Areas

- Renderer copy flow and detail context/types
- Bottom action bar
- Focused renderer component and hook tests
- No DB schema, IPC, preload, filesystem, or sync contract change

## Failure And Rollback

- External boundary: clipboard write and existing usage-count persistence.
- Partial failure behavior: a clipboard failure performs no usage increment;
  queue state is cleared.
- Recovery/rollback: retry starts a new plan; reverting requires no data
  migration.

## Analyze Result

- Requirement links: the original output-format design already specifies
  formatted copy when a sequence exists.
- Verification links: each changed branch maps to `TEST-COPY192-*`.
- Blocking conflicts: none; adding a separate raw-copy command is explicitly
  out of scope.
- Unresolved `[待确认]`: none.

## Traceability

| Requirement       | Design                               | Verification                           | Task                             |
| ----------------- | ------------------------------------ | -------------------------------------- | -------------------------------- |
| `FR-COPY192-001`  | `DES-COPY192-001`, `DES-COPY192-002` | `TEST-COPY192-001`, `TEST-COPY192-002` | `T-COPY192-001`, `T-COPY192-002` |
| `FR-COPY192-002`  | `DES-COPY192-002`, `DES-COPY192-003` | `TEST-COPY192-002`                     | `T-COPY192-002`, `T-COPY192-003` |
| `FR-COPY192-003`  | `DES-COPY192-003`                    | `TEST-COPY192-003`                     | `T-COPY192-003`                  |
| `NFR-COPY192-001` | `DES-COPY192-002`                    | `TEST-COPY192-004`                     | `T-COPY192-004`                  |
