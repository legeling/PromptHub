# Change Templates

This directory provides the default template set for new `spec/changes/active/<change-key>/` folders.

## How This Aligns With OpenSpec

PromptHub borrows OpenSpec's core artifact-guided workflow:

- stable specs live in `spec/specs/`
- active changes live in `spec/changes/active/<change-key>/`
- each change owns delta specs under `specs/<domain>/spec.md`
- completed changes move to `spec/changes/archive/`

PromptHub keeps a few project-specific additions:

- `implementation.md` is required
- `spec/architecture/` stores stable engineering guidance
- `spec/issues/` stores ongoing risk and quality tracking
- `spec/changes/legacy/` stores historical documents that are still useful but not current truth

## Expected New Change Layout

```text
spec/changes/active/<change-key>/
├── proposal.md
├── design.md
├── tasks.md
├── implementation.md
└── specs/
    └── <domain>/
        └── spec.md
```

## Template Usage

Use the files under `change/` as the starting point for every non-trivial change.

Recommended order:

1. `proposal.md`
2. `specs/<domain>/spec.md`
3. `design.md`
4. `tasks.md`
5. `implementation.md`

## Rules

1. A non-trivial change is incomplete if it has no delta spec.
2. Delta specs must live under `specs/<domain>/spec.md`, not as a flat top-level `spec.md` file.
3. `implementation.md` should describe what actually landed, not just restate the original plan.
4. When the change ships, sync durable truth into `spec/specs/` and `spec/architecture/` before archiving.
