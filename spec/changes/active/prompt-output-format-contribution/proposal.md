# Prompt Output Format Contribution

## Summary

Port the useful part of `jazzson51569/PromptHub` contribution `fa7b0e6b` into a clean upstream branch: configurable Prompt output sequences that let one Prompt copy action concatenate several Prompt bodies.

## Scope

- Add persistent Prompt output format items.
- Expose desktop IPC/preload/store actions for CRUD and reorder.
- Add a detail-page panel for configuring the output sequence.
- Make copy use the configured sequence while preserving the existing variable-fill modal path.
- Add regression coverage for the persistence boundary.

## Non-Goals

- Do not merge the contributor fork history.
- Do not include the contributor debug tooling, build output path edits, package version churn, or unrelated data-path changes.
- Do not change Prompt relationship semantics.

## Risks

- This touches schema, IPC, preload, renderer state, and copy behavior.
- Custom output format rows must be removed when either source or target Prompt is deleted.
- Multi-Prompt copy must not regress the single-Prompt variable flow.
