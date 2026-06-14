# Implementation

## Shipped

- Added a Plugin management active change with proposal, design, delta spec, tasks, and implementation record.
- Added stable Plugin behavior documentation defining Plugin as a first-class PromptHub distribution surface.
- Added Codex extension surface reference documentation mapping Skill, Plugin, MCP server, and App/connector boundaries.
- Updated the spec index and Agent platform reference to include Plugin as a durable extension surface.

## Verification

- Documentation-only change. No production code or tests were modified.
- Verified against current project document routing rules and existing Skill/MCP boundary docs.
- OpenAI Codex manual helper was attempted but the manual URL returned HTTP 403, so this planning record cites the public official Codex pages directly:
  - `https://developers.openai.com/codex/skills`
  - `https://developers.openai.com/codex/plugins`
  - `https://developers.openai.com/codex/plugins/build`

## Synced Docs

- `spec/knowledge/behavior/plugins.md`
- `spec/knowledge/reference/codex-extension-surfaces.md`
- `spec/knowledge/behavior/README.md`
- `spec/knowledge/reference/README.md`
- `spec/knowledge/reference/agent-platforms.md`
- `spec/README.md`

## Follow-ups

- `[待确认]` Choose Plugin durable source of truth before implementation.
- `[待确认]` Decide whether the first Plugin Store source is an official/curated index, user-added stores, or both.
- `[待确认]` Decide how Plugin-managed child assets should be updated or removed after they have been copied into My Skills/My MCP or distributed to external agent targets.
