# Desktop Issue 192: Prompt Copy Action Parity

## Phase And Status

- Phase: analyze
- Status: design-ready
- Primary requirement: `FR-COPY192-001`
- Exit condition: every user-facing action named "Copy Prompt" invokes one
  canonical copy pipeline and produces identical clipboard content, variable
  flow, usage accounting, and copied feedback.

## Why

GitHub issue #192 reports that the context/menu action respects a Prompt's
custom output format while the bottom action bar copies only the raw user
Prompt. The two actions have the same label but different semantics.

The output-format feature already defines the intended behavior: when an
ordered output sequence exists, copying the source Prompt produces that
sequence. The defect is duplicate renderer orchestration, not an ambiguous
product requirement.

## Scope

- In scope:
  - route both same-named copy actions through the existing workspace copy
    pipeline;
  - preserve custom output ordering, language selection, system/user Prompt
    composition, and variable collection;
  - count one source-Prompt use per completed user copy action;
  - show the same copied feedback and toast from either entry point;
  - add parity and failure-path component tests.
- Out of scope:
  - adding separate "copy raw" and "copy formatted" commands;
  - changing the stored output-format model or ordering;
  - changing clipboard permissions or fallback implementation;
  - changing Prompt versioning or AI test behavior.

## Risks

- Passing a second handler through the detail context could leave another
  hidden raw-copy path in place.
- Single-item custom formats currently risk attributing usage to the target
  Prompt instead of the source Prompt.
- Variable cancellation must not increment usage or write partial clipboard
  content.
- Copy queues must be reset after success and failure to avoid stale follow-up
  actions.

## Rollback Thinking

The change is renderer-only and has no schema or migration. Reverting restores
the previous bottom-button implementation. Clipboard and usage writes occur
only after the canonical flow has assembled the final content.

## Related Records

- Issue: https://github.com/legeling/PromptHub/issues/192
- Original feature:
  `spec/changes/archive/2026/08/2026-08-18-prompt-output-format-contribution/`
- Stable behavior:
  `spec/knowledge/behavior/prompt-workspace.md`
- Governing rules:
  `spec/rules/testing-standards.md`
