# Spec Delta: Prompt Copy Action Parity

> Completed change history. Current requirements: [owning topic](../../../../../knowledge/behavior/prompt-workspace.md). Earlier proposals and designs below are retained as evidence, not current instructions.

## Added Requirements

### `FR-COPY192-001`: Same label means same copy behavior

Every visible action labeled "Copy Prompt" MUST use the same canonical Prompt
copy semantics.

#### Scenario: Custom output format is enabled

- **GIVEN** a Prompt with an ordered custom output sequence
- **WHEN** the user copies from the context/menu entry or the bottom action bar
- **THEN** both actions write identical formatted content to the clipboard
- **AND** both preserve the configured order and Prompt composition rules.

### `FR-COPY192-002`: Copy completion has one source identity

A completed copy action MUST increment the source Prompt's usage count exactly
once and MUST show the same copied feedback regardless of entry point.

#### Scenario: Sequence points to another Prompt

- **GIVEN** a source Prompt whose custom output sequence contains one or more
  target Prompts
- **WHEN** the sequence is copied successfully
- **THEN** only the source Prompt usage count increments once
- **AND** target Prompt usage counts do not change
- **AND** copied feedback is displayed.

### `FR-COPY192-003`: Variable and failure behavior is atomic

Prompt copy MUST collect all required variables before the final clipboard
write. Cancellation or clipboard failure MUST NOT count usage or leave stale
queue state.

#### Scenario: User cancels variable entry

- **GIVEN** at least one output item contains unresolved user variables
- **WHEN** the user cancels the variable modal
- **THEN** the clipboard is not partially overwritten
- **AND** no usage count increments
- **AND** a subsequent copy starts with an empty queue.

### `NFR-COPY192-001`: Bounded renderer work

The copy plan MUST avoid additional database or network reads. Planning cost
MUST remain linear in the workspace output-format rows plus ordering cost for
the selected Prompt's rows.

#### Scenario: Workspace contains many unrelated output rows

- **GIVEN** a large in-memory output-format collection
- **WHEN** one Prompt is copied
- **THEN** the flow performs no filesystem, network, or extra database read
- **AND** clipboard and usage persistence each occur at most once.

## Modified Requirements

- The existing output-format copy behavior applies to all same-named copy
  actions, including the bottom action bar.

## Removed Requirements

- None.

## Verification

- `TEST-COPY192-001`: component parity test clicks both entry points and asserts
  exact clipboard equality for ordered custom output.
- `TEST-COPY192-002`: behavior tests cover no format, one target, multiple
  targets, missing target fallback, English mode, and source-only usage count.
- `TEST-COPY192-003`: variable completion, cancellation, clipboard rejection,
  queue reset, and copied feedback tests.
- `TEST-COPY192-004`: focused pure-planning test uses a large unrelated row set
  and proves bounded synchronous work without additional I/O.
