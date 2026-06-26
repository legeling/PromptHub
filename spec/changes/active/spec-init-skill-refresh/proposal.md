# Proposal

## Why

PromptHub now relies on a project-specific SSD topology under `spec/`, active change folders, and a separate local GitHub issue delivery overlay. The bundled `.agents/skills/spec-init` skill still described several behaviors through generic `docs/` examples and did not make PromptHub's internal profile explicit enough.

Updating the skill reduces the chance that future agents create parallel `docs/workflow/*` records, skip active changes, or close GitHub issues before a release ships.

## Scope

- In scope:
  - Update `.agents/skills/spec-init/SKILL.md` with PromptHub-specific execution rules.
  - Update the document-boundary reference with PromptHub path routing.
  - Refresh the skill's UI metadata prompt.
  - Record the change in `spec/changes/active/spec-init-skill-refresh/`.
- Out of scope:
  - Changing the generic scaffold script output for new external projects.
  - Rewriting existing `spec/` stable documents.
  - Publishing or installing a new skill version.

## Risks

- The skill could become too PromptHub-specific for external projects. This is mitigated by keeping the generic `docs/` examples and marking PromptHub behavior as an internal profile.
- The script still scaffolds `docs/` for new projects; the skill text must make clear this is not PromptHub's internal route.

## Rollback Thinking

Revert the `.agents/skills/spec-init` edits and remove this active change folder if the updated guidance proves too narrow.
