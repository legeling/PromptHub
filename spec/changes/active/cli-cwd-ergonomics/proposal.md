# Proposal

## Problem

The standalone CLI exposes many desktop-backed capabilities, but several
commands still require exact ids, full paths, or GUI setup before they become
useful in a project terminal. This conflicts with the project-local Skill
install flow, where a developer can work from the current directory and pick a
Skill interactively.

## Scope

- Add cwd-aware rules project initialization.
- Reuse one fuzzy and interactive selection pattern across CLI resources.
- Let high-frequency Prompt, Rules, MCP, and AI commands accept natural names or
  queries when the result is unambiguous.
- Preserve non-interactive script safety by returning structured conflict
  details instead of prompting.

## Non-Goals

- No database schema changes.
- No filesystem layout changes beyond existing rules project creation.
- No GUI changes.
- No commit or release automation changes.

## Risks

- Fuzzy matching can select the wrong record if applied to destructive commands
  too aggressively. For this batch, ambiguous matches fail in non-interactive
  mode and ask in interactive mode.
- AI route selection must keep existing capability validation in
  `coreAIConfigService`.
