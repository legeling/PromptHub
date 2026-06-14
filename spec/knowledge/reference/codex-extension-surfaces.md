# Codex Extension Surfaces

## Purpose

This reference records the Codex extension-surface vocabulary that PromptHub should use when modeling Skills, Plugins, MCP servers, Apps/connectors, and future Agent Assistant actions.

Official references:

- [Codex Skills](https://developers.openai.com/codex/skills)
- [Codex Plugins](https://developers.openai.com/codex/plugins)
- [Build plugins](https://developers.openai.com/codex/plugins/build)

## Concept Map

| Surface         | PromptHub Product Meaning                            | Typical Contents                                                        | PromptHub Management Surface           |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| Prompt          | One reusable user-authored prompt or template        | title, content, variables, tags, versions                               | Prompts                                |
| Skill           | Reusable workflow instructions for a class of work   | `SKILL.md`, frontmatter, references, scripts/assets                     | Skills                                 |
| MCP server      | External tools/context exposed through MCP           | command/args/env, remote URL, transport, config target                  | MCP                                    |
| App / connector | Authorized integration with an external service      | service identity, OAuth/auth state, connector metadata                  | Plugin child asset, future App surface |
| Plugin          | Installable distribution bundle                      | skills, apps/connectors, MCP servers, commands, hooks, assets, metadata | Plugins                                |
| Agent Assistant | Natural-language operator for PromptHub capabilities | calls existing PromptHub APIs with user confirmation                    | Future Assistant                       |

## Modeling Rules

- Do not model a multi-capability package as one Skill just because it contains a `SKILL.md`.
- Do not model an MCP server as a Skill. MCP is a tool/context runtime config; Skill is procedural knowledge.
- Do not model Plugin as only a marketplace card. Plugin must have install state, source identity, manifest/inventory, update state, and child-asset actions.
- Do not auto-authorize Apps/connectors during Plugin install.
- Do not auto-apply MCP config to agent targets during Plugin install.
- Agent Assistant must reuse Plugin, Skill, and MCP APIs instead of inventing separate chat-only behavior.

## Source and Install Expectations

PromptHub should support these plugin source shapes:

- Official or curated plugin store entry.
- Verified/community store entry.
- GitHub or Git repository over HTTPS.
- Git repository over SSH using local git and local credentials.
- HTTP(S) archive or manifest URL where safe.
- Local folder selected by the user.

For every source shape, PromptHub should first perform a static scan and show a preview. Install should be confirmation-gated and rollback-aware.

## Security Baseline

- Static scan reads metadata only.
- Static scan does not execute code.
- Static scan does not install dependencies.
- Static scan does not start MCP servers.
- Static scan does not call external app APIs.
- Filesystem writes must be constrained to PromptHub-managed plugin paths unless the user explicitly chooses a target distribution action.
- Target agent config writes must preserve unrelated config and create backups.
- Plugin trust labels must describe provenance, not guarantee safety.

## Related PromptHub Docs

- Plugin behavior: `spec/knowledge/behavior/plugins.md`
- Plugin active change: `spec/changes/active/plugin-management/`
- Skill behavior: `spec/knowledge/behavior/skills.md`
- MCP management: `spec/changes/active/mcp-management/`
- Agent platforms: `spec/knowledge/reference/agent-platforms.md`
