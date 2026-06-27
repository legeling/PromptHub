# Verification Acceptance Hardening Spec

## ADDED Requirements

### FR-VAH-001: Direct Usability Acceptance

Every non-trivial user-visible change MUST prove that the touched feature can be used directly in the product surface without obvious breakage.

#### Scenarios

- Given a change touches desktop, web, CLI, Skill, Plugin, MCP, prompt, sync, settings, release, or store behavior, when the change is marked complete, then the active change MUST record the primary user flow, expected result, observed result, and any blockers.
- Given a flow has loading, empty, error, conflict, delete, update, sync, or install states, when the flow is accepted, then the verification record MUST state which states were exercised or why they were intentionally deferred.

### FR-VAH-002: UI Operation Verification

Every UI-visible change MUST include real operation verification, not only static inspection or unit tests.

#### Scenarios

- Given a desktop or web UI surface changed, when verification is performed, then the tester MUST operate the affected controls in the running app, browser, or equivalent story/page.
- Given browser automation is feasible, when the UI is verified, then Playwright or the in-app browser SHOULD capture screenshots or observations for the key viewport/state.
- Given automation is blocked, when the UI is verified, then the active change MUST record the blocker and the manual steps that were still completed.

### FR-VAH-003: Reuse And No Duplicate UI Audit

UI work MUST reuse existing PromptHub components, patterns, stores, service contracts, and design tokens unless a documented reason justifies a new abstraction.

#### Scenarios

- Given a change adds or modifies UI, when implementation begins, then the change record MUST identify the existing component or pattern checked first.
- Given a new component or variant is introduced, when the change is accepted, then the record MUST explain why reuse was insufficient and whether a later extraction is needed.
- Given related surfaces exist, such as My Skill, My Plugin, My MCP, Agent Skill, Agent Plugin, and Agent MCP, when one surface changes, then verification MUST check that shared card, layout, status badge, delete confirmation, and update-state behavior remain consistent where the product intends consistency.

### FR-VAH-004: Unit And White-box Coverage For Logic

Changed logic MUST be covered at the lowest effective test layer, including branch and condition behavior.

#### Scenarios

- Given a change modifies sorting, filtering, update detection, source selection, proxy routing, sync inclusion, deletion, install, or migration logic, when it is accepted, then tests MUST cover changed decisions, guard paths, fallback paths, and error paths.
- Given a UI change depends on derived state, when it is accepted, then tests MUST cover the selector/helper/store behavior rather than relying only on visual inspection.

### FR-VAH-005: Static Scan And White-box Audit Record

Non-trivial changes MUST include a targeted static scan and white-box audit note.

#### Scenarios

- Given a change touches production code, when verification is recorded, then the active change MUST list targeted scan commands or equivalent audit checks.
- Given the change domain has known risk patterns, when scanning is performed, then the scan MUST target those patterns, such as duplicated components, hardcoded paths, direct network calls bypassing proxy settings, unguarded deletes, unsafe HTML, truncation of user content, ignored errors, or TODO placeholder logic.

### FR-VAH-006: Safeguards, Rollback, And Performance

Verification MUST cover protective behavior and optimization risks where they are relevant to the changed surface.

#### Scenarios

- Given a change writes files, DB rows, settings, remote payloads, or local repositories, when accepted, then verification MUST cover partial failure, rollback, idempotency, or recovery behavior.
- Given a change affects long lists, inventories, stores, graph views, sync payloads, or bulk operations, when accepted, then verification MUST include a stress or performance rationale.
- Given a change is security-sensitive, when accepted, then verification MUST cover relevant adversarial inputs and unsafe-source boundaries.

## Acceptance Matrix

Each non-trivial active change SHOULD record the following matrix in `implementation.md`:

| Gate | Required evidence |
| --- | --- |
| Functional usability | End-to-end flow, expected result, observed result |
| UI operation | Manual or automated operation steps, screenshots/observations where feasible |
| Reuse audit | Existing component/pattern checked, reuse or deviation rationale |
| Unit / white-box | Changed branches, conditions, fallbacks, errors covered |
| Static scan | Targeted commands or audit checklist and result |
| Safeguards | Error, rollback, security, deletion, sync, or permission behavior |
| Performance / stress | Large list, repeated operation, or explicit non-applicability rationale |

## Verification Strategy

- TEST-VAH-001: Review non-trivial change records for a functional usability entry with flow, expected result, observed result, and blocker status.
- TEST-VAH-002: Review UI-visible change records for manual or automated operation steps and screenshot/observation evidence where feasible.
- TEST-VAH-003: Review UI change records for an explicit reuse audit and consistency checks against related PromptHub surfaces.
- TEST-VAH-004: Review changed logic for unit or integration tests covering branches, conditions, fallbacks, derived state, and errors.
- TEST-VAH-005: Review implementation records for targeted scan commands or white-box audit notes tied to the changed risk area.
- TEST-VAH-006: Review storage, sync, install, delete, network, and bulk-operation changes for rollback, security, recovery, or performance evidence.

## Traceability

- FR-VAH-001 -> DES-VAH-001 -> TEST-VAH-001 -> T-VAH-001
- FR-VAH-002 -> DES-VAH-002 -> TEST-VAH-002 -> T-VAH-002
- FR-VAH-003 -> DES-VAH-003 -> TEST-VAH-003 -> T-VAH-003
- FR-VAH-004 -> DES-VAH-004 -> TEST-VAH-004 -> T-VAH-004
- FR-VAH-005 -> DES-VAH-005 -> TEST-VAH-005 -> T-VAH-005
- FR-VAH-006 -> DES-VAH-006 -> TEST-VAH-006 -> T-VAH-006
