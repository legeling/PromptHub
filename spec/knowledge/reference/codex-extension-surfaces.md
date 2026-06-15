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
- Do not require every target to consume Codex `.codex-plugin` directly. PromptHub's value is adapting one Plugin inventory into each agent's native bundle or extension model.
- Do not mark non-Codex agents as supporting Codex Plugins. Mark them as `Adapter` or `Composite` targets when PromptHub can translate the package.
- Do not auto-authorize Apps/connectors during Plugin install.
- Do not auto-apply MCP config to agent targets during Plugin install.
- Agent Assistant must reuse Plugin, Skill, and MCP APIs instead of inventing separate chat-only behavior.

## Agent Bundle Adapter Matrix

| Agent platform                         | Native bundle concept                    | PromptHub classification |
| -------------------------------------- | ---------------------------------------- | ------------------------ |
| Codex CLI / Codex app                  | Codex plugin package and marketplace     | Native                   |
| Claude Code                            | Claude Code plugin package/marketplace   | Adapter                  |
| Cursor                                 | Cursor plugin package/marketplace        | Adapter                  |
| Gemini CLI                             | Gemini CLI extension package             | Adapter                  |
| Kiro                                   | Kiro power package                       | Adapter                  |
| GitHub Copilot / VS Code Agent Plugins | Copilot / VS Code agent plugin package   | Adapter                  |
| OpenCode                               | JavaScript/TypeScript or npm hook module | RuntimeOnly / disabled   |
| Cline                                  | SDK/CLI/Kanban AgentPlugin runtime       | RuntimeOnly / disabled   |
| Windsurf / Devin                       | Separate agent assets and IDE plugins    | Composite                |
| Roo Code                               | Separate skills/rules/commands surfaces  | Composite                |
| Cherry Studio                          | Local skill and agent registries         | Composite                |
| Amp and other targets                  | Insufficient public package evidence     | Pending / disabled       |

PromptHub UI rule: `Native` and bundle-semantics `Adapter` targets are actionable; `RuntimeOnly` and `Composite` targets remain visible but disabled until PromptHub has dedicated wrapper or composite installer designs.

Detailed adapter reference: `spec/knowledge/reference/plugin-agent-adapter-matrix.md`.

Evidence references:

- Claude Code plugins: `https://code.claude.com/docs/en/plugins-reference`
- Cursor plugins: `https://cursor.com/docs/plugins` and `https://github.com/cursor/plugins`
- Gemini CLI extensions: `https://geminicli.com/docs/extensions/reference/`
- Kiro powers: `https://kiro.dev/docs/powers/create/`
- GitHub Copilot CLI plugins: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference`
- VS Code Agent Plugins: `https://code.visualstudio.com/docs/agent-customization/agent-plugins`
- OpenCode plugins: `https://opencode.ai/docs/plugins/`
- Cline plugins: `https://docs.cline.bot/customization/plugins`
- Windsurf / Devin Cascade assets: `https://docs.devin.ai/desktop/cascade/skills` and `https://docs.devin.ai/desktop/cascade/hooks`

## Source and Install Expectations

PromptHub should support these plugin source shapes:

- OpenAI public curated marketplace:
  - repository: `https://github.com/openai/plugins`
  - marketplace name: `openai-curated`
  - marketplace file: `.agents/plugins/marketplace.json`
  - raw JSON: `https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json`
  - first-version UI stance: default Codex official store source
- PromptHub official marketplace:
  - repository: `https://github.com/legeling/PromptHub`
  - marketplace name: `prompthub-official`
  - marketplace file: `.agents/plugins/marketplace.json`
  - raw JSON: `https://raw.githubusercontent.com/legeling/PromptHub/main/.agents/plugins/marketplace.json`
- Official or curated plugin store entry.
- Verified/community store entry.
- GitHub or Git repository over HTTPS.
- Git repository over SSH using local git and local credentials.
- HTTP(S) archive or manifest URL where safe.
- Local folder selected by the user.

For every source shape, PromptHub should first perform a static scan and show a preview. Install should be confirmation-gated and rollback-aware. Git-backed package downloads should use local Git transport rather than anonymous GitHub REST API metadata, so SSH sources can use local SSH keys.

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
- Plugin Agent adapter matrix: `spec/knowledge/reference/plugin-agent-adapter-matrix.md`
- Skill behavior: `spec/knowledge/behavior/skills.md`
- MCP management: `spec/changes/active/mcp-management/`
- Agent platforms: `spec/knowledge/reference/agent-platforms.md`
