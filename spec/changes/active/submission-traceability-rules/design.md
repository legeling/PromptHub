# Design

## Overview

Create one canonical rule document:

```text
spec/rules/submission-traceability-rules.md
```

This file owns the long-lived rules for:

- staging and commit boundaries
- Conventional Commit message shape
- active change numbering
- `FR -> DES -> TEST -> T` traceability
- issue references and release-time issue closure
- submission / PR checklist

## Design Decisions

- `DES-001`: Keep the detailed rule in `spec/rules/` because this is a project default, not a one-off change note.
- `DES-002`: Keep `Refs` vs `Closes` semantics aligned with the existing GitHub issue state rule.
- `DES-003`: Standardize default IDs as `FR`, `NFR`, `AC`, `DES`, `TEST`, and `T`, while allowing domain-prefixed IDs for large changes.
- `DES-004`: Keep `AGENTS.md` and `docs/contributing.md` as entry points that link to the canonical rule instead of duplicating all details.

## Affected Areas

- Runtime code: none.
- CI / git hooks: none.
- Internal docs: `spec/rules/`, `spec/changes/active/`.
- External docs: `docs/contributing.md`.
- Agent instructions: `AGENTS.md` gets a short pointer to the canonical rule.

## Verification Mapping

- `TEST-001`: `git diff --check` over touched docs.
- `TEST-002`: Manual review that `Refs` / `Closes` text matches the GitHub issue state rule.
- `TEST-003`: Manual review that the new active change has a `FR -> DES -> TEST -> T` chain.
