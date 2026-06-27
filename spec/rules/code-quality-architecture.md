# Code Quality and Architecture Rules

These rules are the default quality bar for PromptHub implementation work. They apply to production code, tests, scripts, and release harness code.

## Principles

- High cohesion: keep behavior that changes together in the same module.
- Low coupling: depend on stable contracts and shared types, not internal implementation details.
- Single responsibility: each module, component, service, store action, and test file should have one clear reason to change.
- Single source of truth: durable data ownership must be explicit across SQLite, filesystem, settings, remote sync, and UI state.
- Dependency direction: shared packages do not import app code; renderer code does not own main-process persistence; UI does not own durable business rules.
- Explicit contracts: IPC, preload, CLI, DB, file, sync, and platform boundaries require typed inputs, validation, errors, and tests.
- Locality of change: if a feature requires broad scattered edits, reassess the boundary before implementation.

## Size Limits

- Source and test files must not exceed 2,000 lines.
- New files should stay below 1,000 lines by default.
- Functions should stay below 50 lines by default.
- Components, stores, and services must be split before they become mixed-responsibility "god" files.
- Existing files over 2,000 lines are legacy debt. Do not add behavior to them except while extracting smaller modules or tests.

When a file approaches the limit, split by responsibility:

- policy/decision helpers
- filesystem or DB adapter logic
- orchestration
- UI rendering
- UI state derivation
- fixture builders
- black-box tests
- white-box branch tests
- performance/security tests

## Coupling Rules

- `packages/shared` owns shared types, constants, and pure utilities only.
- `packages/db` owns SQLite schema, migrations, adapters, and DB classes.
- `packages/core` owns app-independent business workflows.
- `apps/desktop/src/main` owns Electron main-process platform integration.
- `apps/desktop/src/preload` owns the renderer-facing bridge only.
- `apps/desktop/src/renderer` owns UI and view state only.

Do not bypass these boundaries for convenience. If the correct dependency direction is unclear, record the design conflict before coding.

## Reuse Rules

Existing PromptHub components, stores, services, adapters, and shared helpers are part of the architecture. Before adding a new implementation, check the owning surface for an existing pattern.

- Skill, Plugin, MCP, Agent, Store, Prompt, Settings, and Sync surfaces should share card structure, status badges, destructive confirmations, update indicators, install/distribution actions, and layout primitives where the product behavior is intentionally consistent.
- Business rules such as update detection, source comparison, filesystem filtering, sort comparators, proxy/mirror routing, and sync inclusion must live in reusable helpers or services when more than one surface needs them.
- Renderer components may compose and display state, but they must not become the only owner of durable rules, cross-surface policy, or storage semantics.
- If a new component or helper is added instead of reusing an existing one, the active change must record the reason and any follow-up extraction plan.

## State and Data Rules

Every new state or data path must define:

- owner
- persistence location
- derived fields
- invalidation/reload behavior
- migration behavior for existing users
- rollback behavior for partial failures
- test layer that proves the contract

Do not store the same durable fact in multiple places unless there is an explicit sync mechanism and stale-state test.

## Error and Atomicity Rules

- Do not swallow errors that leave persistent state incomplete.
- External side effects require rollback or an explicit recovery path.
- File and DB operations that form one user action must be tested for partial failure.
- Error messages must identify the failed boundary without leaking secrets.

## Test Design Rules

Coverage is required, but coverage is not sufficient. For non-trivial changes, choose the relevant methods:

- black-box behavior tests
- white-box branch and condition tests
- boundary and fuzz tests
- security tests
- performance and stress tests
- integration/contract tests
- failure and rollback tests

The active change must record which methods were used and why any relevant method was omitted.

## Review Checklist

Before marking work done:

- No touched file exceeds 2,000 lines unless the change only extracts from it.
- New or changed code has one clear owner and source of truth.
- Existing components, helpers, services, and design patterns were checked before adding new UI or logic.
- Public contracts are typed and validated.
- Dependencies follow the allowed direction.
- Failure paths do not leave half-written DB rows, files, or UI state.
- Tests prove behavior with the correct methods, not only mock calls.
- UI-visible work has been operated in the running product surface or an equivalent automated browser/app surface.
- Targeted static scans or white-box audits were recorded for duplicate UI, unsafe side effects, direct network paths, hardcoded paths, truncation, ignored errors, and other relevant risk patterns.
- Active change docs record design decisions, coverage gaps, and follow-up debt.
