# Design

## Overview

Keep `spec-init` as a reusable documentation workflow skill, but add a PromptHub profile that activates when the skill runs inside this repository.

The profile makes the lookup order, `spec/` route map, active change gate, local issue status rule, and verification record expectations explicit.

## Affected Areas

- Data model: none.
- IPC / API: none.
- Filesystem / sync: updates local skill instruction files under `.agents/skills/spec-init/`.
- UI / UX: updates `agents/openai.yaml` short description and default prompt.
- Documentation workflow: updates project rules for future spec-init executions in PromptHub.

## Tradeoffs

- The main `SKILL.md` grows slightly, but the PromptHub profile is core behavior for this repo and prevents costly misrouting.
- The scaffold script remains generic. This avoids breaking the skill's new-project use case while the body explains that PromptHub internal work must use `spec/`.
