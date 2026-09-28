# Agent Provider, Model And Session Capability Research

2026-09-28 修订：本文较早的共享 Antigravity CLI/桌面 Skill 根目录结论已被
[当前官方 Skills 文档](https://antigravity.google/docs/skills) 修正：桌面为
`.gemini/config/skills`，CLI 为 `.gemini/antigravity-cli/skills`。历史根与凭据
fallback 的实现记录不再是现行产品要求；以 [FR-AGENT-138](specs/agent-management/spec.md#fr-agent-138-one-current-contract-per-agent-capability)
及 [当前契约设计](current-contract-design.md) 为准。旧日期的原生验证仍只证明当时的边界。


## Scope And Evidence Policy

This inventory records only capabilities supported by first-party documentation,
first-party source code, or a verified local runtime. PromptHub does not enable an
adapter from an inferred filename alone. A platform remains visible when a deep
adapter is unavailable.

Research refreshed on 2026-07-31.

## Complete Built-In Capability Inventory

`packages/shared/constants/agent-platform-capabilities.ts` is the
machine-readable capability projection. It combines explicit deep-adapter
evidence with paths and launch allowlists derived from the canonical
`SKILL_PLATFORMS` registry. This table is a review snapshot, not a second
runtime source.

Status codes: `S` = supported by a verified adapter, `P` = partial/path-level
support, `D` = planned because protocol evidence or implementation is pending,
and `N` = unsupported by the current product boundary. A declared path alone
never upgrades a capability from partial to supported.

| Platform      | Install | Provider | Skills | MCP | Rules | Plugins | Config | Sessions | Usage | Launch | CLI | Backup | Exclusion | Appearance |
| ------------- | ------- | -------- | ------ | --- | ----- | ------- | ------ | -------- | ----- | ------ | --- | ------ | --------- | ---------- |
| claude        | P       | S        | P      | P   | P     | P       | P      | S        | S     | S      | P   | P      | P         | N          |
| copilot       | P       | P        | P      | P   | P     | P       | P      | D        | S     | D      | D   | P      | P         | N          |
| cursor        | P       | D        | P      | P   | D     | P       | D      | P        | D     | S      | D   | P      | P         | N          |
| cherry-studio | P       | D        | P      | D   | D     | D       | D      | D        | D     | S      | D   | P      | P         | N          |
| windsurf      | P       | D        | P      | P   | P     | D       | D      | P        | D     | S      | D   | P      | P         | N          |
| kiro          | P       | P        | P      | P   | D     | P       | P      | P        | D     | S      | D   | P      | P         | N          |
| gemini        | P       | S        | P      | P   | P     | P       | P      | S        | S     | D      | D   | P      | P         | N          |
| antigravity   | P       | D        | P      | P   | P     | P       | D      | D        | S     | S      | D   | P      | P         | N          |
| trae          | P       | D        | P      | D   | D     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| trae-cn       | P       | D        | P      | D   | D     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| trae-work     | P       | D        | P      | D   | D     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| trae-work-cn  | P       | D        | P      | D   | D     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| opencode      | P       | S        | P      | P   | P     | D       | P      | S        | D     | D      | P   | P      | P         | N          |
| oh-my-pi      | P       | P        | P      | P   | P     | P       | P      | S        | D     | D      | P   | P      | P         | N          |
| cline         | P       | D        | P      | P   | D     | D       | P      | D        | D     | D      | D   | P      | P         | N          |
| codex         | P       | S        | P      | P   | P     | P       | P      | S        | S     | S      | P   | P      | P         | S          |
| kimi          | P       | S        | P      | P   | P     | P       | P      | S        | S     | D      | P   | P      | P         | N          |
| reasonix      | P       | D        | P      | P   | D     | D       | P      | D        | D     | D      | D   | P      | P         | N          |
| augment       | P       | D        | P      | P   | D     | D       | P      | D        | D     | D      | D   | P      | P         | N          |
| zcode         | P       | D        | P      | P   | P     | D       | P      | D        | D     | D      | D   | P      | P         | N          |
| grok          | P       | S        | P      | P   | P     | P       | P      | S        | D     | D      | D   | P      | P         | N          |
| qwen          | P       | S        | P      | P   | P     | P       | P      | S        | D     | D      | P   | P      | P         | N          |
| kilo          | P       | D        | P      | P   | P     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| amp           | P       | N        | P      | P   | P     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| openclaw      | P       | P        | P      | D   | P     | D       | P      | S        | D     | D      | P   | P      | P         | N          |
| qclaw         | P       | D        | P      | D   | P     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| qoder         | P       | D        | P      | D   | D     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| qoderwork     | P       | D        | P      | D   | D     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| hermes        | P       | D        | P      | D   | P     | D       | D      | D        | D     | D      | D   | P      | P         | N          |
| codebuddy     | P       | D        | P      | P   | P     | D       | P      | D        | D     | D      | D   | P      | P         | N          |
| workbuddy     | P       | D        | P      | P   | D     | D       | P      | D        | D     | D      | D   | P      | P         | N          |

Custom Agents use the same projection but may only derive declared path and
launch capabilities. PromptHub must not assign them provider, session, usage,
or appearance support by matching a directory name.

## Kilo Code Split-Root Boundary

Current first-party Kilo Code documentation defines separate ownership roots:

- Skills use `~/.kilo/skills/` globally and `.kilo/skills/` per project.
- Global configuration, Agents and instructions use `~/.config/kilo/`, including
  `kilo.jsonc`, `agents/*.md` and `AGENTS.md`.
- Project configuration may use `kilo.jsonc` or `.kilo/kilo.jsonc`; the
  `.kilo` form wins when both exist.
- MCP configuration is the top-level `mcp` field in the selected JSONC config.

PromptHub's current single-root platform projection still maps Kilo Rules to
`~/.kilo/rules/global.md`. That path is not a current first-party global
instruction contract and must not be treated as supported evidence. Correcting
it requires an additive multi-root path contract with an explicit legacy
compatibility policy; the active implementation therefore keeps Kilo Provider,
Config and Rules depth planned until that public path decision is approved.

First-party references:

- <https://kilo.ai/docs/code-with-ai/platforms/cli>
- <https://kilo.ai/docs/getting-started/settings>
- <https://kilo.ai/docs/customize/skills>
- <https://kilo.ai/docs/customize/custom-instructions>
- <https://kilo.ai/docs/customize/custom-rules>
- <https://kilo.ai/docs/automate/mcp/using-in-kilo-code>

## Amp Current Public Boundary

Amp's current public Owner's Manual now provides stable evidence beyond the
former login-gated placeholder:

- user settings: `~/.config/amp/settings.json` or `settings.jsonc` on
  macOS/Linux and `%USERPROFILE%\.config\amp\` on Windows
- workspace settings: nearest `.amp/settings.json` or `settings.jsonc`
- Skills precedence: `~/.config/agents/skills/`, `~/.agents/skills/`,
  `~/.config/amp/skills/`, `.agents/skills/`, then compatibility locations
- Rules: `~/.config/amp/AGENTS.md`, `~/.config/AGENTS.md` and project/tree
  `AGENTS.md`
- MCP: the literal top-level `amp.mcpServers` settings key; workspace servers
  require native Amp trust approval
- Plugins: `.amp/plugins/*.ts` per project and
  `~/.config/amp/plugins/*.ts` per user
- maintenance: the public CLI documents `amp update`

PromptHub implements only the owning MCP target and existing path-level
Skills/Rules projection in this batch. Amp's service-owned model modes do not
provide a user-managed Provider projection, so Provider is explicitly
unsupported rather than planned. Hosted threads, costs, account state, OAuth,
workspace-global Plugins and executable Plugin activation remain Amp-owned.
Raw settings editing, Sessions, Usage, Launch, Maintenance and Plugin
distribution stay planned until separate safe adapters exist.

First-party reference:

- <https://ampcode.com/manual>

## Google Product Identity And Asset Boundary

Google announced on 2026-05-19 that it was transitioning the consumer terminal
experience from Gemini CLI to Antigravity CLI. Gemini CLI stopped serving Free,
Google AI Pro and Ultra requests on 2026-06-18. Enterprise licenses, Google
Cloud and paid Gemini API keys remain supported, which explains the continuing
Gemini CLI releases without making it a current consumer entry point.

PromptHub keeps both platform ids without presenting them as equivalent current
products. `antigravity` is the current Google Agent and uses
`~/.gemini/config` as the shared managed customization root for Skills, MCP,
and Plugins, with global Rules at `~/.gemini/GEMINI.md`. `gemini` retains its
provider and session adapters as an enterprise/legacy compatibility target. The CLI runtime root
`~/.gemini/antigravity-cli` and desktop runtime root
`~/.gemini/antigravity` remain product-owned state and require separate
provider/session adapters before PromptHub exposes deep management.

First-party references:

- <https://github.com/google-gemini/gemini-cli/discussions/27274>
- <https://github.com/google-gemini/gemini-cli/blob/main/docs/changelogs/index.md>
- <https://antigravity.google/docs/cli-overview>
- <https://antigravity.google/docs/gcli-migration>
- <https://antigravity.google/docs/skills>
- <https://antigravity.google/docs/mcp>
- <https://antigravity.google/docs/plugins>

## Cursor Asset And Native Plugin Boundary

Cursor's current public and verified runtime contracts support only a bounded
path-level projection in this batch:

| Domain    | User scope           | Project scope                 | PromptHub policy                                                               |
| --------- | -------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Skills    | `~/.cursor/skills/`  | `.cursor/skills/`             | Manage through the existing Skills owner; do not infer commands or workflows   |
| SubAgents | `~/.cursor/agents/`  | `.cursor/agents/`             | Derive from the canonical Agent root; project assets stay project-owned        |
| MCP       | `~/.cursor/mcp.json` | `.cursor/mcp.json`            | Use the existing MCP owner and native `mcpServers` contract                    |
| Rules     | Cursor Settings      | `.cursor/rules/`, `AGENTS.md` | No synthetic user global rule file; project Rules stay in the Rules owner      |
| Plugins   | `~/.cursor/plugins/` | package/project-specific      | Marketplace cache and local packages are read-only discovery; distribution off |

The public Plugin manifest proves package structure, not installation or
activation. PromptHub therefore disables Cursor distribution until a bounded
Marketplace or verified local-plugin workflow can preview, confirm, verify
native loading, and roll back. Cursor documents local History and CLI
`ls`/`--resume`; the current runtime exposes per-project
`agent-transcripts/<session-id>/<session-id>.jsonl` files. PromptHub reads that
export as a bounded, read-only `partial` Sessions adapter, hides system/tool
payloads, and never treats it as the private history index. Provider, Usage,
and Maintenance remain planned. Private settings databases, authentication,
checkpoints, snapshots, caches, logs, and runtime state are excluded.

First-party references:

- <https://cursor.com/docs/context/rules>
- <https://cursor.com/docs/context/skills>
- <https://cursor.com/docs/agent/subagents>
- <https://cursor.com/docs/reference/plugins>
- <https://github.com/cursor/plugins>
- <https://docs.cursor.com/en/cli/overview>
- <https://docs.cursor.com/en/agent/chat/history>
- <https://docs.cursor.com/en/cli/reference/parameters>

## Windsurf Public Transcript Boundary

Windsurf / Devin Desktop documents an opt-in transcript hook that writes
`~/.windsurf/transcripts/<trajectory_id>.jsonl`. PromptHub treats this export
as a sensitive, read-only compatibility surface rather than as the canonical
Cascade session store.

The adapter exposes only user responses and planner responses. It ignores code
actions, commands, tool arguments and results, file contents, and unknown step
types. It applies bounded file, entry, scan, pagination, identifier, and
symlink controls. Because the public export has no verified resume, deletion,
project, model, or lifecycle contract, Sessions is `partial`; proprietary
`~/.codeium/windsurf/cascade/*.pb` state remains excluded.

First-party references:

- <https://docs.devin.ai/desktop/cascade/hooks>
- <https://docs.devin.ai/desktop/cascade/skills>
- <https://docs.devin.ai/desktop/cascade/workflows>
- <https://docs.devin.ai/desktop/cascade/mcp>
- <https://docs.devin.ai/desktop/cascade/memories>
- <https://docs.devin.ai/desktop/cascade/agents-md>

## Qwen Code Product And Asset Boundary

Qwen Code is a standalone open-source terminal Agent maintained in
`QwenLM/qwen-code`. It is not Qoder and must not reuse the `qoder` platform id,
root, or inferred Skill convention. PromptHub uses built-in id `qwen`, display
name `Qwen Code`, default user root `~/.qwen`, and honors `QWEN_HOME` before the
default. `QWEN_RUNTIME_DIR` controls conversations, logs, and todos only.

Verified first-party asset contracts:

| Domain     | User scope                                                                  | Project scope                                     | Ownership boundary                                                                                                          |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Skills     | `~/.qwen/skills/<name>/SKILL.md`; source also discovers `~/.agents/skills/` | `.qwen/skills/<name>/SKILL.md`                    | Complete package directory; `.agents/skills` is compatibility discovery, not the default Qwen write target                  |
| SubAgents  | `~/.qwen/agents/*.md`                                                       | `.qwen/agents/*.md`                               | Markdown plus YAML frontmatter (`name`, `description`, model/tool policy); extension-provided agents remain extension-owned |
| MCP        | `~/.qwen/settings.json` `mcpServers`                                        | `.qwen/settings.json` `mcpServers`                | Native `qwen mcp --scope user                                                                                               | project` or structured JSON merge; preserve unrelated settings |
| Rules      | `~/.qwen/QWEN.md`                                                           | repository `QWEN.md`; local `.qwen/QWEN.local.md` | Explicit instruction scopes; auto-memory and team memory are not Rules                                                      |
| Extensions | `~/.qwen/extensions/<name>/qwen-extension.json`                             | `.qwen/extensions/<name>/qwen-extension.json`     | Parent bundle owns included Skills, SubAgents, MCP, commands, and hooks                                                     |
| Commands   | `~/.qwen/commands/*.md`                                                     | `.qwen/commands/*.md`                             | Discovery-only until PromptHub has a Commands owning domain                                                                 |
| Sessions   | runtime root `projects/<sanitized-project>/chats/`                          | selected by native CLI project context            | Prefer bounded `qwen sessions list --json`; no recursive runtime scan                                                       |

Security exclusions are mandatory. Qwen provider/API keys, `env` values, MCP
headers/environment values, OAuth client secrets, `mcp-oauth-tokens.json`,
`mcp-oauth-tokens-v2.json`, credentials, sessions, logs, todos, auto-memory, and
`.qwen/team-memory/` never enter renderer payloads or ordinary backup/sync. The
system and system-default settings layers are inspection context only; PromptHub
does not edit administrator policy files in this delivery.

First-party references:

- <https://github.com/QwenLM/qwen-code>
- <https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md>
- <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md>
- <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/sub-agents.md>
- <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md>
- <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md>
- <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/commands.md>
- <https://github.com/QwenLM/qwen-code/blob/main/docs/users/extension/introduction.md>

## Provider And Model Configuration

| Platform    | Native configuration                                                                                                                                               | Supported management direction                                                                                                                              | Credential boundary                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/settings.json`; model fields include `model`, `availableModels`, `modelOverrides`, and provider environment values                                      | Structured model/default-model editing; provider projection through a redacted plan; preserve unrelated settings                                            | OAuth remains platform-owned. API keys and tokens must not enter renderer payloads or ordinary PromptHub JSON                                |
| Codex CLI   | `~/.codex/config.toml`; `model`, `model_provider`, `model_providers`, `profiles`, `model_reasoning_effort`                                                         | Structured TOML inspection, profile/model selection, and previewed activation with backup/verify/rollback                                                   | Preserve Codex auth/keyring ownership. PromptHub-owned secrets use encrypted secret references                                               |
| Kimi Code   | Current `KIMI_CODE_HOME` / `~/.kimi-code/config.toml`; `default_model`, `models`, and `providers`; legacy `KIMI_SHARE_DIR` / `~/.kimi` is fallback-only            | Full Profile inspect/import/preview/activate/verify/rollback for verified direct protocols; native validation when available                                | Literal `api_key` is projected only after confirmation and encrypted for rollback; OAuth, custom headers and credentials stay platform-owned |
| Qwen Code   | `QWEN_HOME` / `~/.qwen/settings.json`; project `.qwen/settings.json`; current v4 `modelProviders`, `model.name`, and user `.env`                                   | Full user-scope Profile inspect/import/preview/activate/verify/rollback for verified direct protocols; preserve unrelated JSONC and dotenv entries          | Native OAuth/ADC/Coding Plan and non-Profile credential sources stay read-only; renderer receives no secret value                            |
| Gemini CLI  | `~/.gemini/settings.json`; enterprise/paid-API compatibility only after the 2026-06-18 consumer cutoff; `model.name`, `modelConfigs`, `security.auth.selectedType` | Preserve structured inspection/editing for supported enterprise users; direct Free/Pro/Ultra users to Antigravity instead of claiming consumer availability | Google login, ADC, and service-account credentials stay platform-owned. API keys are sensitive secret references                             |
| OpenCode    | `~/.config/opencode/opencode.json` or `opencode.jsonc`; `model`, `small_model`, and `provider`                                                                     | Structured model/provider editing; model catalog through `opencode models`; use native auth commands when credentials must change                           | `~/.local/share/opencode/auth.json` is an authentication artifact and is never exposed as a raw editable config file                         |
| Copilot CLI | `COPILOT_HOME` / `~/.copilot/settings.json`; top-level `model`                                                                                                     | JSONC-preserving model-only inspect/update with backup, atomic replace, semantic reread, and rollback; direct endpoint/secret Profiles fail closed          | Native auth and `config.json` remain platform-owned; BYOK credentials and endpoints are process-environment-only                             |
| OpenClaw    | `~/.openclaw/openclaw.json`; `agents.defaults.model`, fallbacks, allowlist, and `models.providers`                                                                 | Prefer `openclaw models status/list/set` and `openclaw config` commands over direct mutation; support aliases and fallbacks after the base adapter          | Native auth profiles and SecretRef markers remain platform-owned. Status may expose readiness but not literal secrets                        |
| Cline       | Provider/model state is owned by Cline storage; current first-party source includes task-scoped settings and provider settings services                            | Keep Provider & Model partial until the current VS Code/CLI storage contract and migration path are fixture-tested                                          | VS Code secrets and Cline credential storage must not be copied into PromptHub                                                               |

### First-Party References

- Claude Code settings and model selection:
  <https://code.claude.com/docs/en/settings> and
  <https://code.claude.com/docs/en/model-config>
- Codex configuration schema and source:
  <https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json>
- Kimi Code data locations, configuration, and providers:
  <https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html>,
  <https://moonshotai.github.io/kimi-code/en/configuration/config-files.html>, and
  <https://moonshotai.github.io/kimi-code/en/configuration/providers.html>
- Qwen Code settings and model providers:
  <https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md> and
  <https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/model-providers.md>
- Gemini CLI configuration and advanced model configuration:
  <https://geminicli.com/docs/reference/configuration/> and
  <https://geminicli.com/docs/cli/generation-settings/>
- OpenCode providers, configuration, and CLI:
  <https://opencode.ai/docs/providers>,
  <https://dev.opencode.ai/docs/config/>, and
  <https://dev.opencode.ai/docs/cli/>
- GitHub Copilot CLI configuration directory and commands:
  <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference>
  and
  <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference>
- OpenClaw models and providers:
  <https://docs.openclaw.ai/cli/models>,
  <https://docs.openclaw.ai/concepts/model-providers>, and
  <https://docs.openclaw.ai/gateway/config-tools>
- Cline storage source:
  <https://github.com/cline/cline/blob/main/apps/vscode/src/core/storage/disk.ts>,
  <https://docs.cline.bot/sdk/architecture/hub-spoke>, and
  <https://docs.cline.bot/sdk/clinecore>

## Official Subscription Quota Matrix

Quota support is enabled only when PromptHub has a bounded, provider-owned
source that corresponds to the platform's official subscription. API-key
billing, custom gateways, locally estimated token counts, and proxy-observed
traffic are separate evidence classes and must not be presented as official
subscription quota.

| Platform                       | Delivered source                                                                                                 | Reported dimensions                                                              | Authentication and runtime boundary                                                                                                                                  | Current status                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Claude Code                    | Anthropic OAuth usage endpoint                                                                                   | 5-hour, 7-day, and optional Opus windows; subscription type                      | Native Keychain/file OAuth credential remains in main; custom Anthropic/cloud gateways short-circuit                                                                 | Supported                         |
| Codex / ChatGPT                | ChatGPT backend usage endpoint                                                                                   | Session and weekly windows; plan                                                 | `~/.codex/auth.json` remains in main; non-OpenAI providers short-circuit                                                                                             | Supported                         |
| Kimi Code                      | Kimi coding usages endpoint                                                                                      | Weekly allowance, rolling 5-hour window, membership level                        | Native Kimi OAuth credential remains in main; shared monthly membership total is not exposed as a trustworthy numeric value by this endpoint                         | Supported and locally verified    |
| Antigravity                    | Running desktop language-service `RetrieveUserQuotaSummary` plus `GetUserStatus`; Cloud Code credential fallback | Gemini and Claude/GPT grouped 5-hour and weekly baseline windows; Google AI plan | Trusted Antigravity process + loopback-only port + in-memory CSRF. macOS Keychain and legacy files are fallback-only. PromptHub does not refresh Google OAuth tokens | Supported and locally verified    |
| Gemini CLI                     | Cloud Code Assist quota endpoint                                                                                 | Per-model remaining quota/reset and tier                                         | Native Gemini OAuth credential remains in main; enterprise/paid compatibility after the consumer cutoff                                                              | Supported for compatible accounts |
| GitHub Copilot                 | Copilot user entitlement endpoint                                                                                | Premium/chat request entitlement, remaining amount, reset, plan                  | Native GitHub/Copilot token remains in main                                                                                                                          | Supported                         |
| Qwen Code                      | No verified stable provider-owned subscription quota contract                                                    | None                                                                             | Do not infer quota from local request counters or read credentials merely to probe undocumented endpoints                                                            | Planned/disabled                  |
| Cursor and other preset Agents | No verified provider-owned quota contract                                                                        | None                                                                             | No credential probing or inferred quota                                                                                                                              | Planned/disabled                  |

Antigravity desktop verification on 2026-07-22 returned the signed-in plan and
quota data from the current local session. Current provider documentation and
the richer `RetrieveUserQuotaSummary` contract establish grouped 5-hour and
weekly windows as baseline quota; legacy prompt-credit counters are not treated
as a baseline total, while AI credits are a separate overage mechanism. The same
account's Keychain access token was short-lived and stale
while a refresh token remained present, proving that access-token expiry alone
cannot be treated as logout. When Antigravity is not running, PromptHub now
returns `antigravity-not-running` rather than the generic expired-credential
state.

Kimi Code verification on 2026-08-10 returned top-level weekly `usage`, one
`300 TIME_UNIT_MINUTE` rolling limit and membership level. Current responses
use `remaining` plus `limit`, while older fixtures and the official client
source use `used` plus `limit`; the adapter accepts both. Kimi documents a
shared monthly membership quota across products, but the Kimi Code `/usages`
`totalQuota` field is currently empty or disputed and the official client does
not use it for plan usage. PromptHub therefore shows the provider-backed weekly
and 5-hour limits and does not fabricate the separate monthly total.

Quota safety rules:

- All credential, account, refresh-token, and CSRF values stay in Electron main
  memory and are excluded from IPC, persistence, logs, errors, and tests.
- Remote requests use fixed provider endpoints, a 10-second timeout, bounded
  response parsing, and a 60-second result cache.
- Antigravity local requests are fixed to `127.0.0.1`, require a process-bound
  CSRF value, use a 4-second timeout, and reject responses larger than 1 MiB.
- A provider adapter may report `ok`, `no-credentials`, `expired`, or
  `unavailable`; it must not fabricate a percentage when the provider reports
  no quota.

## Session And History Storage

| Platform          | Verified source                                                                                                                                                                                            | Native operations                                                                                     | PromptHub adapter policy                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code       | `~/.claude/projects/<project>/<session-id>.jsonl` or the directory selected by `CLAUDE_CONFIG_DIR`                                                                                                         | Resume by session id; export through Claude interfaces                                                | Bounded metadata scan and on-demand read only. Treat JSONL entries as versioned internal data and tolerate unknown/malformed rows                                                                                                                                                                                                                             |
| Codex CLI/Desktop | `~/.codex/session_index.jsonl`, `state_*.sqlite`, and rollout JSONL under `~/.codex/sessions/`                                                                                                             | Native resume/list behavior                                                                           | Index/SQLite first, lazy rollout reads, strict byte limits, and no full recursive parse. Missing/corrupt rollout state must remain a partial result                                                                                                                                                                                                           |
| Gemini CLI        | `~/.gemini/tmp/<project_hash>/chats/` plus bounded sibling `.project_root`                                                                                                                                 | `--list-sessions`, `--resume`, `--delete-session`; configurable retention                             | Bounded project/chat scan with tolerant partial JSON parsing for read-only viewing and resume. The safe native project marker supplies exact project identity; `summary` supplies the native title; internal `info` is hidden and function responses are Tool messages. Native delete remains deferred until confirmation and rollback behavior are specified |
| Kimi Code         | Current root `session_index.jsonl`; `sessions/<workDirKey>/<sessionId>/state.json`; transcript `agents/main/wire.jsonl`                                                                                    | Resume with `kimi --session <id>`                                                                     | Index-first bounded metadata reads, canonical-path containment, lazy transcript detail, malformed-row isolation, and no transcript mutation                                                                                                                                                                                                                   |
| Qwen Code         | `QWEN_RUNTIME_DIR` or `QWEN_HOME` runtime root; per-project chats and runtime sidecars                                                                                                                     | `qwen sessions list --json` plus native resume/export surfaces                                        | Native CLI first with timeout/output cap, bounded metadata page, no recursive filesystem scan, and no transcript persistence in PromptHub                                                                                                                                                                                                                     |
| OpenCode          | `~/.local/share/opencode/`; native database contains session/message/part data                                                                                                                              | bounded read-only `opencode db`, `session delete`, `export --sanitize`, resume with `--session`       | Native CLI adapter. Global metadata must not use cwd-scoped `session list`; use sanitized export for detail and never read `auth.json`                                                                                                                                                                                                                         |
| Copilot CLI       | `<COPILOT_HOME>/session-state/` plus platform-managed `session-store.db`                                                                                                                                   | `copilot --resume=<id>` and native session management                                                 | PromptHub uses a read-only SQLite adapter over `session-store.db` with bounded metadata/turn pagination, search and visible text reads; the platform-owned schema keeps Sessions `partial`, and native state is not modified, migrated, indexed, backed up or synchronized                                                                                    |
| OpenClaw          | `~/.openclaw/agents/<agentId>/sessions/sessions.json` and per-session JSONL; newer stores may be SQLite-backed                                                                                             | Bounded JSON session list, tail, cleanup, compact, and trajectory export                              | Native CLI/RPC adapter. Prefer dry-run for maintenance and platform-managed cleanup over raw file deletion                                                                                                                                                                                                                                                    |
| Cline             | Current local sessions use `~/.cline/data/sessions/sessions.db` plus `<session-id>.json` snapshots; legacy tasks use `~/.cline/data/tasks/<taskId>/api_conversation_history.json` and `task_metadata.json` | Native `cline history` / `cline --id <session-id>` surfaces                                           | PromptHub reads snapshots and legacy task files read-only, uses the SQLite index only for bounded metadata enrichment, hides tool payloads, and keeps Sessions `partial` because Cline owns schema and retention                                                                                                                                              |

### Session Safety Decisions

- Session bodies stay local, platform-owned, excluded from normal backup, sync,
  telemetry, and search indexing.
- The renderer receives only the page explicitly requested by the user, with
  per-entry and total response byte limits.
- PromptHub never edits transcript content.
- Resume launches or copies a validated executable plus argument array. It does
  not build a shell command from transcript data.
- Destructive actions use a native platform command when available. Raw-file
  adapters may offer move-to-trash only after a separate confirmation and
  rollback test; direct `unlink` is not a generic session action.
- Native retention and cleanup controls are shown separately from individual
  session deletion.

### Implemented Baseline

- Non-secret model inspection and default-model updates are enabled for Claude
  Code, Codex, Kimi Code, Gemini CLI, OpenCode, OpenClaw, Qwen Code, and Oh My
  Pi. Codex additionally has a verified Provider Profile adapter; the other
  seven remain partial model-config adapters. JSON/JSONC writes preserve
  unrelated fields; Codex and Kimi TOML writes create a backup and surface the
  possible formatting change. Kimi additionally runs its native config doctor
  when available.
- Provider endpoints returned to the renderer remove user info, query strings,
  and fragments. Literal keys and tokens are never returned.
- Read-only session browse, local search, bounded detail, and resume-command
  copy are enabled for Claude Code, Codex, Gemini CLI, Grok Build, Kimi Code,
  OpenCode, OpenClaw, Qwen Code, Oh My Pi, Copilot (partial), and Cline
  (partial).
- Claude and Gemini file adapters cap scanned files, metadata bytes, detail
  bytes, and entry text. OpenCode uses bounded native JSON commands and
  sanitized export instead of scanning its multi-gigabyte data root.
- Cursor's public transcript adapter resolves encoded keys only through a
  bounded, unique, non-symlink directory walk below the configured home. Stale
  or ambiguous keys keep a compact literal-tail label and no project path; the
  adapter does not read Cursor private databases or invent paths by delimiter
  replacement.
- Cline Sessions is now a partial, read-only snapshot/task adapter. Provider,
  Usage, and native task mutation remain outside this slice; all other session
  capabilities marked planned remain disabled until their index or native
  command adapters pass representative fixture, security, and scale tests.

### First-Party References

- Claude Code sessions:
  <https://code.claude.com/docs/en/sessions>
- Gemini CLI sessions:
  <https://geminicli.com/docs/cli/session-management/>
- OpenCode storage and session commands:
  <https://dev.opencode.ai/docs/troubleshooting/> and
  <https://dev.opencode.ai/docs/cli/>
- Kimi Code sessions and command reference:
  <https://moonshotai.github.io/kimi-code/en/guides/sessions.html> and
  <https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html>
- Qwen Code session command source and runtime path helpers:
  <https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/sessions> and
  <https://github.com/QwenLM/qwen-code/blob/main/packages/core/src/config/storage.ts>
- OpenClaw session stores and commands:
  <https://docs.openclaw.ai/session> and
  <https://docs.openclaw.ai/cli/sessions>
- Codex session failure evidence and storage invariants:
  <https://github.com/openai/codex/issues/20340>,
  <https://github.com/openai/codex/issues/21196>, and
  <https://github.com/openai/codex/issues/22004>
- Cline task storage source:
  <https://github.com/cline/cline/blob/main/apps/vscode/src/core/storage/disk.ts>
- Cline session persistence and CLI history:
  <https://docs.cline.bot/sdk/architecture/hub-spoke>,
  <https://docs.cline.bot/sdk/clinecore>, and
  <https://docs.cline.bot/cli/cli-reference>

## Maintenance CLI Evidence

| Platform    | Official update surface                                   | Exact recovery evidence                                  | Current PromptHub policy                                                                           |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| OpenCode    | `opencode upgrade`                                        | `opencode upgrade v<version>`                            | Confirmed plan/review/apply/verify/rollback update; install remains disabled                       |
| Claude Code | `claude update`                                           | No exact-version rollback contract in the reviewed docs  | Read-only diagnostic                                                                               |
| Codex       | npm and Homebrew installation/update paths                | npm accepts exact `@openai/codex@<version>` restoration  | npm/Node version-manager installs support confirmed update; all other sources stay diagnostic-only |
| Qwen Code   | npm, standalone binary and Homebrew installation surfaces | No one cross-source exact rollback contract was verified | Read-only diagnostic until each source has its own verified apply and recovery contract            |

Primary references:

- OpenCode CLI: <https://opencode.ai/docs/cli/>
- Claude Code setup: <https://code.claude.com/docs/en/setup>
- Codex source and installation: <https://github.com/openai/codex>
- npm exact package-version installation:
  <https://docs.npmjs.com/cli/v11/commands/npm-install>
- Codex mixed-install evidence: <https://github.com/openai/codex/issues/24035>
- Qwen Code quickstart and troubleshooting:
  <https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/> and
  <https://qwenlm.github.io/qwen-code-docs/en/users/support/troubleshooting/>

The table records protocol evidence rather than copied implementation. PromptHub
does not import another project's updater, package-manager state or UI.

## Verified Local Scale

The development machine was inspected using path, file-count, and size metadata
only. No transcript body or credential file was read.

| Source                        |  Files | Approximate size | Design consequence                                                  |
| ----------------------------- | -----: | ---------------: | ------------------------------------------------------------------- |
| Claude projects               |     87 |            73 MB | Bounded file metadata scan is acceptable                            |
| Codex sessions                |    219 |            13 GB | Index-first and lazy reads are mandatory                            |
| Gemini temporary project data |    751 |           180 MB | Project grouping and pagination are required                        |
| Kimi Code sessions            |      3 |            40 KB | Small locally, but the append-only index remains the bounded source |
| OpenCode application data     | 25,948 |           5.9 GB | Native CLI/database query is required; recursive scan is prohibited |
| OpenClaw agents               |      3 |            48 KB | Native CLI remains preferred because formats can migrate            |

## Credential Audit Result

PromptHub's existing `config/ai-models.json` stores provider and model API keys as
plain text and exposes them to renderer state. It cannot be reused as the Agent
Provider Profile secret store.

The desktop cloud-account implementation already demonstrates an Electron
`safeStorage`-backed encrypted file with atomic replacement and owner-only file
permissions. Agent Provider Profiles should extract a generic version of this
pattern:

1. SQLite or ordinary config stores only `secret_ref` and non-secret fields.
2. The encrypted secret file is read and written only in Electron main.
3. Renderer APIs accept a new secret during save but never receive it on read.
4. Native adapters receive the resolved value only while planning/applying a
   specific operation.
5. Default backup/export contains secret requirements, not secret values.

Until that abstraction and its security tests land, Provider & Model may inspect
native state and safely edit non-secret model fields, but it must not claim full
provider-profile switching support.
