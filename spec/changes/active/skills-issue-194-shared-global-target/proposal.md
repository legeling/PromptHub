# Skills Issue 194: Shared Global Agent Skills Target

## Phase And Status

- Phase: plan
- Status: research-gated
- Primary requirement: `FR-SKILL194-001`
- Exit condition: PromptHub can safely manage an experimental user-level
  `.agents/skills` target with ownership receipts, conflict protection, and an
  evidence-backed compatibility matrix on macOS, Windows, and Linux.

## Why

GitHub issue #194 proposes a shared user-level Skill target at
`~/.agents/skills` (`%USERPROFILE%\.agents\skills` on Windows). Several Agent
products document this discovery path, but a project-level `.agents/skills`
directory does not prove that every product loads the user-level path.

The target can reduce duplicate copies, updates, and uninstall operations, but
it must not be modeled as a fake Agent platform. It is a shared distribution
surface consumed by multiple Agents, with different version, precedence, and
symlink behavior.

## Scope

- In scope:
  - introduce an experimental shared Skill distribution target separate from
    `SKILL_PLATFORMS`;
  - default to the current user's `.agents/skills` directory on all supported
    operating systems and allow a validated override;
  - support copy, symlink with explicit fallback, status, update, and uninstall;
  - add PromptHub ownership receipts so unmanaged files are never silently
    deleted or overwritten;
  - detect same-path and known double-discovery conflicts when shared and
    platform-specific targets are selected together;
  - expose the target through Desktop and the shared CLI distribution contract;
  - maintain an evidence matrix that separates documentation from actual
    runtime verification.
- Out of scope:
  - adding a fake Agent to Agent Management;
  - claiming compatibility for all Agents;
  - changing native platform directories or discovery precedence;
  - moving existing platform installations automatically;
  - managing project-level `.agents/skills` through this global target;
  - deleting or adopting pre-existing unmanaged Skill directories without
    explicit confirmation.

## Risks

- An Agent may document the path but not load it in the user's installed
  version or configuration.
- Two discovery roots may load the same Skill twice with undefined precedence.
- Existing platform uninstall logic is name-based; reusing it without ownership
  proof could delete user-managed data.
- Windows symlink permissions and junction behavior differ from macOS/Linux.
- A custom target override could escape the intended user-controlled boundary
  or point at a platform root already selected separately.

## Rollback Thinking

The feature starts disabled/experimental and adds no SQLite schema. Removing
the target registry and UI does not move or delete installed directories.
Receipts remain in PromptHub data so a downgraded build does not mistake
managed files for platform state. A future cleanup command may remove orphaned
receipts after verifying targets, but rollback itself performs no deletion.

## Related Records

- Issue: https://github.com/legeling/PromptHub/issues/194
- Project-level Skill distribution:
  `spec/changes/archive/2026/08/2026-08-18-project-skill-management/`
- Agent management boundary:
  `spec/changes/active/agent-management-workbench/`
- Stable behavior/reference:
  `spec/knowledge/behavior/skills.md`,
  `spec/knowledge/reference/agent-platforms.md`
- Governing rules:
  `spec/rules/testing-standards.md`
