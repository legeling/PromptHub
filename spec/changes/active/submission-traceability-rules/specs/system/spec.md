# System Spec Delta

## ADDED Requirements

### Requirement FR-001: Submission rules are a stable project rule

PromptHub MUST define commit, staging, documentation numbering, and traceability expectations in `spec/rules/`.

#### Scenario: Contributor prepares a non-trivial change

Given a contributor changes user-visible behavior, workflow, persistence, sync, API, or multi-file feature code
When they prepare the change for commit
Then they can follow a stable rules document for commit shape, documentation IDs, references, and verification notes.

### Requirement FR-002: Commit references distinguish local delivery from public issue closure

PromptHub commits and PRs MUST prefer `Refs #<issue>` while a fix is local-only or release-pending, and MUST use `Closes #<issue>` only when the published release should close the GitHub issue.

#### Scenario: Fix is implemented before release

Given code and tests are complete locally
When the target version has not been published
Then the commit or PR references the issue without closing it
And local delivery state is tracked separately.

### Requirement FR-003: Active changes maintain traceability IDs

Non-trivial active changes SHOULD maintain `FR / DES / TEST / T` IDs and a visible traceability chain.

#### Scenario: Reviewing an active change

Given an active change contains requirements, design, tests, and tasks
When a reviewer opens the change folder
Then they can identify which design and verification items satisfy each requirement.

## Traceability

| Requirement | Design | Verification | Task |
| --- | --- | --- | --- |
| `FR-001` | `DES-001` | `TEST-001` | `T-001`, `T-002` |
| `FR-002` | `DES-002` | `TEST-002` | `T-001`, `T-003` |
| `FR-003` | `DES-003` | `TEST-003` | `T-001`, `T-004` |
