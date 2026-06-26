# Agent Platform Assets

## Purpose

本文件记录 PromptHub 当前关注的 Agent 平台固定资产信息，重点覆盖这些长期稳定、适合被产品建模的本地资产：

- 平台标识与默认根目录
- 规则 / 上下文文件
- 记忆 / 会话历史 / transcript / checkpoint 相关资产
- skills / agents / commands / workflows / steering 等可复用能力载体
- 配置 / settings / profile / compatibility 文件
- 官方证据链接与证据级别

## Stable Asset Rules

- 本文档记录的是长期稳定的平台资产清单，不是单次变更 proposal。
- 当 `packages/shared/constants/platforms.ts` 中的平台根目录、默认规则文件或配置文件发生稳定变化时，应同步更新本文档。
- 当 `packages/shared/constants/rules.ts` 中的全局规则支持集合发生稳定变化时，应同步更新本文档中的 `Rules Support Snapshot`。
- 对没有公开官方文档、正文不可抓取、或当前只能通过产品 UI/登录后页面确认的平台，必须明确标注为 `PromptHub inferred` 或 `Evidence limited`。
- 对于“功能存在但本轮未拿到明确本地路径”的资产，可以记录为“feature documented, local path not confirmed in current pass”，不要伪装成已确认路径。

## Product Modeling Note

- 对 PromptHub 而言，Agent 平台的首要配置对象应是“平台根目录”，而不是单独的 `skills` 扫描路径。
- `skills / plugins / rules / commands / agents / workflows / config` 等都属于从根目录派生出的本地资产表面。
- 因此设置页和后续 Agent 管理页应优先暴露根目录管理与派生资产预览；仅保留零散扫描路径会把产品错误收窄成 Skill 导入工具。
- 对 PromptHub 而言，Plugin 是比 Skill 更高一级的分发包；它可以包含 Skill、MCP server、App/connector、commands、hooks、assets 等子资产。稳定概念映射见 `spec/knowledge/reference/codex-extension-surfaces.md`。

## MCP Config Support Snapshot

PromptHub MCP 管理第一版建模为“配置库 + 目标文件投影”，不运行 MCP 网关、代理或统一 endpoint。

| Target      | PromptHub Target ID | Default Scope Paths                                                | Config Shape                        | Evidence / Notes                                   |
| ----------- | ------------------- | ------------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------- |
| Codex       | `codex`             | `~/.codex/config.toml`; project `.codex/config.toml`               | TOML `[mcp_servers.<name>]`         | Officially documented                              |
| Claude Code | `claude`            | `~/.claude.json`; project `.mcp.json`                              | JSON `mcpServers`                   | Officially documented; scopes include user/project |
| Cursor      | `cursor`            | `~/.cursor/mcp.json`; project `.cursor/mcp.json`                   | JSON `mcpServers`                   | Officially documented                              |
| VS Code     | `vscode`            | project `.vscode/mcp.json`; user profile path varies by VS Code UI | JSON `servers`                      | Officially documented                              |
| Cline       | `cline`             | `~/.cline/data/settings/cline_mcp_settings.json`                   | JSON `mcpServers`-style settings    | Officially documented                              |
| Custom JSON | `custom-json`       | user-selected file path                                            | JSON `mcpServers`                   | PromptHub generic projection                       |
| Custom TOML | `custom-toml`       | user-selected file path                                            | Codex-compatible managed TOML block | PromptHub generic projection                       |

Stable product rule:

- PromptHub's internal MCP source of truth is a normalized local library, not any one agent config file.
- Applying MCP config must preserve unrelated target config and create a backup before overwriting an existing file.
- MCP entries are configuration records, not Skill directory packages; they do not participate in Skill versioning, safety scanning, or rating flows.
- Roo Code remains documented below as an external Agent asset, but PromptHub no longer exposes it as a built-in MCP target preset.

## Evidence Levels

- `Officially documented`: 官方文档明确写出路径、文件名、目录结构或优先级。
- `Officially documented (partial)`: 官方文档明确了一部分，但另一些本地路径或兼容行为仍未在当前公开资料中写明。
- `PromptHub inferred`: 当前来自 PromptHub 平台常量、兼容目标或社区约定，缺少足够公开官方证据。
- `Evidence limited`: 官方入口存在，但正文需要登录、无法稳定抓取，或公开信息不足以确认本地资产。

## Rules Support Snapshot

当前 `Rules` 模块已稳定支持以下全局规则文件：

- Claude Code: `~/.claude/CLAUDE.md`
- Codex CLI: `~/.codex/AGENTS.md`
- Gemini CLI: `~/.gemini/GEMINI.md`
- OpenCode: `~/.config/opencode/AGENTS.md`
- Windsurf: `~/.codeium/windsurf/memories/global_rules.md`

补充说明：

- `OpenClaw` 虽然已经有充分官方证据证明其 workspace bootstrap files、memory、sessions、logs 等本地资产存在，但当前并未进入 `Rules` 运行时全局规则白名单。
- 原因不是证据不足，而是 `Rules` 当前只支持“每个平台一个 canonical 全局规则文件”的单文件模型；`OpenClaw` 的长期上下文表面则是 `~/.openclaw/workspace/` 下的一组 workspace files，而不是单一规则文件。
- `Cursor`、`Kiro`、`Roo Code`、`GitHub Copilot` 也都已经在资产文档中建模，但当前仍未进入 `Rules` 运行时全局规则白名单。
- 这些平台未进入白名单的主要原因分别是：缺少已确认的单一本地全局规则文件、以 steering / rules directory / multi-entry 结构为主，或其协议本身以 repository-scoped 文件为核心，而非用户级单文件。

项目规则当前稳定支持：

- 当前项目：`<repo>/AGENTS.md`
- 用户手动添加目录：`<selected-project>/AGENTS.md`

## Special Filenames

本节只记录“文件名本身就是平台协议”的资产。目录型协议、规则目录、skills 目录、workflow 目录见后续矩阵与平台档案卡。

| Filename / Pattern                       | Official Platforms                                                    | PromptHub Interpretation                    | Evidence              | Notes                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                              | Codex CLI, OpenCode, Cursor, Windsurf, Roo Code, Kiro, GitHub Copilot | 当前最重要的跨平台项目规则 canonical 文件   | Officially documented | Claude Code 不原生读取 `AGENTS.md`，但官方支持在 `CLAUDE.md` 里 `@AGENTS.md` 导入。                     |
| `CLAUDE.md`                              | Claude Code                                                           | Claude 原生项目 / 用户 / managed 指令文件   | Officially documented | OpenCode 将其作为兼容 fallback；GitHub Copilot 允许仓库根使用单个 `CLAUDE.md` 作为 agent instructions。 |
| `GEMINI.md`                              | Gemini CLI                                                            | Gemini 原生上下文文件                       | Officially documented | GitHub Copilot 允许仓库根使用单个 `GEMINI.md` 作为 agent instructions。                                 |
| `.github/copilot-instructions.md`        | GitHub Copilot                                                        | Copilot repository-wide custom instructions | Officially documented | 作用于整个仓库，不等同于 `AGENTS.md` 的就近目录覆盖模型。                                               |
| `.github/instructions/*.instructions.md` | GitHub Copilot                                                        | Copilot path-specific custom instructions   | Officially documented | 通过 frontmatter `applyTo` 绑定路径。                                                                   |
| `global_rules.md`                        | Windsurf                                                              | Windsurf 全局规则单文件                     | Officially documented | 规范路径为 `~/.codeium/windsurf/memories/global_rules.md`。                                             |
| `.roorules`                              | Roo Code                                                              | Roo workspace generic fallback rule file    | Officially documented | 当 `.roo/rules/` 不存在或为空时才回退到该单文件。                                                       |
| `.roorules-{mode}`                       | Roo Code                                                              | Roo mode-specific fallback rule file        | Officially documented | 当 `.roo/rules-{modeSlug}/` 不存在或为空时使用。                                                        |
| `AGENT.md`                               | Roo Code                                                              | `AGENTS.md` 的 fallback 兼容名              | Officially documented | 仅在 workspace root，且 `AGENTS.md` 不存在时回退。                                                      |
| `SOUL.md`                                | OpenClaw                                                              | OpenClaw workspace persona / tone file      | Officially documented | OpenClaw 官方文档确认使用小写 `SOUL.md`，并在 normal sessions 注入。                                    |
| `SOUL.MD`                                | none confirmed                                                        | 不作为稳定官方兼容文件名建模                | Evidence limited      | 当前公开资料只确认 `SOUL.md`，未确认全大写 `SOUL.MD`。                                                  |
| `.cursorrules`                           | none confirmed in current pass                                        | 不作为稳定官方资产建模                      | Evidence limited      | Cursor 当前官方主推 `.cursor/rules/` 与 `AGENTS.md`。                                                   |
| `.windsurfrules`                         | none confirmed in current pass                                        | 不作为稳定官方资产建模                      | Evidence limited      | Windsurf 当前官方主推 `global_rules.md`、`.windsurf/rules/*.md` 与 `AGENTS.md`。                        |

## Platform Overview

### Documented Platforms

| Platform       | Default Root / Config Dir                                                                                               | Rules / Context Surface                                                                                                                                                                                       | Memory / History / Checkpoints                                                                                                                                                                                                                                                                                          | Reusable Assets                                                                                                                                                                      | Config / Profiles                                                                                                                            | Evidence                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Claude Code    | `~/.claude`                                                                                                             | `~/.claude/CLAUDE.md`, project `CLAUDE.md`, `./.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/**/*.md`                                                                                                 | Per-project auto memory in `~/.claude/projects/<project>/memory/` with `MEMORY.md` entrypoint                                                                                                                                                                                                                           | `.claude/skills/<name>/SKILL.md`; subagents documented; `@AGENTS.md` import supported                                                                                                | user / local / managed settings documented; exact settings file set not re-listed here                                                       | Officially documented                                            |
| Codex CLI      | `~/.codex`                                                                                                              | `AGENTS.override.md` or `AGENTS.md`; per-directory discovery; fallback names configurable in `config.toml`                                                                                                    | `~/.codex/memories/`; Chronicle in `~/.codex/memories_extensions/chronicle/`; temp captures in `$TMPDIR/chronicle/screen_recording/`; logs in `~/.codex/log/` and optional `session-*.jsonl`                                                                                                                            | Skills in `.agents/skills/`, `~/.agents/skills/`, `/etc/codex/skills`; plugins are installable bundles with `.codex-plugin/plugin.json` metadata; subagents and workflows documented | `~/.codex/config.toml`, `.codex/config.toml`, `/etc/codex/config.toml`, `--profile`, `CODEX_HOME`                                            | Officially documented                                            |
| Gemini CLI     | `~/.gemini`                                                                                                             | `~/.gemini/GEMINI.md`; workspace `GEMINI.md`; customizable `context.fileName`; `/memory` manages loaded context                                                                                               | Session transcripts under `~/.gemini/tmp/<project>/chats/`; resume / rewind / checkpointing documented; project memory inbox and patch workflow documented but not all canonical directories are named on one page                                                                                                      | Skills in `~/.gemini/skills/`, `.gemini/skills/`, plus `.agents/skills/` aliases; commands in `~/.gemini/commands/`, `.gemini/commands/`                                             | `~/.gemini/settings.json`, `.gemini/settings.json`; experimental flags for auto memory / memory v2 / model steering                          | Officially documented                                            |
| Cline          | `~/.cline`                                                                                                              | `AGENTS.md`; `.clinerules/`; `~/Documents/Cline/Rules`; project `.cline/` instruction assets                                                                                                                  | Session data in `~/.cline/data/sessions/`; additional db state under `~/.cline/data/db/`                                                                                                                                                                                                                                | `~/.cline/skills/`, `.cline/skills/`, `~/.cline/agents/`, `.cline/agents/`, plugins / hooks / workflows documented                                                                   | `~/.cline/data/settings/global-settings.json`, `providers.json`, `cline_mcp_settings.json`                                                   | Officially documented                                            |
| OpenClaw       | `~/.openclaw`                                                                                                           | workspace bootstrap files in `~/.openclaw/workspace` (or `workspace-<profile>`), including `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, optional `HEARTBEAT.md` / `BOOT.md` / `BOOTSTRAP.md` | Session store in `~/.openclaw/agents/<agentId>/sessions/sessions.json`; transcripts in `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`; daily memory in workspace `memory/YYYY-MM-DD.md`; long-term memory `MEMORY.md`; dreaming surface `DREAMS.md`; gateway logs in `/tmp/openclaw/openclaw-YYYY-MM-DD.log` | Workspace skills in `~/.openclaw/workspace/skills/`; managed skills in `~/.openclaw/skills/`; canvas files in workspace `canvas/`                                                    | `~/.openclaw/openclaw.json`; profile-specific workspace via `OPENCLAW_PROFILE`; sandbox workspaces in `~/.openclaw/sandboxes`                | Officially documented                                            |
| OpenCode       | `~/.config/opencode`                                                                                                    | `~/.config/opencode/AGENTS.md`; local traversal of `AGENTS.md`; Claude fallback `CLAUDE.md`; extra `instructions` via `opencode.json`                                                                         | Snapshot / undo feature documented; canonical persisted conversation-history path not confirmed in current pass                                                                                                                                                                                                         | Agents in `agents/`; skills in `skills/`; commands in `commands/`; plugins in `plugins/`; modes in `modes/`                                                                          | `~/.config/opencode/opencode.json`, `~/.config/opencode/tui.json`, project `opencode.json`, env-based overrides, managed configs             | Officially documented                                            |
| Cursor         | `~/.cursor`                                                                                                             | `.cursor/rules/` project rules; `AGENTS.md` in root and subdirectories; user rules and team rules documented                                                                                                  | No public local memory / transcript / checkpoint path confirmed in current pass                                                                                                                                                                                                                                         | Rule files in `.cursor/rules/`; no official local `skills/` directory confirmed in current pass                                                                                      | Team rules via dashboard; public local user-rule file path not confirmed in current pass                                                     | Officially documented (partial)                                  |
| Windsurf       | `~/.codeium/windsurf`                                                                                                   | `memories/global_rules.md`; `.windsurf/rules/*.md`; directory-scoped `AGENTS.md`; enterprise system rules                                                                                                     | Workspace memories in `~/.codeium/windsurf/memories/`; memories are local and workspace-scoped                                                                                                                                                                                                                          | Skills in `.windsurf/skills/` and `~/.codeium/windsurf/skills/`; workflows in `.windsurf/workflows/` and `~/.codeium/windsurf/global_workflows/`; `.agents/skills/` compatibility    | Root config dir documented by feature paths; separate public settings-file contract not the focus of current pass                            | Officially documented                                            |
| Kiro           | `~/.kiro`                                                                                                               | Workspace and global steering in `.kiro/steering/` and `~/.kiro/steering/`; root or global `AGENTS.md` also supported                                                                                         | No public local transcript / checkpoint directory confirmed in current pass                                                                                                                                                                                                                                             | Skills in `.kiro/skills/` and `~/.kiro/skills/`; manual steering files also surface as slash commands                                                                                | Steering inclusion modes and panel-driven management documented; standalone config file path not confirmed in current pass                   | Officially documented (partial)                                  |
| Roo Code       | `~/.roo`                                                                                                                | `~/.roo/rules/`, `~/.roo/rules-{mode}/`, `.roo/rules/`, `.roo/rules-{mode}/`, `.roorules`, `.roorules-{mode}`, workspace `AGENTS.md` / `AGENT.md`                                                             | Checkpoints enabled by default via shadow git repo; task-scoped restore / diff documented                                                                                                                                                                                                                               | Skills in `.roo/skills/`, `.roo/skills-{mode}/`, `~/.roo/skills/`, `~/.roo/skills-{mode}/`, plus `.agents/skills/`; slash commands in `.roo/commands/`, `~/.roo/commands/`           | VS Code setting `roo-cline.useAgentRules`; mode and prompt UI configs documented                                                             | Officially documented                                            |
| GitHub Copilot | repo-scoped for instructions; plugin storage is managed by Copilot CLI / VS Code Agent Plugins                          | `.github/copilot-instructions.md`; `.github/instructions/*.instructions.md`; `AGENTS.md` anywhere in repo; root `CLAUDE.md` or `GEMINI.md` alternative                                                        | No local memory / transcript / checkpoint path documented in this repository-customization pass                                                                                                                                                                                                                         | Copilot / VS Code Agent Plugins via `plugin.json`; component paths include agents, skills, commands, hooks, MCP servers, and LSP servers                                             | Repository settings can enable / disable custom instructions; Copilot CLI / VS Code settings manage plugin marketplaces and plugin locations | Officially documented                                            |
| Amp            | `~/.config/agents`                                                                                                      | login-gated agents manual exists                                                                                                                                                                              | not confirmed                                                                                                                                                                                                                                                                                                           | not confirmed                                                                                                                                                                        | not confirmed                                                                                                                                | Evidence limited                                                 |
| Cherry Studio  | macOS `~/Library/Application Support/CherryStudioDev`; Windows `%APPDATA%\CherryStudio`; Linux `~/.config/CherryStudio` | no stable global rule file modeled in current pass                                                                                                                                                            | not confirmed                                                                                                                                                                                                                                                                                                           | Skill files under `Data/Skills`; installed/global skill registry in `cherrystudio.sqlite.agent_global_skill`; per-agent enablement in `agent_skill`                                  | app data directory documented; skill registry confirmed from local Cherry Studio source and SQLite migrations                                | Officially documented (storage root) + source-inspected registry |

### PromptHub-Inferred Inventory

这些平台当前仍以 PromptHub 的平台根目录兼容目标为主，缺少足够公开官方资料支撑更细的本地资产建模。

| Platform     | ID             | Default Root (macOS)                                            | Current PromptHub Model                                                                                | Evidence                                                                  |
| ------------ | -------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Antigravity  | `antigravity`  | `~/.gemini/antigravity`                                         | root dir + `skills/` convention only                                                                   | PromptHub inferred                                                        |
| TRAE IDE     | `trae`         | `~/.trae`                                                       | TRAE IDE international client; root dir + `skills/` convention only                                    | Product confirmed; local path PromptHub inferred                          |
| TRAE Work    | `trae-work`    | `~/.trae-work`                                                  | TRAE Work international client; PromptHub assigns an isolated root + `skills/` convention              | Product confirmed; local path PromptHub inferred                          |
| TRAE IDE CN  | `trae-cn`      | `~/.trae-cn`                                                    | China-region TRAE IDE preset; visible built-in platform keeps the existing root convention             | Product confirmed; local path PromptHub inferred                          |
| TRAE Work CN | `trae-work-cn` | `~/.trae-work-cn`                                               | TRAE Work is a separate China-region client; PromptHub assigns an isolated root + `skills/` convention | Product confirmed; local path PromptHub inferred                          |
| Qoder        | `qoder`        | `~/.qoder`                                                      | root dir + `skills/` convention only                                                                   | PromptHub inferred                                                        |
| QoderWorker  | `qoderwork`    | `~/.qoderwork`                                                  | root dir + `skills/` convention only                                                                   | PromptHub inferred                                                        |
| Hermes Agent | `hermes`       | macOS/Linux `~/.hermes`; Windows Native `%LOCALAPPDATA%\hermes` | root dir + `skills/` convention only                                                                   | Windows Native root officially documented; skills path PromptHub inferred |
| CodeBuddy    | `codebuddy`    | `~/.codebuddy`                                                  | root dir + `skills/` convention only                                                                   | PromptHub inferred                                                        |

### Strong Candidates For Future Built-in Support

以下平台在本轮调研中具备比“仅知道产品名”更强的公开本地资产证据，适合作为内置 Agent / 预制平台候选或已升级平台记录。`Kilo Code`、`TRAE Work`、`TRAE Work CN` 已作为 PromptHub 的一等内置平台进入 `packages/shared/constants/platforms.ts`。

| Platform     | Why it stands out                                                                                                                      | Public local asset evidence                                                                                                                                                   | Suggested PromptHub modeling status                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Kilo Code    | 官方文档已明确 `.kilo/skills/`、`~/.kilo/skills/`、`kilo.jsonc`、`.kilo/rules/`、`AGENTS.md`、`.agents/skills/` 兼容目录 | `.kilo/skills/`, `~/.kilo/skills/`, `.kilo/rules/`, default global `~/.config/kilo/kilo.jsonc`, default project `kilo.jsonc`, compatible `.kilo/kilo.jsonc` custom config path, `AGENTS.md` | Built-in platform; MCP target supported                  |
| TRAE Work    | 国际站下载页和文档入口展示 TRAE Work，与 TRAE IDE 分开展示；本轮已作为独立内置 Agent 平台落入 `trae-work`                              | Product entry available via `trae.ai`; local skills path remains PromptHub inferred                                                                                           | Promoted to built-in platform with isolated default root |
| TRAE Work CN | 中国站和文档显示 TRAE Work 是独立客户端，不依赖 TRAE IDE；本轮已作为独立内置 Agent 平台落入 `trae-work-cn`                             | Product docs entry available via `docs.trae.cn`; local skills path remains PromptHub inferred                                                                                 | Promoted to built-in platform with isolated default root |

建模建议：

- `TRAE IDE` 是普通 IDE 产品，继续使用已有 `trae` 平台 id 和 `~/.trae` 根目录，避免破坏历史设置。
- `TRAE IDE CN` 继续使用已有 `trae-cn` 平台 id 和 `~/.trae-cn` 根目录，避免破坏历史设置和迁移逻辑。
- `TRAE Work` 是国际版新客户端，使用独立 `trae-work` 平台 id 和 `~/.trae-work` 默认根目录；公开资料确认产品存在，本地 skills 目录是 PromptHub 的保守分发约定。
- `TRAE Work CN` 是新客户端，使用独立 `trae-work-cn` 平台 id 和 `~/.trae-work-cn` 默认根目录；公开资料确认产品存在，本地 skills 目录是 PromptHub 的保守分发约定。
- `Kilo Code` 已作为独立 built-in platform 建模，不能与 `Kiro` 混用；MCP 使用 Kilo 自己的 `mcp` JSON/JSONC 配置结构。

## Platform Cards

### Claude Code

- Root: `~/.claude`
- Rules and context:
  - `~/.claude/CLAUDE.md`
  - project `CLAUDE.md` or `./.claude/CLAUDE.md`
  - local personal override `CLAUDE.local.md`
  - path-scoped rules in `.claude/rules/**/*.md`
  - can import `@AGENTS.md` for cross-agent instruction reuse
- Memory and state:
  - auto memory root: `~/.claude/projects/<project>/memory/`
  - `MEMORY.md` is the always-loaded index; topic files are lazy-loaded
  - loaded into each session with size limits for `MEMORY.md`, not for `CLAUDE.md`
- Reusable assets:
  - skills in `.claude/skills/<name>/SKILL.md`
  - subagent persistent memory is officially documented
- Evidence note:
  - Claude has the strongest official separation between rules (`CLAUDE.md`) and auto memory.
  - Current pass re-verified the memory directory, but did not separately re-verify a canonical transcript JSONL pathname.

### Codex CLI

- Root: `~/.codex` unless overridden by `CODEX_HOME`
- Rules and context:
  - global: `AGENTS.override.md` or `AGENTS.md`
  - project discovery walks from repo root to current directory
  - fallback instruction filenames configurable via `project_doc_fallback_filenames`
- Memory and history:
  - memories: `~/.codex/memories/`
  - Chronicle extension memories: `~/.codex/memories_extensions/chronicle/`
  - Chronicle temp captures: `$TMPDIR/chronicle/screen_recording/`
  - TUI log: `~/.codex/log/codex-tui.log`
  - optional session logs: `session-*.jsonl`
- Reusable assets:
  - skills under repo / user / admin / system discovery tiers via `.agents/skills/`
  - plugins are installable bundles with `.codex-plugin/plugin.json` metadata and can package skills, apps/connectors, MCP servers, commands, hooks, assets, and marketplace metadata
  - subagents and workflows are first-class documented concepts
- Config and profiles:
  - `~/.codex/config.toml`, `.codex/config.toml`, `/etc/codex/config.toml`
  - named profiles and enterprise `requirements.toml` documented

### Gemini CLI

- Root: `~/.gemini`
- Rules and context:
  - global context: `~/.gemini/GEMINI.md`
  - workspace and ancestor `GEMINI.md` files participate in hierarchical loading
  - `context.fileName` can explicitly add names like `AGENTS.md`, `CONTEXT.md`, `GEMINI.md`
- Memory and history:
  - session transcripts scanned from `~/.gemini/tmp/<project>/chats/`
  - `/resume`, `-r`, `/rewind`, and delete-session flows are officially documented
  - Auto Memory writes reviewable patches / skills into a project-local inbox before approval
- Reusable assets:
  - skills: `~/.gemini/skills/`, `.gemini/skills/`, plus `.agents/skills/` aliases
  - commands: `~/.gemini/commands/`, `.gemini/commands/`
  - model steering, subagents, checkpointing, and hooks are official features
- Config and settings:
  - user settings: `~/.gemini/settings.json`
  - workspace settings: `.gemini/settings.json`

### OpenCode

- Root: `~/.config/opencode`
- Rules and context:
  - global rules: `~/.config/opencode/AGENTS.md`
  - local rules: nearest `AGENTS.md`; Claude fallback `CLAUDE.md`
  - additional instruction files can be injected from `opencode.json`
- Reusable assets:
  - markdown agents: `~/.config/opencode/agents/`, `.opencode/agents/`
  - skills: `~/.config/opencode/skills/`, `.opencode/skills/`
  - commands: `~/.config/opencode/commands/`, `.opencode/commands/`
  - plugins / modes / tools / themes share the same plural-directory convention
- Config and runtime:
  - `~/.config/opencode/opencode.json`
  - `~/.config/opencode/tui.json`
  - project `opencode.json`
  - custom path / custom directory / managed config / MDM preferences all documented
- State handling:
  - snapshot system is documented and configurable, but current public docs pass does not name a stable on-disk conversation-history directory
- Plugin modeling note:
  - OpenCode's documented plugin surface is a JavaScript/TypeScript or npm hook-module runtime loaded from `.opencode/plugins/`, `~/.config/opencode/plugins/`, or `opencode.json` `plugin`.
  - It is not modeled as a first-version PromptHub Plugin bundle adapter because the public plugin contract is function/hook oriented rather than a multi-child inventory package.

### OpenClaw

- Root: `~/.openclaw`
- Workspace model:
  - default workspace: `~/.openclaw/workspace`
  - profile workspace: `~/.openclaw/workspace-<profile>` when `OPENCLAW_PROFILE` is set
  - sandbox workspaces: `~/.openclaw/sandboxes`
  - `~/.openclaw/` itself stores config, credentials, managed skills, and sessions rather than workspace memory files
- Rules and context:
  - workspace bootstrap files include `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`
  - optional session/startup files include `HEARTBEAT.md`, `BOOT.md`, `BOOTSTRAP.md`
  - `SOUL.md` is the official personality guide and is injected on normal sessions
- Memory and history:
  - curated long-term memory: `~/.openclaw/workspace/MEMORY.md`
  - daily notes: `~/.openclaw/workspace/memory/YYYY-MM-DD.md`
  - dreaming / review surface: `~/.openclaw/workspace/DREAMS.md`
  - session store: `~/.openclaw/agents/<agentId>/sessions/sessions.json`
  - transcripts: `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`
  - topic transcript variant: `<sessionId>-topic-<threadId>.jsonl`
  - gateway logs: `/tmp/openclaw/openclaw-YYYY-MM-DD.log`
- Reusable assets:
  - workspace skills: `~/.openclaw/workspace/skills/`
  - managed skills: `~/.openclaw/skills/`
  - optional Canvas UI files: `~/.openclaw/workspace/canvas/`
- Config and profiles:
  - primary config: `~/.openclaw/openclaw.json`
  - profile-specific default workspace selected via `OPENCLAW_PROFILE`
- Modeling note:
  - OpenClaw is no longer just a PromptHub-inferred root-directory target; current public docs are sufficient to model its workspace files, memory surfaces, session persistence, and logs as stable local assets.
  - PromptHub runtime still does not expose OpenClaw under the `Rules` global-file whitelist, because the current `Rules` UX models one canonical global file per platform rather than a multi-file workspace bootstrap surface.

### Cline

- Root: `~/.cline`
- Rules and context:
  - project-level `AGENTS.md`
  - `.clinerules/` workspace rules
  - global compatibility rules in `~/Documents/Cline/Rules`
  - project `.cline/` directory is part of the stable local config surface
- Memory and state:
  - session state under `~/.cline/data/sessions/`
  - additional persistent db state under `~/.cline/data/db/`
- Reusable assets:
  - global skills in `~/.cline/skills/`
  - project skills in `.cline/skills/`
  - global agents in `~/.cline/agents/`
  - project agents in `.cline/agents/`
  - plugins / hooks / workflows share the same root family
- Config and settings:
  - `~/.cline/data/settings/global-settings.json`
  - `~/.cline/data/settings/providers.json`
  - `~/.cline/data/settings/cline_mcp_settings.json`
- Modeling note:
  - PromptHub now exposes Cline as a built-in platform for root-directory-based Skill integration and asset preview.
  - Cline is not added to the current `Rules` global single-file whitelist because its public rule surface is directory-oriented and AGENTS-based rather than one canonical user-level markdown file.
  - Cline's documented plugin surface applies to Cline SDK / CLI / Kanban and uses `AgentPlugin` entrypoints for tools/hooks/commands. It is runtime-only for PromptHub Plugin planning, not a first-version bundle adapter for the VSCode / JetBrains extension runtime.

### Cursor

- Root convention in PromptHub: `~/.cursor`
- Officially confirmed assets in current pass:
  - `.cursor/rules/` for project rules
  - root and nested `AGENTS.md`
  - user rules and team rules exist as product concepts
- Not confirmed in current pass:
  - a canonical local global-rule file pathname
  - a local `skills/` directory or reusable command/workflow directory
  - local transcript / memory / checkpoint storage paths
- Modeling note:
  - Cursor is now strong enough for documentation-level support around rules, but still not ready for PromptHub runtime support beyond the current `AGENTS.md`-style workspace model without more public file-path evidence.
  - It is intentionally not listed in the current `Rules` global whitelist because this pass still does not confirm one stable local user-level canonical rule file equivalent to `CLAUDE.md` or `GEMINI.md`.

### Windsurf

- Root: `~/.codeium/windsurf`
- Rules and context:
  - global rules: `~/.codeium/windsurf/memories/global_rules.md`
  - workspace rules: `.windsurf/rules/*.md`
  - directory-scoped `AGENTS.md` is processed by the same rules engine
  - enterprise system rules supported in OS-specific locations
- Memory and history:
  - workspace memories stored locally in `~/.codeium/windsurf/memories/`
  - memories are workspace-scoped and not committed to the repo
- Reusable assets:
  - workspace skills: `.windsurf/skills/<name>/SKILL.md`
  - global skills: `~/.codeium/windsurf/skills/<name>/SKILL.md`
  - workspace workflows: `.windsurf/workflows/*.md`
  - global workflows: `~/.codeium/windsurf/global_workflows/*.md`
  - compatible skill discovery: `.agents/skills/`, `~/.agents/skills/`, optional `.claude/skills/`
- Modeling note:
  - Windsurf is now one of the clearest platforms for PromptHub to model because its rules, memories, skills, and workflows all expose stable local paths.

### Kiro

- Root: `~/.kiro`
- Steering assets:
  - workspace steering: `.kiro/steering/`
  - global steering: `~/.kiro/steering/`
  - foundational steering files: `product.md`, `tech.md`, `structure.md`
  - `AGENTS.md` accepted in workspace root or `~/.kiro/steering/`
- Skill assets:
  - workspace skills: `.kiro/skills/`
  - global skills: `~/.kiro/skills/`
  - skills can also be invoked from slash-command UI
- MCP config:
  - user/global: `~/.kiro/settings/mcp.json`
  - workspace/project: `.kiro/settings/mcp.json`
  - workspace MCP settings override user MCP settings
- Inclusion model:
  - steering supports `always`, `fileMatch`, `manual`, and `auto`
  - manual and auto steering files surface like commands, but Kiro does not present a separate dedicated local `commands/` directory in current docs
- Modeling note:
  - Kiro is documented well enough for asset-level modeling, but its steering-first directory model is not the same thing as a single canonical global rule file, so it is not part of the current `Rules` whitelist.

### Kilo Code MCP Status

- PromptHub tracks Kilo Code as a separate `kilo` Skill/Rules/MCP platform, not as an alias for Kiro.
- Kilo Code MCP config uses the root `mcp` key. Local servers use `type: "local"` with a combined `command` array and optional `environment`; remote servers use `type: "remote"` with `url` and optional `headers`.
- Global config: recommended `~/.config/kilo/kilo.jsonc`.
- Project config: recommended `<projectRoot>/kilo.jsonc`; compatible custom path `<projectRoot>/.kilo/kilo.jsonc`.
- PromptHub's built-in MCP UI exposes one default Kilo Code target per scope. Compatible JSONC/custom paths are supported as parsing/custom-path inputs, not as duplicate Agent MCP or Project MCP cards.
- Kilo JSONC config reads must tolerate comments and trailing commas, but PromptHub writes normalized JSON.

### Roo Code

- Root: `~/.roo`
- Rules and context:
  - global: `~/.roo/rules/`, `~/.roo/rules-{modeSlug}/`
  - workspace: `.roo/rules/`, `.roo/rules-{modeSlug}/`
  - fallback files: `.roorules`, `.roorules-{modeSlug}`
  - workspace root `AGENTS.md` or `AGENT.md`
- Checkpoints and state:
  - checkpoints are enabled by default
  - implemented via a shadow Git repository, task-scoped
  - restore modes distinguish file-only restore from file+task restore
- Reusable assets:
  - skills in `.roo/skills/`, `.roo/skills-{mode}/`, `~/.roo/skills/`, `~/.roo/skills-{mode}/`
  - cross-agent skill compatibility via `.agents/skills/` and `~/.agents/skills/`
  - slash commands in `.roo/commands/` and `~/.roo/commands/`
- Config note:
  - docs prominently expose VS Code settings, prompts tab, and mode configuration
  - `roo-cline.useAgentRules` controls AGENTS loading
- Modeling note:
  - Roo Code exposes a rich multi-entry rule surface, but PromptHub `Rules` currently does not collapse directory-based and mode-specific rule trees into one synthetic global file entry.

### GitHub Copilot

- Scope model:
  - no single user-level local platform root is documented in this pass for repository custom instructions
  - repository-level instruction assets remain the important durable rules/context contract
  - Copilot CLI and VS Code Agent Plugins define a separate plugin package mechanism, so PromptHub should treat Copilot as an Adapter target for Plugin distribution rather than an instruction-only target
- Official instruction assets:
  - `.github/copilot-instructions.md` for repository-wide instructions
  - `.github/instructions/*.instructions.md` for path-specific instructions with `applyTo`
  - `AGENTS.md` files anywhere in the repository for agent instructions
  - root `CLAUDE.md` or `GEMINI.md` as single-file alternatives
- Official plugin assets:
  - `plugin.json` at the plugin root for Copilot CLI
  - VS Code Agent Plugins auto-detect `plugin.json` in `.plugin/plugin.json`, the plugin root, `.github/plugin/plugin.json`, and `.claude-plugin/plugin.json`
  - component path fields include `agents`, `skills`, `commands`, `hooks`, `mcpServers`, and `lspServers`
  - `copilot plugin install`, `list`, `update`, `enable`, `disable`, and marketplace commands manage Copilot CLI plugins
  - VS Code Agent Plugins can discover and install plugins from Git-backed marketplaces and local plugin locations
- Modeling note:
  - Copilot remains excluded from the current `Rules` global whitelist because its durable instruction contract is repository-scoped, not a single user-level local global rule file.
  - Copilot should be enabled in the future Plugin Targets UI as an Adapter target when PromptHub can generate a Copilot-format plugin package.
  - Do not describe Copilot as natively supporting Codex `.codex-plugin`; describe PromptHub as adapting a Plugin inventory into Copilot / VS Code Agent Plugin format.

### Amp

- PromptHub root convention: `~/.config/agents`
- Public evidence state:
  - an agents manual entry exists
  - the detailed content remains login-gated in the current pass
- Modeling note:
  - keep Amp in the platform list, but do not assert rules / skills / workflow subpaths as official facts until public docs are available.

### TRAE IDE / TRAE Work

- PromptHub models international TRAE IDE as `trae`, international TRAE Work as `trae-work`, China-region TRAE IDE as `trae-cn`, and China-region TRAE Work as `trae-work-cn`
- Public product evidence confirms TRAE IDE and TRAE Work are separate products on the international `trae.ai` surface and the China-region `trae.cn` / `docs.trae.cn` surface.
- Current PromptHub implementation evidence:
  - localized placeholders already use `~/.trae-cn`
  - unit tests already verify custom platform root resolution against `~/.trae-cn`
  - TRAE Work uses an isolated `~/.trae-work` root to avoid mutating existing TRAE IDE configuration
  - TRAE Work CN uses an isolated `~/.trae-work-cn` root to avoid mutating existing TRAE IDE CN configuration
- Modeling note:
  - until official local skills/rules path docs are captured, treat TRAE Work variants as product-confirmed Agent clients with PromptHub-inferred `skills/` conventions.

## Evidence Links

- Claude Code memory and CLAUDE.md: `https://docs.anthropic.com/en/docs/claude-code/memory`
- Codex AGENTS.md: `https://developers.openai.com/codex/guides/agents-md`
- Codex config basics: `https://developers.openai.com/codex/config-basic`
- Codex memories: `https://developers.openai.com/codex/memories`
- Codex Chronicle: `https://developers.openai.com/codex/memories/chronicle`
- Codex skills: `https://developers.openai.com/codex/skills`
- Gemini CLI GEMINI.md: `https://www.geminicli.com/docs/cli/gemini-md`
- Gemini CLI settings: `https://www.geminicli.com/docs/cli/settings`
- Gemini CLI skills: `https://www.geminicli.com/docs/cli/skills/`
- Gemini CLI auto memory: `https://www.geminicli.com/docs/cli/auto-memory/`
- Gemini CLI session management: `https://www.geminicli.com/docs/cli/tutorials/session-management/`
- Gemini CLI custom commands: `https://www.geminicli.com/docs/cli/custom-commands/`
- OpenCode rules: `https://opencode.ai/docs/rules`
- OpenCode agents: `https://opencode.ai/docs/agents`
- OpenCode config: `https://opencode.ai/docs/config`
- OpenCode skills: `https://opencode.ai/docs/skills`
- OpenClaw SOUL.md: `https://docs.openclaw.ai/concepts/soul`
- OpenClaw workspace: `https://docs.openclaw.ai/concepts/agent-workspace.md`
- OpenClaw memory: `https://docs.openclaw.ai/concepts/memory`
- OpenClaw sessions: `https://docs.openclaw.ai/reference/session-management-compaction`
- OpenClaw logging: `https://docs.openclaw.ai/gateway/logging`
- Cursor rules: `https://cursor.com/docs/context/rules`
- Windsurf memories and rules: `https://docs.windsurf.com/windsurf/cascade/memories`
- Windsurf AGENTS.md: `https://docs.windsurf.com/windsurf/cascade/agents-md`
- Windsurf skills: `https://docs.windsurf.com/windsurf/cascade/skills`
- Windsurf workflows: `https://docs.windsurf.com/windsurf/cascade/workflows`
- Kiro steering: `https://kiro.dev/docs/steering/`
- Kiro agent skills: `https://kiro.dev/docs/skills/`
- Kiro MCP: `https://kiro.dev/docs/mcp/`
- Roo Code custom instructions: `https://docs.roocode.com/features/custom-instructions`
- Roo Code skills: `https://docs.roocode.com/features/skills`
- Roo Code slash commands: `https://docs.roocode.com/features/slash-commands`
- Roo Code checkpoints: `https://docs.roocode.com/features/checkpoints`
- GitHub Copilot repository custom instructions: `https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot`
- GitHub Copilot CLI plugin reference: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference`
- VS Code Agent Plugins: `https://code.visualstudio.com/docs/agent-customization/agent-plugins`
- TRAE Work CN docs entry: `https://docs.trae.cn`
- SkillManager README supported agents snapshot: `https://raw.githubusercontent.com/eatmoreduck/SkillManager/master/README.md`
- Cline config layout: `https://docs.cline.bot/getting-started/config`
- Cline skills: `https://docs.cline.bot/customization/skills.md`
- Cline rules: `https://docs.cline.bot/customization/cline-rules`
- Kilo Code custom rules: `https://kilo.ai/docs/customize/custom-rules`
- Kilo Code skills: `https://kilo.ai/docs/customize/skills`
- Kilo Code agents.md: `https://kilo.ai/docs/customize/agents-md`
- Kilo Code MCP in CLI: `https://kilo.ai/docs/automate/mcp/using-in-cli`
- Kilo Code MCP in Kilo Code: `https://kilo.ai/docs/automate/mcp/using-in-kilo-code`
- Cherry Studio storage locations: `https://docs.cherry-ai.com/advanced-basic/data-storage-location`
- Cherry Studio local source inspected for skill registry behavior:
  - `/Users/lingxiaotian/Programs/public/cherry-studio/src/main/services/agents/skills/SkillService.ts`
  - `/Users/lingxiaotian/Programs/public/cherry-studio/src/main/data/db/schemas/agentGlobalSkill.ts`
  - `/Users/lingxiaotian/Programs/public/cherry-studio/src/main/data/db/schemas/agentSkill.ts`
  - `/Users/lingxiaotian/Programs/public/cherry-studio/migrations/sqlite-drizzle/0000_loud_sugar_man.sql`

## Canonical Sources

- 平台元数据源码：`packages/shared/constants/platforms.ts`
- Rules 注册表源码：`packages/shared/constants/rules.ts`
- 平台路径派生逻辑：`apps/desktop/src/main/services/skill-installer-utils.ts`
