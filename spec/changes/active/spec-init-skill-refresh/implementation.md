# Implementation

## Shipped

- Updated `.agents/skills/spec-init/SKILL.md` with a PromptHub internal execution profile.
- Clarified that PromptHub internal SSD records route to `spec/`, while `docs/` remains for external-facing documentation.
- Added active change requirements for non-trivial PromptHub work, including `proposal.md`, `specs/<domain>/spec.md`, `design.md`, `tasks.md`, and `implementation.md`.
- Added GitHub issue remote snapshot vs local delivery-state rules to the skill instructions.
- Added PromptHub testing and completion expectations to the skill instructions.
- Updated `.agents/skills/spec-init/references/doc-boundaries.md` with PromptHub path topology adaptation.
- Refreshed `.agents/skills/spec-init/agents/openai.yaml` so the skill prompt tells agents to read `AGENTS.md` and the existing spec topology first.
- Removed the unsupported `compatibility` frontmatter field from `SKILL.md` so the skill passes current validation.

## Verification

- `python3 /Users/lingxiaotian/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/spec-init`
- `git diff --check -- .agents/skills/spec-init/SKILL.md .agents/skills/spec-init/references/doc-boundaries.md .agents/skills/spec-init/agents/openai.yaml spec/changes/active/spec-init-skill-refresh`

## Synced Docs

- `.agents/skills/spec-init/SKILL.md`
- `.agents/skills/spec-init/references/doc-boundaries.md`
- `.agents/skills/spec-init/agents/openai.yaml`
- `spec/changes/active/spec-init-skill-refresh/`

## Follow-ups

- None currently identified.
