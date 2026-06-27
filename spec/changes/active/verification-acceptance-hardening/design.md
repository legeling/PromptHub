# Design

## Overview

This change updates PromptHub's verification contract without changing product code. The stable docs define the long-lived standard, while this active change records why the standard changed and how it was synchronized.

## Affected Areas

- Data model: no schema or persistence change.
- IPC / API: no IPC, preload, route, or CLI contract change.
- Filesystem / sync: no runtime data layout or sync payload change.
- UI / UX: no UI implementation change; new rules require UI-visible future changes to be operated and checked before acceptance.
- Docs / rules: `spec/workflow/04-verification/README.md`, `spec/rules/testing-standards.md`, `spec/rules/definition-of-done.md`, and `spec/rules/code-quality-architecture.md`.

## Design Decisions

### DES-VAH-001: Direct usability is a completion gate

Completion must prove the feature is directly usable in the affected product surface. Passing a build command alone is not enough for user-visible changes.

### DES-VAH-002: UI verification must operate the surface

UI work requires manual operation or browser/app automation of the changed controls, including layout and state checks. Screenshots or explicit observations are preferred where feasible.

### DES-VAH-003: Reuse audit becomes part of UI acceptance

Before adding new UI or workflow logic, contributors must check existing PromptHub components and patterns. If they diverge, the active change records why.

### DES-VAH-004: Logic tests stay below UI when possible

Sorting, filtering, update detection, source comparison, sync inclusion, install/delete behavior, and derived state should be tested in pure helpers, stores, services, or integration layers before relying on UI tests.

### DES-VAH-005: Static scan is domain-specific

The required scan is not a generic `rg TODO`. It must target the changed risk area, such as duplicate UI, unsafe deletes, direct network calls bypassing proxy settings, hidden truncation, hardcoded platform paths, ignored errors, or raw HTML.

### DES-VAH-006: Safeguards and performance are explicit

When a change has failure, rollback, security, permission, large-list, or bulk-operation risk, verification must either test it or record why it is not applicable.

## Tradeoffs

- This makes completion slower for non-trivial work, but prevents "looks merged, not actually usable" releases.
- UI operation verification can be manual when automation is blocked, but blockers must be recorded so the gap is visible.
- The matrix is required for non-trivial changes and recommended for smaller changes; this avoids turning tiny typo fixes into heavy process work.
