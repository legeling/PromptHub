# System Spec Delta

## ADDED Requirements

### Requirement: PromptHub profile for project-local spec-init

When `spec-init` is used inside the PromptHub repository, it MUST route internal SSD documents to the existing `spec/` topology and MUST NOT create parallel internal `docs/workflow/*` or `docs/changes/*` records.

#### Scenario: Updating PromptHub internal specs

Given an agent is using `.agents/skills/spec-init` inside PromptHub
When the work touches internal requirements, design, verification, issues, rules, releases, or active changes
Then the agent reads `AGENTS.md`, `spec/README.md`, and `spec/rules/document-routing-rules.md`
And it writes internal records under `spec/`.

### Requirement: Active change guidance

For non-trivial PromptHub work, `spec-init` MUST direct agents to create or update `spec/changes/active/<change-key>/` with `proposal.md`, `specs/<domain>/spec.md`, `design.md`, `tasks.md`, and `implementation.md`.

#### Scenario: Recording a workflow-affecting change

Given a request changes project workflow guidance
When the agent updates the skill or project rules
Then it records the change in an active change folder with implementation and verification notes.

### Requirement: Separate remote issue state from local delivery state

`spec-init` MUST preserve PromptHub's distinction between GitHub remote issue snapshots and local implementation status.

#### Scenario: Local implementation before release

Given an issue is implemented locally but the target version has not shipped
When the agent updates issue records
Then it marks local status as `local_done` or `release_pending`
And it does not close the GitHub issue snapshot as if the public release already exists.
