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

2026-09-28：Agent 历史根回退、配置别名与跨产品降级按
[当前契约要求](../../changes/active/agent-management-workbench/specs/agent-management/spec.md#fr-agent-138-one-current-contract-per-agent-capability) 收敛，实施待完成。
下文上游产品自己的格式/作用域优先级属于参考证据，不自动授权 PromptHub 实现降级。
Antigravity 桌面与 CLI 的全局 Skill 目录分别为 `.gemini/config/skills` 和
`.gemini/antigravity-cli/skills`；旧的共享根描述已被
[官方 Skills 文档](https://antigravity.google/docs/skills)（本日核对）及 FR-AGENT-021 修正。

- 本文档记录的是长期稳定的平台资产清单，不是单次变更 proposal。
- 当 `packages/shared/constants/platforms.ts` 中的平台根目录、默认规则文件或配置文件发生稳定变化时，应同步更新本文档。
- 当 `packages/shared/constants/rules.ts` 中的全局规则支持集合发生稳定变化时，应同步更新本文档中的 `Rules Support Snapshot`。
- 对没有公开官方文档、正文不可抓取、或当前只能通过产品 UI/登录后页面确认的平台，必须明确标注为 `PromptHub inferred` 或 `Evidence limited`。
- 对于“功能存在但本轮未拿到明确本地路径”的资产，可以记录为“feature documented, local path not confirmed in current pass”，不要伪装成已确认路径。
- 内置平台 id 必须唯一；平台图标不得用相同的通用 fallback 冒充不同品牌。能够确认来源时，优先使用官方 mark 或 favicon，并在本节记录来源。
- `packages/shared/constants/agent-platform-capabilities.ts` 是平台能力状态的 machine-readable 投影：深度 adapter 必须逐个平台显式声明，路径/资产/launch 能力只能从 `packages/shared/constants/platforms.ts` 派生，不得另建 id allowlist 或复制路径事实。
- 平台能力状态只允许 `supported`、`partial`、`planned`、`unsupported`，并必须携带证据代码。已声明路径只证明可定位资产，不能单独证明配置协议、会话格式、额度端点或维护命令已经受支持。
- 自定义 Agent 可以从自身根目录和派生路径获得路径级能力，但不得因为目录名相似而继承内置 Agent 的 Provider、Session、Usage 或 Appearance adapter。

## Icon Provenance Snapshot

当前内置 Agent 列表使用独立、可追溯的品牌图标：

| Platform         | Asset                                                                          | Source                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Kimi Code        | `apps/desktop/src/renderer/assets/platforms/kimi.png`                          | Official Kimi site favicon: `https://www.kimi.com/favicon.ico`                                                    |
| Augment          | `apps/desktop/src/renderer/assets/platforms/augment.svg`                       | Official Augment favicon: `https://www.augmentcode.com/favicon.svg`                                               |
| Reasonix         | `apps/desktop/src/renderer/assets/platforms/reasonix.svg`                      | Official Reasonix repository mark                                                                                 |
| Pi               | `apps/desktop/src/renderer/assets/platforms/pi.svg`                            | Official Pi badge: `https://pi.dev/press-kit` (`https://pi.dev/favicon.svg`)                                      |
| Oh My Pi         | `apps/desktop/src/renderer/assets/platforms/oh-my-pi.svg`                      | Official upstream mark: `https://github.com/can1357/oh-my-pi/blob/main/assets/icon.svg`                           |
| CoPaw            | `apps/desktop/src/renderer/assets/platforms/copaw.png`                         | AgentScope/QwenPaw public mark: `https://github.com/agentscope-ai/QwenPaw/blob/main/website/public/paw.png`       |
| AutoClaw         | `apps/desktop/src/renderer/assets/platforms/autoclaw.png`                      | Official AutoClaw mark: `https://autoclaw.zhipuai.cn/` (`https://resource.zhipuai.cn/landing-page/og-image.png`)  |
| NanoClaw         | `apps/desktop/src/renderer/assets/platforms/nanoclaw.png`                      | Official NanoClaw repository asset: `https://github.com/nanocoai/nanoclaw/blob/main/assets/nanoclaw-icon.png`     |
| DeepSeek Harness | `apps/desktop/src/renderer/assets/platforms/deepseek-harness-{light,dark}.svg` | Official Harness favicon: `https://github.com/deepseek-ai/deepseek-harness/blob/main/apps/web/public/favicon.svg` |

Kimi 与 Auggie 不共享 Sparkles/Sparkle 通用图标；即使品牌资源加载失败，二者也使用不同的命名 fallback。内置平台注册表对 id 做唯一性回归校验，避免把已有平台再次注册。

## Product Modeling Note

- 对 PromptHub 而言，Agent 平台的首要配置对象应是“平台根目录”，而不是单独的 `skills` 扫描路径。
- `skills / plugins / rules / commands / agents / workflows / config` 等都属于从根目录派生出的本地资产表面。
- 因此设置页和后续 Agent 管理页应优先暴露根目录管理与派生资产预览；仅保留零散扫描路径会把产品错误收窄成 Skill 导入工具。
- 对 PromptHub 而言，Plugin 是比 Skill 更高一级的分发包；它可以包含 Skill、MCP server、App/connector、commands、hooks、assets 等子资产。稳定概念映射见 `spec/knowledge/reference/codex-extension-surfaces.md`。
- Agent 工作台的 family 分组是 PromptHub 的展示分类，不是上游兼容性声明；`openclaw`、`copaw`、`autoclaw`、`nanoclaw`、`qclaw` 和 `hermes` 明确归入 Claw（龙虾）组，但各自仍保留独立的平台 id、根目录、能力适配器和原生文件合同。
- DeepSeek Harness 使用独立的 `plugin-harness` 资产模型。它的能力载体是 `$DSH_HOME/profiles/<name>/package.json` 中的依赖和有序 `dsh.profile.bundles`，不得伪装成独立的 Skill、MCP 或 Rules 目录。PromptHub 只读取有界、脱敏的包元数据；安装、更新和移除必须通过官方 `dsh plugin --profile <name> ...` 命令完成。

## User Config Files Boundary

- Agent Config Files 管理的是 canonical registry 或用户覆盖解析出的用户级 Agent 根目录，不扫描项目级配置空间。
- 主进程在该根目录内有界发现现有文本配置文件；平台声明的相对路径仍用于默认选中和创建缺失的已知配置文件。读写 IPC 只接受平台声明路径或同一有界发现清单内的现有文件，调用方不能用任意相对路径绕过清单。
- Config Files 的 inventory、选中内容、缓存和异步响应按 Agent source identity 隔离；用户切换 Agent 前必须确认是否丢弃未保存修改。
- `auth`、credential、token、secret 文件以及 session、history、log、cache、database、backup、generated content、Skill 和 Plugin 目录不得进入列表或读写 IPC。
- 文件内容跨 IPC 前必须遮罩嵌入的敏感值。直接编辑只允许保留遮罩占位符，不允许通过通用配置编辑器新增、删除或修改凭据。
- 保存必须校验 expected revision 与 JSON/JSONC/TOML/YAML 格式，并使用加密设备本地备份、原子替换、重读验证和失败回滚。结构性新建、重命名和删除不属于当前能力。

## Internal CLI Probe Snapshot

`packages/shared/constants/platforms.ts` is the only executable-descriptor
source of truth. PromptHub retains an internal read-only version probe
for the following evidence-backed built-ins:

| Platform         | Executable | Version arguments | Capability |
| ---------------- | ---------- | ----------------- | ---------- |
| Claude Code      | `claude`   | `--version`       | `partial`  |
| Codex            | `codex`    | `--version`       | `partial`  |
| Kimi Code        | `kimi`     | `--version`       | `partial`  |
| Qwen Code        | `qwen`     | `--version`       | `partial`  |
| OpenCode         | `opencode` | `--version`       | `partial`  |
| Oh My Pi         | `omp`      | `--version`       | `partial`  |
| OpenClaw         | `openclaw` | `--version`       | `partial`  |
| DeepSeek Harness | `dsh`      | `--version`       | `partial`  |

The Electron main process resolves only those registry-owned executable names
through a bounded PATH search and executes fixed argument arrays without a
shell. The general Agent workspace does not expose a CLI Diagnostics menu or
modal, and renderer preload/IPC has no generic diagnostic or update operation.
Internal results contain only a canonical path, one bounded version line,
coarse install-source classification, timestamp and stable error code. Raw output,
environment values and process errors do not leave the internal service boundary. Platforms without a
verified descriptor remain `planned`, and custom Agents do not accept
renderer-provided executable paths. The bounded lifecycle service remains
main-process infrastructure, but it is not registered as a user-facing action.
Any future install or update UI requires a separate platform-specific verified
design, explicit confirmation and rollback behavior.

## MCP Config Support Snapshot

PromptHub MCP 管理第一版建模为“配置库 + 目标文件投影”，不运行 MCP 网关、代理或统一 endpoint。

| Target      | PromptHub Target ID | Default Scope Paths                                                          | Config Shape                            | Evidence / Notes                                                             |
| ----------- | ------------------- | ---------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| Codex       | `codex`             | `~/.codex/config.toml`; project `.codex/config.toml`                         | TOML `[mcp_servers.<name>]`             | Officially documented                                                        |
| Claude Code | `claude`            | `~/.claude.json`; project `.mcp.json`                                        | JSON `mcpServers`                       | Officially documented; scopes include user/project                           |
| Cursor      | `cursor`            | `~/.cursor/mcp.json`; project `.cursor/mcp.json`                             | JSON `mcpServers`                       | Officially documented                                                        |
| VS Code     | `vscode`            | project `.vscode/mcp.json`; user profile path varies by VS Code UI           | JSON `servers`                          | Officially documented                                                        |
| Cline       | `cline`             | `~/.cline/data/settings/cline_mcp_settings.json`                             | JSON `mcpServers`-style settings        | Officially documented                                                        |
| WorkBuddy   | `workbuddy`         | `~/.workbuddy/mcp.json`; project `.workbuddy/mcp.json`                       | JSON `mcpServers`                       | Officially documented                                                        |
| CodeBuddy   | `codebuddy`         | `~/.codebuddy/.mcp.json`; project `.mcp.json`                                | JSON / JSONC `mcpServers`               | Officially documented                                                        |
| ZCode Agent | `zcode`             | `~/.zcode/cli/config.json`; project `.zcode/config.json`                     | JSON `mcp.servers`                      | Officially documented                                                        |
| Oh My Pi    | `oh-my-pi`          | `~/.omp/agent/mcp.json`; project `.omp/mcp.json`                             | JSON `mcpServers`                       | Officially documented; native Oh My Pi target                                |
| Pi          | `pi`                | `~/.pi/agent/mcp.json`; project `.pi/mcp.json`; adapter shared files         | JSON `mcpServers`                       | Compatible writer; runtime/adapter remains Pi-owned                          |
| Grok Build  | `grok`              | `~/.grok/config.toml`; project `.grok/config.toml`                           | TOML `[mcp_servers.<name>]` + `headers` | Officially documented                                                        |
| OpenClaw    | `openclaw`          | `~/.openclaw/openclaw.json`                                                  | JSON `mcp.servers`                      | Officially documented; native OAuth remains Agent-owned                      |
| Qoder       | `qoder`             | `~/.qoder/settings.json`; project `.qoder/settings.local.json` / `.mcp.json` | JSON `mcpServers`                       | Officially documented; stdio/SSE/HTTP projection                             |
| Antigravity | `antigravity`       | `~/.gemini/config/mcp_config.json`; project `.agents/mcp_config.json`        | JSON `mcpServers`; remote `serverUrl`   | Officially documented                                                        |
| Reasonix    | `reasonix`          | project `.mcp.json`                                                          | JSON `mcpServers`                       | Project compatibility only; modern global `[[plugins]]` remains native-owned |
| Custom JSON | `custom-json`       | user-selected file path                                                      | JSON `mcpServers`                       | PromptHub generic projection                                                 |
| Custom TOML | `custom-toml`       | user-selected file path                                                      | Codex-compatible managed TOML block     | PromptHub generic projection                                                 |

Stable product rule:

- PromptHub's internal MCP source of truth is a normalized local library, not any one agent config file.
- Applying MCP config must preserve unrelated target config and create a backup before overwriting an existing file.
- PromptHub records a per-target projected-entry digest when an MCP server is applied. Later "sync distributed targets" compares baseline, current PromptHub projection, and target entry before writing.
- Target-side MCP sync digests are computed from the raw server entry in the target config file, not by round-tripping through PromptHub's import model; extra fields on a target entry therefore count as external modifications.
- One-click MCP target sync may update safe stale targets, but must skip disabled platforms, disabled MCP servers, parse-error targets, missing targets/entries, external edits, and conflicts unless an explicit override flow is used.
- MCP target sync results must be structural only: target kind, path, status, server name, and backup path are allowed; full config content, env values, headers, and token-bearing arguments must not be returned to renderer sync summaries.
- Codex/custom TOML one-server sync must not delete other PromptHub-managed servers from the same managed block; either merge per server or rewrite the complete still-managed enabled set.
- When Codex/custom TOML uses whole managed-block rewrite, all still-managed enabled sibling servers in that block must be checked first; an unsafe sibling external edit or conflict blocks the one-server sync unless an explicit override is used.
- MCP entries are configuration records, not Skill directory packages; they do not participate in Skill versioning, safety scanning, or rating flows.
- Roo Code remains documented below as an external Agent asset, but PromptHub no longer exposes it as a built-in MCP target preset.
- Qwen Code uses user/project `settings.json` `mcpServers`; PromptHub now exposes distinct global and project `qwen` MCP targets through structured JSON merge. Secret-bearing environment values remain main-process-only, and the remaining `TEST-AGENT-036` gate covers broader UI/E2E behavior rather than the existence of the target.
- Oh My Pi and Pi remain separate targets. Pi uses `mcp`/`mcpServers` JSON
  projections for the native `<root>/mcp.json` candidate and the compatible
  adapter candidates `~/.config/mcp/mcp.json`, `~/.agents/mcp.json`, and
  `~/.agents/mcp/mcp.json`; project targets are `<project>/.mcp.json` and
  `<project>/.pi/mcp.json`. PromptHub exposes each candidate independently so
  users can choose the file that their installed adapter/runtime actually
  reads. It writes compatible configuration; it does not embed or execute
  `pi-mcp-adapter`.
- The adapter's documented precedence is low to high: `~/.config/mcp/mcp.json`,
  `~/.agents/mcp.json`, `~/.agents/mcp/mcp.json`, `<Pi agent dir>/mcp.json`,
  `.mcp.json`, then `.pi/mcp.json`. PromptHub keeps those layers as separate
  selectable targets rather than merging them in the library or owning Pi's
  effective-runtime resolution.
- OpenClaw projection owns only supported fields under `mcp.servers`, preserves
  unrelated root, `mcp`, OAuth, filter and timeout fields, and writes explicit
  `transport: "streamable-http"` only for Streamable HTTP. Qoder WebSocket-only
  declarations remain native-owned because PromptHub's normalized transport
  contract currently covers stdio, SSE and Streamable HTTP. Grok uses `headers`
  rather than Codex's `http_headers` while sharing the bounded managed TOML
  block and conflict safeguards.
- Antigravity projection writes its required `serverUrl` key and keeps native
  OAuth, disabled-tool and authentication-provider fields Agent-owned. Reasonix
  project `.mcp.json` uses the documented field-for-field JSON compatibility;
  PromptHub does not project the modern global `[[plugins]]` TOML array through
  a Codex-style table writer.
- My MCP detail, distribution counts, quick deploy, batch deploy, and target
  dialogs use one merged global/project target projection. Agent and Project
  workspaces remain separately navigable, while registered project files can
  be selected directly from My MCP.
- MCP environment references are additive `envRefs`/`headerRefs` maps. Legacy
  `${VAR}`, `${env:VAR}`, `$VAR`, and `$env:VAR` values are normalized without resolving
  them. Cursor, VS Code, and Windsurf receive `${env:VAR}`; Claude, Codex, Pi,
  Oh My Pi, and other supported targets receive `${VAR}`. `${VAR:-default}` is
  rejected for targets that do not document default-value interpolation.
- Health checks inspect only whether a referenced variable is present in the
  current PromptHub process environment; missing required references produce a
  warning without exposing the value. An explicit `.env` import converts a
  selected reference to a local literal value.
- Direct values remain local compatibility data, while reference fields are
  portable non-secret templates. UI previews, apply/remove results, renderer
  library snapshots, backup/export payloads, and CLI workspace bundles redact
  direct environment/header values. Restore merges redaction markers with the
  current local value and never writes the marker as a credential.

## Evidence Levels

- `Officially documented`: 官方文档明确写出路径、文件名、目录结构或优先级。
- `Officially documented (partial)`: 官方文档明确了一部分，但另一些本地路径或兼容行为仍未在当前公开资料中写明。
- `PromptHub inferred`: 当前来自 PromptHub 平台常量、兼容目标或社区约定，缺少足够公开官方证据。
- `Evidence limited`: 官方入口存在，但正文需要登录、无法稳定抓取，或公开信息不足以确认本地资产。

## Rules Support Snapshot

当前 `Rules` 模块已稳定支持以下全局规则文件：

- Claude Code: `~/.claude/CLAUDE.md`
- Codex CLI: `~/.codex/AGENTS.md`
- ZCode Agent: `~/.zcode/AGENTS.md`
- Grok Build: `~/.grok/AGENTS.md`
- Kimi Code: `~/.kimi-code/AGENTS.md`
- Gemini CLI: `~/.gemini/GEMINI.md`
- OpenCode: `~/.config/opencode/AGENTS.md`
- GitHub Copilot CLI: `~/.copilot/copilot-instructions.md` or the resolved
  `<COPILOT_HOME>/copilot-instructions.md`
- Windsurf: `~/.codeium/windsurf/memories/global_rules.md`
- Kiro: `~/.kiro/steering/AGENTS.md` or the resolved
  `<KIRO_HOME>/steering/AGENTS.md`
- Cline CLI: `~/.cline/data/settings/rules/AGENTS.md`
- Augment: `~/.augment/user-guidelines.md`
- OpenClaw: `~/.openclaw/workspace/SOUL.md`
- Qwen Code: `~/.qwen/QWEN.md` or the resolved `<QWEN_HOME>/QWEN.md`
- Oh My Pi: `~/.omp/agent/RULES.md` or the resolved
  `<PI_CODING_AGENT_DIR>/RULES.md`
- Hermes Agent: `~/.hermes/AGENTS.md`
- CodeBuddy: `~/.codebuddy/CODEBUDDY.md`
- QClaw: PromptHub compatibility path `~/.qclaw/workspace/SOUL.md`
- Amp: `~/.config/amp/AGENTS.md`
- Kilo Code: `~/.kilo/rules/global.md`

补充说明：

- Agent 工作台的 `Rules` 页按解析后的完整路径选择上述单一全局规则文件，
  并直接复用独立 Rules 模块的草稿、保存、快照、冲突和 AI 改写工作流；
  不建立第二份规则数据或写入通道。自定义 Agent 只有显式配置
  `rulesRelativePath` 后才进入同一工作流。
- `OpenClaw` 已进入 Rules 白名单，但只暴露 workspace 内的 canonical 单文件 `SOUL.md`；其余 workspace bootstrap / memory 文件仍不按多文件模型完整管理。
- `QClaw` 复用平台注册表中已有的 OpenClaw 兼容
  `workspace/SOUL.md` 候选，并以独立 `qclaw` 身份进入 Rules 工作区；
  这是 PromptHub 兼容路径，不代表 QClaw 已公开独立的本地规则协议。
- `GitHub Copilot CLI` 已进入 Rules 白名单，但只暴露用户根目录下的
  `copilot-instructions.md`；仓库级 `.github/instructions/` 多文件规则仍由
  Copilot 和项目上下文管理。
- `Kiro` 和 `Cline CLI` 已进入 Rules 白名单，但分别只暴露
  `steering/AGENTS.md` 与 CLI rules 目录中的 `AGENTS.md`；同目录 sibling
  files 仍由原平台管理。`Augment` 只暴露官方用户指南入口
  `user-guidelines.md`。
- `Cursor` 不伪造用户级规则文件：官方 User Rules 仍由 Cursor Settings
  管理。Agent Rules 通过已登记项目显式管理
  `<project>/.cursor/rules/prompthub.mdc`，可与同项目 `AGENTS.md` 独立并存。
  `Qoder` 不伪造用户级规则文件，但通过官方兼容入口复用已登记项目根
  `AGENTS.md`。`Roo Code` 当前仍未进入 Rules 运行时全局规则白名单。
- `Reasonix` 不进入当前白名单：它使用项目层级或记忆文件合并。Cherry Studio 与 TRAE 系列也没有已验证的用户级规则文件入口。
- `Qwen Code` 已进入全局 Rules 运行时白名单，使用解析后的 `<QWEN_HOME>/QWEN.md`。项目 `QWEN.md` 与个人覆盖 `.qwen/QWEN.local.md` 的专用 scope UI 仍属于后续门禁，当前不得把 auto-memory 当作 Rule 导入。
- 这些平台未进入白名单的主要原因是缺少已确认的用户级本地文件入口，或其协议只提供 repository-scoped 文件；PromptHub 不为这些平台发明不会被读取的全局文件。

项目规则当前稳定支持：

- 当前项目：`<repo>/AGENTS.md`
- 用户手动添加目录：`<selected-project>/AGENTS.md`
- Cursor 项目：`<selected-project>/.cursor/rules/prompthub.mdc`
- Qoder 项目兼容：`<selected-project>/AGENTS.md`

## Special Filenames

本节只记录“文件名本身就是平台协议”的资产。目录型协议、规则目录、skills 目录、workflow 目录见后续矩阵与平台档案卡。

| Filename / Pattern                       | Official Platforms                                                                                     | PromptHub Interpretation                       | Evidence              | Notes                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                              | Codex CLI, Grok Build, OpenCode, Cursor, Windsurf, Roo Code, Kiro, GitHub Copilot, Kimi Code, Reasonix | 当前最重要的跨平台项目规则 canonical 文件      | Officially documented | Current Kimi Code keeps a user instruction file under `~/.kimi-code/AGENTS.md` and is in the Rules runtime whitelist; Reasonix reads `AGENTS.md` as project memory alongside `REASONIX.md`. |
| `CLAUDE.md`                              | Claude Code                                                                                            | Claude 原生项目 / 用户 / managed 指令文件      | Officially documented | OpenCode 将其作为兼容 fallback；GitHub Copilot 允许仓库根使用单个 `CLAUDE.md` 作为 agent instructions。                                                                                     |
| `GEMINI.md`                              | Gemini CLI                                                                                             | Gemini 原生上下文文件                          | Officially documented | GitHub Copilot 允许仓库根使用单个 `GEMINI.md` 作为 agent instructions。                                                                                                                     |
| `QWEN.md`                                | Qwen Code                                                                                              | Qwen Code 全局或项目指令文件                   | Officially documented | 全局文件位于 `~/.qwen/QWEN.md`；共享项目文件位于仓库根；个人项目覆盖使用 `.qwen/QWEN.local.md`，不得与 auto-memory 混合。                                                                   |
| `CODEBUDDY.md`                           | CodeBuddy Code                                                                                         | CodeBuddy memory / instructions file           | Officially documented | 用户级位于 `~/.codebuddy/CODEBUDDY.md`，项目级位于仓库根 `CODEBUDDY.md`。                                                                                                                   |
| `.github/copilot-instructions.md`        | GitHub Copilot                                                                                         | Copilot repository-wide custom instructions    | Officially documented | 作用于整个仓库，不等同于 `AGENTS.md` 的就近目录覆盖模型。                                                                                                                                   |
| `.github/instructions/*.instructions.md` | GitHub Copilot                                                                                         | Copilot path-specific custom instructions      | Officially documented | 通过 frontmatter `applyTo` 绑定路径。                                                                                                                                                       |
| `copilot-instructions.md`                | GitHub Copilot CLI                                                                                     | Copilot CLI user-wide custom instructions      | Officially documented | 位于解析后的 `<COPILOT_HOME>/copilot-instructions.md`；不替代仓库级 instructions。                                                                                                          |
| `global_rules.md`                        | Windsurf                                                                                               | Windsurf 全局规则单文件                        | Officially documented | 规范路径为 `~/.codeium/windsurf/memories/global_rules.md`。                                                                                                                                 |
| `.roorules`                              | Roo Code                                                                                               | Roo workspace generic fallback rule file       | Officially documented | 当 `.roo/rules/` 不存在或为空时才回退到该单文件。                                                                                                                                           |
| `.roorules-{mode}`                       | Roo Code                                                                                               | Roo mode-specific fallback rule file           | Officially documented | 当 `.roo/rules-{modeSlug}/` 不存在或为空时使用。                                                                                                                                            |
| `AGENT.md`                               | Roo Code                                                                                               | `AGENTS.md` 的 fallback 兼容名                 | Officially documented | 仅在 workspace root，且 `AGENTS.md` 不存在时回退。                                                                                                                                          |
| `SOUL.md`                                | OpenClaw                                                                                               | OpenClaw workspace persona / tone file         | Officially documented | OpenClaw 官方文档确认使用小写 `SOUL.md`，并在 normal sessions 注入。                                                                                                                        |
| `SOUL.MD`                                | none confirmed                                                                                         | 不作为稳定官方兼容文件名建模                   | Evidence limited      | 当前公开资料只确认 `SOUL.md`，未确认全大写 `SOUL.MD`。                                                                                                                                      |
| `REASONIX.md`                            | Reasonix                                                                                               | Reasonix project memory / instruction document | Officially documented | Current main-v2 guide documents `REASONIX.md` / `AGENTS.md`; PromptHub keeps this repository-scoped and does not add a global Rules card.                                                   |
| `.cursorrules`                           | none confirmed in current pass                                                                         | 不作为稳定官方资产建模                         | Evidence limited      | Cursor 当前官方主推 `.cursor/rules/` 与 `AGENTS.md`。                                                                                                                                       |
| `.windsurfrules`                         | none confirmed in current pass                                                                         | 不作为稳定官方资产建模                         | Evidence limited      | Windsurf 当前官方主推 `global_rules.md`、`.windsurf/rules/*.md` 与 `AGENTS.md`。                                                                                                            |

## Platform Overview

### Documented Platforms

| Platform                              | Default Root / Config Dir                                                                                                            | Rules / Context Surface                                                                                                                                                                                       | Memory / History / Checkpoints                                                                                                                                                                                                                                                                                                 | Reusable Assets                                                                                                                                                                                                                                                   | Config / Profiles                                                                                                                                                                                                         | Evidence                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Claude Code                           | `~/.claude`                                                                                                                          | `~/.claude/CLAUDE.md`, project `CLAUDE.md`, `./.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/**/*.md`                                                                                                 | Per-project auto memory in `~/.claude/projects/<project>/memory/` with `MEMORY.md` entrypoint                                                                                                                                                                                                                                  | `.claude/skills/<name>/SKILL.md`; subagents documented; `@AGENTS.md` import supported                                                                                                                                                                             | user / local / managed settings documented; exact settings file set not re-listed here                                                                                                                                    | Officially documented                                           |
| Codex CLI                             | `~/.codex`                                                                                                                           | `AGENTS.override.md` or `AGENTS.md`; per-directory discovery; fallback names configurable in `config.toml`                                                                                                    | `~/.codex/memories/`; Chronicle in `~/.codex/memories_extensions/chronicle/`; temp captures in `$TMPDIR/chronicle/screen_recording/`; logs in `~/.codex/log/` and optional `session-*.jsonl`                                                                                                                                   | Skills in `.agents/skills/`, `~/.agents/skills/`, `/etc/codex/skills`; plugins are installable bundles with `.codex-plugin/plugin.json` metadata; subagents and workflows documented                                                                              | `~/.codex/config.toml`, `.codex/config.toml`, `/etc/codex/config.toml`, `--profile`, `CODEX_HOME`                                                                                                                         | Officially documented                                           |
| Kimi Code                             | Current `~/.kimi-code` or `KIMI_CODE_HOME`; legacy fallback `~/.kimi` or `KIMI_SHARE_DIR`                                            | Current user `~/.kimi-code/AGENTS.md`; project `AGENTS.md` discovery remains platform-owned                                                                                                                   | Current index `session_index.jsonl`; per-session `sessions/<workDirKey>/<sessionId>/state.json` and `agents/main/wire.jsonl`; PromptHub reads these lazily and never edits transcripts                                                                                                                                         | Current user `~/.kimi-code/skills/` and `plugins/`; legacy `~/.kimi/skills/` remains a compatibility fallback only                                                                                                                                                | Current `config.toml`, `tui.toml`, `mcp.json`; `credentials/`, logs and runtime update state are excluded from raw editing                                                                                                | Officially documented; legacy compatibility verified locally    |
| Grok Build                            | `~/.grok` or `$GROK_HOME`                                                                                                            | Global `~/.grok/AGENTS.md`; supported instruction filename family and `.grok/rules/` from repository root to cwd; Claude/Cursor compatibility is configurable                                                 | User sessions are stored below `~/.grok/sessions/`; experimental user/workspace memory is under `~/.grok/memory/`; both are runtime state, not PromptHub-managed assets                                                                                                                                                        | Skills in `~/.grok/skills/`, `.grok/skills/`, and `.agents/skills/`; plugins in `~/.grok/plugins/` and `.grok/plugins/`; agents in `~/.grok/agents/` and `.grok/agents/`; roles, personas, hooks, MCP servers, and marketplaces are separate Grok surfaces        | `~/.grok/config.toml`, `pager.toml`, `settings.json`, `lsp.json`, `sandbox.toml`; project `.grok/config.toml`, `.grok/hooks/`, `.grok/agents/`, `.grok/lsp.json`, `.grok/sandbox.toml`; ACP and headless modes documented | Officially documented                                           |
| Qwen Code                             | `~/.qwen` or `$QWEN_HOME`; runtime may move independently through `$QWEN_RUNTIME_DIR`                                                | Global `~/.qwen/QWEN.md`; shared project `QWEN.md`; personal project `.qwen/QWEN.local.md`                                                                                                                    | Runtime project chats and sidecars live below the runtime root; native `qwen sessions list --json` exposes bounded metadata. Auto-memory and `.qwen/team-memory/` remain Qwen-owned and are excluded from normal PromptHub backup/sync                                                                                         | User/project Skills in `skills/`; current official docs do not establish user-level `~/.agents/skills/` discovery; SubAgents in `agents/`; commands in `commands/`; Extensions in `extensions/<name>/qwen-extension.json`, whose child assets remain parent-owned | User `~/.qwen/settings.json`, project `.qwen/settings.json`, system defaults/overrides; MCP uses `mcpServers`; provider, `env`, headers, OAuth and credential fields require redaction                                    | Officially documented                                           |
| Reasonix                              | `~/.reasonix` (macOS/Linux); `%APPDATA%\reasonix` (Windows)                                                                          | Project `./reasonix.toml`; `REASONIX.md` / `AGENTS.md` memory documents; no synthetic global Rules entry                                                                                                      | Sessions, archives, memory, logs, and caches are under the Reasonix state/cache roots; these remain Reasonix-owned runtime data                                                                                                                                                                                                | Global Skills in `~/.reasonix/skills/`; global commands in `~/.reasonix/commands/`; Skills support `runAs = subagent`; MCP/plugins are TOML `[[plugins]]` entries rather than a Skill directory                                                                   | Global `config.toml`, `settings.json` hooks, `trust.json`; project `reasonix.toml`; `.mcp.json` may be merged into plugin configuration                                                                                   | Officially documented (current main-v2)                         |
| Gemini CLI (enterprise compatibility) | `~/.gemini`                                                                                                                          | `~/.gemini/GEMINI.md`; workspace `GEMINI.md`; customizable `context.fileName`; `/memory` manages loaded context                                                                                               | Session transcripts under `~/.gemini/tmp/<project>/chats/`; resume / rewind / checkpointing documented; project memory inbox and patch workflow documented but not all canonical directories are named on one page                                                                                                             | Skills in `~/.gemini/skills/`, `.gemini/skills/`, plus `.agents/skills/` aliases; commands in `~/.gemini/commands/`, `.gemini/commands/`                                                                                                                          | `~/.gemini/settings.json`, `.gemini/settings.json`; Free/Pro/Ultra request service ended 2026-06-18; enterprise, Google Cloud and paid API keys remain supported                                                          | Official transition announcement + legacy docs                  |
| Google Antigravity                    | Managed customizations in `~/.gemini/config`; desktop runtime in `~/.gemini/antigravity`; CLI runtime in `~/.gemini/antigravity-cli` | Global `~/.gemini/GEMINI.md`; workspace `GEMINI.md`, `AGENTS.md`, and `.agents/rules/`                                                                                                                        | Antigravity 2.0 and CLI keep separate product-owned conversations, artifacts, knowledge, cache, and updater state; PromptHub does not use those runtime roots as Skill targets                                                                                                                                                 | Shared global Skills in `~/.gemini/config/skills/`; Plugins in `~/.gemini/config/plugins/`; workspace Skills and Plugins in `.agents/skills/` and `.agents/plugins/`                                                                                              | Global MCP `~/.gemini/config/mcp_config.json`; workspace `.agents/mcp_config.json`; CLI preferences `~/.gemini/antigravity-cli/settings.json`                                                                             | Officially documented for Antigravity CLI and Antigravity 2.0   |
| Cline                                 | `~/.cline` or absolute `CLINE_DATA_DIR`                                                                                              | `AGENTS.md`; `.clinerules/`; `~/Documents/Cline/Rules`; project `.cline/` instruction assets                                                                                                                  | Current sessions in `data/sessions/sessions.db` plus `<session-id>.json` snapshots; legacy tasks in `data/tasks/<taskId>/api_conversation_history.json` with optional `task_metadata.json`; PromptHub reads visible turns read-only                                                                                            | `~/.cline/skills/`, `.cline/skills/`, `~/.cline/agents/`, `.cline/agents/`, plugins / hooks / workflows documented                                                                                                                                                | `~/.cline/data/settings/global-settings.json`, `providers.json`, `cline_mcp_settings.json`                                                                                                                                | Officially documented + verified local adapter (partial)        |
| Augment                               | `~/.augment`                                                                                                                         | User rules in `~/.augment/rules/`; workspace `.augment/rules/` and `.augment-guidelines`; directory rules use `always_apply` / `agent_requested` frontmatter; no single global rule file                      | Runtime sessions are Auggie-owned; not part of the stable Skill target contract                                                                                                                                                                                                                                                | Skills in `~/.augment/skills/`, `.augment/skills/`, plus compatible `.claude/skills/` and `.agents/skills/`; commands in `~/.augment/commands/` and `.augment/commands/`                                                                                          | Persistent MCP servers in `~/.augment/settings.json` under `mcpServers`; one-shot `--mcp-config` overrides are supported                                                                                                  | Officially documented (CLI docs, 2026)                          |
| CodeBuddy                             | `~/.codebuddy`; project `.codebuddy/`; project MCP at `.mcp.json`                                                                    | user `~/.codebuddy/CODEBUDDY.md`; project `CODEBUDDY.md`; modular `rules/` documented in SDK reference                                                                                                        | Local conversation resume is documented; exact persisted transcript path not confirmed in current pass                                                                                                                                                                                                                         | user/project Skills in `~/.codebuddy/skills/` and `.codebuddy/skills/`; user/project agents in `~/.codebuddy/agents/` and `.codebuddy/agents/`; commands; hooks; plugin packages with `.codebuddy-plugin/plugin.json`; plugins may include MCP servers            | `~/.codebuddy/settings.json`, `.codebuddy/settings.json`, `.codebuddy/settings.local.json`, `~/.codebuddy/.mcp.json`, project `.mcp.json`                                                                                 | Officially documented                                           |
| ZCode Agent                           | `~/.zcode`; project `.zcode/`                                                                                                        | user `~/.zcode/AGENTS.md`; workspace `AGENTS.md`                                                                                                                                                              | Session/task persistence is product-documented; stable transcript path not confirmed in current pass                                                                                                                                                                                                                           | user Skills in `~/.zcode/skills/`; commands in `~/.zcode/commands/`; subagents in `~/.zcode/agents/`; Plugin bundles are documented, but a stable local package marker/path is not confirmed                                                                      | user MCP `~/.zcode/cli/config.json`; project MCP `.zcode/config.json`; native JSON shape `mcp.servers`                                                                                                                    | Officially documented (partial)                                 |
| OpenClaw                              | `~/.openclaw`                                                                                                                        | workspace bootstrap files in `~/.openclaw/workspace` (or `workspace-<profile>`), including `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, optional `HEARTBEAT.md` / `BOOT.md` / `BOOTSTRAP.md` | Session store in `~/.openclaw/agents/<agentId>/sessions/sessions.json`; transcripts in `~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`; daily memory in workspace `memory/YYYY-MM-DD.md`; long-term memory `MEMORY.md`; dreaming surface `DREAMS.md`; gateway logs in `/tmp/openclaw/openclaw-YYYY-MM-DD.log`        | Workspace skills in `~/.openclaw/workspace/skills/`; managed skills in `~/.openclaw/skills/`; canvas files in workspace `canvas/`                                                                                                                                 | `~/.openclaw/openclaw.json`; profile-specific workspace via `OPENCLAW_PROFILE`; sandbox workspaces in `~/.openclaw/sandboxes`                                                                                             | Officially documented                                           |
| QClaw                                 | PromptHub default `~/.qclaw`; can one-click associate existing OpenClaw                                                              | OpenClaw-compatible assistant; no separate public single-file global rule path confirmed in current pass                                                                                                      | Product docs confirm strong context memory, but public local memory/session paths were not confirmed in current pass                                                                                                                                                                                                           | ClawHub official skill market, GitHub open source Skills, custom/shareable Skills, and MCP Server protocol support documented; PromptHub uses `skills/` as a compatibility surface until local installed-skill paths are public                                   | No public config file path confirmed in current pass                                                                                                                                                                      | Officially documented (partial) + PromptHub local root inferred |
| OpenCode                              | `~/.config/opencode`                                                                                                                 | `~/.config/opencode/AGENTS.md`; local traversal of `AGENTS.md`; Claude fallback `CLAUDE.md`; extra `instructions` via `opencode.json`                                                                         | Snapshot / undo feature documented; canonical persisted conversation-history path not confirmed in current pass                                                                                                                                                                                                                | Agents in `agents/`; skills in `skills/`; commands in `commands/`; plugins in `plugins/`; modes in `modes/`                                                                                                                                                       | `~/.config/opencode/opencode.json`, `~/.config/opencode/tui.json`, project `opencode.json`, env-based overrides, managed configs                                                                                          | Officially documented                                           |
| Cursor                                | `~/.cursor`                                                                                                                          | `.cursor/rules/` project rules; `AGENTS.md` in root and subdirectories; user rules are settings-owned                                                                                                         | Cursor documents local History and CLI `ls`/`--resume`; current local runtime exposes `projects/<project>/agent-transcripts/<session-id>/<session-id>.jsonl`; PromptHub reads visible turns read-only and does not claim the private index/checkpoint store                                                                    | User/project Skills in `~/.cursor/skills/` and `.cursor/skills/`; user/project SubAgents in `~/.cursor/agents/` and `.cursor/agents/`; Plugins below `~/.cursor/plugins/` are discovery-only                                                                      | User `~/.cursor/mcp.json`, project `.cursor/mcp.json`; Marketplace cache/local Plugin roots are read-only; private settings/auth/database/runtime state excluded                                                          | Official docs + verified current local runtime (partial)        |
| Windsurf                              | `~/.codeium/windsurf`                                                                                                                | `memories/global_rules.md`; `.windsurf/rules/*.md`; directory-scoped `AGENTS.md`; enterprise system rules                                                                                                     | Workspace memories in `~/.codeium/windsurf/memories/`; memories are local and workspace-scoped                                                                                                                                                                                                                                 | Skills in `.windsurf/skills/` and `~/.codeium/windsurf/skills/`; workflows in `.windsurf/workflows/` and `~/.codeium/windsurf/global_workflows/`; `.agents/skills/` compatibility                                                                                 | Root config dir documented by feature paths; separate public settings-file contract not the focus of current pass                                                                                                         | Officially documented                                           |
| Kiro                                  | `KIRO_HOME` or `~/.kiro`                                                                                                             | Workspace and global steering in `.kiro/steering/` and `~/.kiro/steering/`; the current single-file Rules contract does not expose this directory                                                             | CLI session metadata and JSONL are locally verified below `sessions/cli`; PromptHub projects visible Prompt/Assistant text only, read-only, without a synthetic resume command                                                                                                                                                 | Skills in `.kiro/skills/` and `~/.kiro/skills/`; agents in `.kiro/agents/` and `~/.kiro/agents/`; Power packages below `powers/` are read-only until native import/registration exists                                                                            | user MCP `settings/mcp.json`; CLI model preference `settings/cli.json` field `chat.defaultModel`; credentials and account state remain Kiro-owned                                                                         | Official docs + verified current local runtime (partial)        |
| Roo Code                              | `~/.roo`                                                                                                                             | `~/.roo/rules/`, `~/.roo/rules-{mode}/`, `.roo/rules/`, `.roo/rules-{mode}/`, `.roorules`, `.roorules-{mode}`, workspace `AGENTS.md` / `AGENT.md`                                                             | Checkpoints enabled by default via shadow git repo; task-scoped restore / diff documented                                                                                                                                                                                                                                      | Skills in `.roo/skills/`, `.roo/skills-{mode}/`, `~/.roo/skills/`, `~/.roo/skills-{mode}/`, plus `.agents/skills/`; slash commands in `.roo/commands/`, `~/.roo/commands/`                                                                                        | VS Code setting `roo-cline.useAgentRules`; mode and prompt UI configs documented                                                                                                                                          | Officially documented                                           |
| GitHub Copilot                        | `COPILOT_HOME` or `~/.copilot`; repository instructions remain project-scoped                                                        | `.github/copilot-instructions.md`; `.github/instructions/*.instructions.md`; `AGENTS.md` anywhere in repo; root `CLAUDE.md` or `GEMINI.md` alternative                                                        | Platform-owned `<root>/session-store.db` and `session-state/`; PromptHub provides a bounded read-only metadata/visible-turn adapter with `copilot --resume=<id>`, while schema, retention and runtime state remain Copilot-owned                                                                                               | Copilot / VS Code Agent Plugins via `plugin.json`; component paths include agents, skills, commands, hooks, MCP servers, and LSP servers                                                                                                                          | Repository settings can enable / disable custom instructions; Copilot CLI / VS Code settings manage plugin marketplaces and plugin locations                                                                              | Official docs + verified local store (partial)                  |
| WorkBuddy                             | `~/.workbuddy` for user MCP config; project `.workbuddy/` for project MCP config                                                     | WorkBuddy assistant / expert / skill surfaces documented; no public single-file global rule path confirmed in current pass                                                                                    | Memory is documented as a product feature; public local memory/session paths were not confirmed in current pass                                                                                                                                                                                                                | Skill Marketplace documented; custom WorkBuddy Skills typically include `skill.yml`, implementation files, and `README`; local installed-skill directory not confirmed in current pass                                                                            | `~/.workbuddy/mcp.json`, project `.workbuddy/mcp.json`; MCP market and WeCom bot example documented                                                                                                                       | Officially documented (partial)                                 |
| Amp                                   | `~/.config/agents`                                                                                                                   | login-gated agents manual exists                                                                                                                                                                              | not confirmed                                                                                                                                                                                                                                                                                                                  | not confirmed                                                                                                                                                                                                                                                     | not confirmed                                                                                                                                                                                                             | Evidence limited                                                |
| Cherry Studio                         | macOS `~/Library/Application Support/CherryStudio`; Windows `%APPDATA%\CherryStudio`; Linux `~/.config/CherryStudio`                 | no stable global rule file modeled in current pass                                                                                                                                                            | Current Agent sessions are read from `Data/cherrystudio.sqlite` (`agent_session` / `agent_session_message`) with visible `data.parts` text only; verified older `Data/agents.db` (`sessions` / `session_messages`) remains a read-only fallback; normal chats, memory, credentials and other runtime state remain Cherry-owned | Canonical Skill files under `Data/Skills`; current catalog in `Data/cherrystudio.sqlite` (`skills` / `agent_skills`); compatible older databases may use `Data/agent.db`, `Data/agents.db`, or root `cherrystudio.sqlite` and legacy skill tables                 | current public path registry and Skill service define the database/Skill boundary; macOS launch allowlist covers system and user Applications directories; no single native Plugin package contract is modeled            | Official current source + verified legacy Agent DB (partial)    |
| Doubao Work                           | macOS `~/Library/Application Support/Doubao/Default/.doubao/agent_mode/workspace`                                                    | no verified PromptHub-managed Rules surface                                                                                                                                                                   | Runtime state remains Doubao-owned; no session adapter is modeled                                                                                                                                                                                                                                                              | User Skills in `.user_skills/<name>/SKILL.md`; sibling `.skills` is product-owned and read-only to PromptHub                                                                                                                                                      | No Provider, MCP, Plugin, Config Files, Usage, or maintenance contract is modeled                                                                                                                                         | Verified local Doubao 2.27.10 Skill contract; other OS inferred |

### PromptHub-Inferred Inventory

这些平台当前仍以 PromptHub 的平台根目录兼容目标为主，缺少足够公开官方资料支撑更细的本地资产建模。

| Platform     | ID             | Default Root (macOS)                                            | Current PromptHub Model                                                                                | Evidence                                                                   |
| ------------ | -------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| TRAE IDE     | `trae`         | `~/.trae`                                                       | TRAE IDE international client; root dir + `skills/` convention only                                    | Product confirmed; local path PromptHub inferred                           |
| TRAE Work    | `trae-work`    | `~/.trae-work`                                                  | TRAE Work international client; PromptHub assigns an isolated root + `skills/` convention              | Product confirmed; local path PromptHub inferred                           |
| TRAE IDE CN  | `trae-cn`      | `~/.trae-cn`                                                    | China-region TRAE IDE preset; visible built-in platform keeps the existing root convention             | Product confirmed; local path PromptHub inferred                           |
| TRAE Work CN | `trae-work-cn` | `~/.trae-work-cn`                                               | TRAE Work is a separate China-region client; PromptHub assigns an isolated root + `skills/` convention | Product confirmed; local path PromptHub inferred                           |
| Qoder        | `qoder`        | `~/.qoder`                                                      | Official transcript JSONL read-only history; root dir + `skills/` remains a compatibility convention   | Official Qoder Hooks/CLI docs; local Skill path remains PromptHub inferred |
| QoderWorker  | `qoderwork`    | `~/.qoderwork`                                                  | root dir + `skills/` convention only                                                                   | PromptHub inferred                                                         |
| Hermes Agent | `hermes`       | macOS/Linux `~/.hermes`; Windows Native `%LOCALAPPDATA%\hermes` | root dir + `skills/` convention only                                                                   | Windows Native root officially documented; skills path PromptHub inferred  |

Qoder and Qwen Code are separate products and remain separate PromptHub targets.
`qoder` keeps its existing inferred `~/.qoder` compatibility contract. The
standalone open-source terminal Agent uses built-in id `qwen`, display name
`Qwen Code`, and the officially documented `QWEN_HOME` / `~/.qwen` contract.

### Qoder Sessions

- Qoder automatically writes chronological JSONL transcripts to
  `~/.qoder/projects/<encoded-project>/transcript/<session-id>.jsonl` and
  documents the `session_meta`, `user`, `assistant` and `progress` record
  taxonomy.
- PromptHub reads only regular files in that exact tree. Every record must
  carry the filename session id. User content must be a string; assistant
  content contributes only `text` parts. Progress, Hook, tool-use and
  tool-result records remain excluded from search, detail and export. Records
  larger than 1 MiB are skipped before JSON parsing so one oversized runtime
  payload cannot hide later visible messages.
- The catalog and visible body are paginated without a fixed display cutoff.
  Qoder documents interactive TUI `/resume`, so PromptHub does not advertise a
  direct native resume command until a stable non-interactive argument is
  verified.
- QoderWork remains a separate `qoderwork` platform. Its current official Hook
  docs expose session event ids but no stable transcript path or file schema,
  so its Sessions capability remains `planned`.

### Read-Only Session Qualification

- A readable session adapter must expose real visible user/assistant message
  bodies with bounded list, search and detail pagination. Session ids or task
  metadata without readable messages do not qualify.
- The current TRAE desktop installation keeps session relations in standard
  VS Code `state.vscdb` records, but stores message bodies in the private,
  non-standard `ModularData/ai-agent/database.db`. PromptHub does not infer a
  key or decrypt this store, so all four TRAE identities remain `planned`.
- Cloud-only history is not silently queried. It requires a separately reviewed
  authenticated adapter, explicit opt-in, redaction and failure semantics.

### Marvis Research Watchlist

Tencent Marvis is a separate operating-system-level AI assistant, not the same product as MiniMax Mavis. Official Marvis material confirms Windows, macOS, Android, and iOS entries, local/privacy mode with zero file upload, cross-device phone control of a computer, file search/organization, OS settings control, and document/spreadsheet understanding and generation. Current public official pages do not expose stable local Skill, MCP, plugin, rule, settings, memory, or transcript paths.

Expanded community / forum pass on 2026-07-04:

- 36Kr hands-on reports confirm Marvis has a built-in Skill Plaza, with one-click install and immediate use; a WeRead Skill was tested successfully, but the report also says the current Skill count is limited.
- Another 36Kr hands-on report shows Marvis using multi-Agent collaboration and automatically invoking a document-writing Skill, suggesting Skill is a real runtime concept inside Marvis rather than only marketing copy.
- Linux.do user discussion confirms community-visible concepts such as full-disk document scanning, "牛马办公室", Skill Plaza, Android / WeChat-style remote control, and local-file-heavy positioning. The same discussion reports limitations such as no custom API support and heavy resource usage.
- A GitHub Hermes issue analyzes Marvis as a 1+5 Agent architecture and explicitly treats it as a closed / non-extensible product from a developer-platform point of view. This is useful architecture evidence but not a Marvis file-path contract.
- Community repos currently treat Marvis as something that can read local folders or uploaded scene packs. That is a user workflow, not a durable installed-Skill directory or package spec.

Current support boundary:

- PromptHub SHOULD recognize Marvis as a strong watchlist candidate because community evidence confirms a real Skill Plaza and internal Skill invocation.
- PromptHub SHOULD NOT add `marvis` as a built-in platform yet, because this pass still found no stable local root directory, installed Skill folder, MCP config path, custom Skill package format, plugin directory, settings file, import/export format, or public developer API.
- If a later pass finds only "read this folder / upload this scene pack" workflows, PromptHub should model Marvis as a manual export / scene-pack target, not as a root-directory Agent platform.

### Strong Candidates For Future Built-in Support

以下平台在本轮调研中具备比“仅知道产品名”更强的公开本地资产证据，适合作为内置 Agent / 预制平台候选或已升级平台记录。`Kilo Code`、`TRAE Work`、`TRAE Work CN` 已作为 PromptHub 的一等内置平台进入 `packages/shared/constants/platforms.ts`。

| Platform     | Why it stands out                                                                                                                          | Public local asset evidence                                                                                                                                                                                                             | Suggested PromptHub modeling status                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| WorkBuddy    | Tencent WorkBuddy now has an explicit MCP file contract and a documented custom Skill package structure                                    | user `~/.workbuddy/mcp.json`, project `.workbuddy/mcp.json`, JSON `mcpServers`; custom Skills include `skill.yml`, implementation files, and `README`                                                                                   | Built-in platform; MCP target supported                                    |
| CodeBuddy    | CodeBuddy Code has grown beyond a simple `skills/` surface into settings, memory, agents, commands, hooks, plugins, marketplaces, and MCP  | `~/.codebuddy/settings.json`, `.codebuddy/settings.json`, `.codebuddy/settings.local.json`, `CODEBUDDY.md`, `~/.codebuddy/.mcp.json`, project `.mcp.json`, `skills/`, `agents/`, `commands/`, `rules/`, `.codebuddy-plugin/plugin.json` | Built-in platform; MCP target supported                                    |
| ZCode Agent  | ZCode publicly documents Skills, user instructions, commands, subagents, nested MCP config, and Plugin bundles                             | `~/.zcode/skills/`, `~/.zcode/AGENTS.md`, `~/.zcode/commands/`, `~/.zcode/agents/`, `~/.zcode/cli/config.json`, project `.zcode/config.json`; Plugin marker/path not confirmed                                                          | Built-in platform; Skills, Rules, and MCP target supported; Plugin pending |
| QClaw        | Tencent PC Manager localized OpenClaw assistant with WeChat binding, OpenClaw association, ClawHub/GitHub Skills, and MCP protocol support | Product docs confirm QClaw is based on OpenClaw, can associate existing OpenClaw, and supports ClawHub/GitHub Skills, MCP Server protocol, custom/shareable Skills                                                                      | Built-in OpenClaw-compatible platform; no MCP path yet                     |
| Kilo Code    | Kilo 使用分离的 Skill 与配置根；MCP 位于所选 JSONC 配置的顶层 `mcp` 字段                                                                   | `.kilo/skills/`, `~/.kilo/skills/`, global `~/.config/kilo/kilo.jsonc`, global `~/.config/kilo/AGENTS.md`, project `kilo.jsonc` or `.kilo/kilo.jsonc`, project `AGENTS.md`, global/project `agents/*.md`                                | Built-in platform; MCP supported, split-root Provider/Rules design pending |
| TRAE Work    | 国际站下载页和文档入口展示 TRAE Work，与 TRAE IDE 分开展示；本轮已作为独立内置 Agent 平台落入 `trae-work`                                  | Product entry available via `trae.ai`; local skills path remains PromptHub inferred                                                                                                                                                     | Promoted to built-in platform with isolated default root                   |
| TRAE Work CN | 中国站和文档显示 TRAE Work 是独立客户端，不依赖 TRAE IDE；本轮已作为独立内置 Agent 平台落入 `trae-work-cn`                                 | Product docs entry available via `docs.trae.cn`; local skills path remains PromptHub inferred                                                                                                                                           | Promoted to built-in platform with isolated default root                   |

建模建议：

- `TRAE IDE` 是普通 IDE 产品，继续使用已有 `trae` 平台 id 和 `~/.trae` 根目录，避免破坏历史设置。
- `TRAE IDE CN` 继续使用已有 `trae-cn` 平台 id 和 `~/.trae-cn` 根目录，避免破坏历史设置和迁移逻辑。
- `TRAE Work` 是国际版新客户端，使用独立 `trae-work` 平台 id 和 `~/.trae-work` 默认根目录；公开资料确认产品存在，本地 skills 目录是 PromptHub 的保守分发约定。
- `TRAE Work CN` 是新客户端，使用独立 `trae-work-cn` 平台 id 和 `~/.trae-work-cn` 默认根目录；公开资料确认产品存在，本地 skills 目录是 PromptHub 的保守分发约定。
- `Kilo Code` 已作为独立 built-in platform 建模，不能与 `Kiro` 混用；MCP 使用 Kilo 自己的 `mcp` JSON/JSONC 配置结构。
- `Tencent WorkBuddy` 使用 `workbuddy` 平台 id 和 `~/.workbuddy` 默认根目录；MCP 使用官方用户级 `mcp.json` 与项目级 `.workbuddy/mcp.json`。
- `CodeBuddy` 保留既有 `codebuddy` 平台 id，但不再只建模 `skills/`；默认资产包括 `CODEBUDDY.md`、`.mcp.json`、`settings.json`、`skills/`、`agents/`、`commands/`。
- `ZCode Agent` 使用 `zcode` 平台 id 和官方用户根目录 `~/.zcode`；Skills、Rules 和 MCP 走已确认的路径，Plugin 只保留 pending 状态，直到官方确认本地包 marker 与安装路径。
- `Qoder` 继续表示 Qoder IDE / CLI，不复用 Qwen Code 的本地资产合同。
- `Qwen Code` 使用独立 `qwen` 平台 id；默认用户根为 `~/.qwen`，支持 `QWEN_HOME`，而 `QWEN_RUNTIME_DIR` 只影响会话/日志等运行态输出。
- `Kimi Code` 保留 `kimi` 平台 id；当前目标使用 `KIMI_CODE_HOME` / `~/.kimi-code`；源码仍保留的 `KIMI_SHARE_DIR` / `~/.kimi` 存在性回退是待移入数据迁移的实现差距。Agent 工作台允许编辑 current `config.toml` / `tui.toml` / `mcp.json`，但不把 Kimi 伪装成尚未实现的结构化 MCP writer。
- `Reasonix` 使用 `reasonix` 平台 id，管理 `~/.reasonix/skills/`，并把 `config.toml`、`settings.json`、`trust.json` 标记为发现/配置预览；Reasonix 的 TOML Plugin/MCP 语法不复用 Codex writer。
- `Augment` 使用 `augment` 平台 id，管理 `~/.augment/skills/`，预览 `settings.json`，并通过 Rules 暴露官方 `~/.augment/user-guidelines.md` 用户指南入口；其 `rules/` 目录和 frontmatter 不压平成单一文件。
- `QClaw` 使用独立 `qclaw` 平台 id，默认根目录为 PromptHub 兼容约定 `~/.qclaw`；由于官方强调基于 OpenClaw 并可关联 OpenClaw，当前复用 OpenClaw 的 workspace/SOUL.md 规则候选和 `skills/` 兼容面，但不创建未确认的 MCP 配置路径。
- `Marvis` 暂不作为内置平台。当前公开资料证明产品存在和系统级 Agent 能力，但没有可落地的本地资产路径或 MCP/Skill 文件合同。

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
- Provider and credentials:
  - user Provider projection is `~/.claude/settings.json`; PromptHub edits it
    structurally and preserves unrelated JSON/JSONC content
  - the selected model is the top-level `model`; direct or compatible
    Anthropic endpoints use `env.ANTHROPIC_BASE_URL`
  - optional Sonnet, Opus, Haiku and subagent routes use
    `env.ANTHROPIC_DEFAULT_SONNET_MODEL`,
    `env.ANTHROPIC_DEFAULT_OPUS_MODEL`,
    `env.ANTHROPIC_DEFAULT_HAIKU_MODEL` and
    `env.CLAUDE_CODE_SUBAGENT_MODEL`; the selected PromptHub profile owns these
    four route keys during activation
  - PromptHub-managed credentials may project only
    `env.ANTHROPIC_API_KEY` or `env.ANTHROPIC_AUTH_TOKEN`
  - Bedrock, Vertex and Foundry flags are detected and imported as read-only
    platform-native profiles until dedicated adapters exist
  - Claude-owned `.credentials.json` remains outside PromptHub Provider
    activation, backup and export
- Evidence note:
  - Claude has the strongest official separation between rules (`CLAUDE.md`) and auto memory.
  - Current pass re-verified the memory directory, but did not separately re-verify a canonical transcript JSONL pathname.
  - Provider/config evidence: `https://code.claude.com/docs/en/settings`,
    `https://code.claude.com/docs/en/env-vars`, and
    `https://code.claude.com/docs/en/model-config`.

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
  - PromptHub reads active `sessions/**/*.jsonl` and flat `archived_sessions/*.jsonl` with bounded prefix reads, deduplicates by session id with the active copy preferred, and renders only user/assistant event messages
  - the ChatGPT name/icon preference is presentation only; it keeps stable platform id `codex`, the resolved Codex root, and `codex resume <id>` metadata
- Reusable assets:
  - skills under repo / user / admin / system discovery tiers via `.agents/skills/`
  - plugins are installable bundles with `.codex-plugin/plugin.json` metadata and can package skills, apps/connectors, MCP servers, commands, hooks, assets, and marketplace metadata
  - subagents and workflows are first-class documented concepts
- Config and profiles:
  - `~/.codex/config.toml`, `.codex/config.toml`, `/etc/codex/config.toml`
  - named profiles and enterprise `requirements.toml` documented
  - PromptHub custom Provider Profiles project `model_provider`, `model`, the
    selected `[model_providers.<id>]` endpoint/auth source and a matching named
    profile while preserving unrelated TOML text
  - optional primary-model parameters project the official
    `model_reasoning_effort` enum and positive `model_context_window`; activating
    a profile without either option removes the previous PromptHub-managed
    scalar so Codex falls back to its model defaults
  - current official Codex configuration documents Responses as the custom
    provider wire API; PromptHub's older Chat compatibility remains a separate
    legacy boundary rather than evidence for adding more form fields
- Maintenance:
  - npm- and Node version-manager-managed installs may review and confirm the canonical `npm install -g @openai/codex@latest` update; PromptHub verifies the same active Codex executable and can restore the captured exact package version
  - Homebrew, standalone, system, user-local and ambiguous installs remain read-only diagnostics rather than being routed through the npm writer
- PromptHub appearance adapter:
  - Codex desktop skins use PromptHub-managed Codex Dream Skin schema-v1 directories (`theme.json` plus one contained local image) and the pinned audited Dream Skin runtime; application files and signatures remain untouched
  - local Pets remain Codex-owned under the resolved `<codex-root>/pets/<pet-id>` and are not included in PromptHub backup or sync by default
  - the UI records the last successfully applied managed skin, not a durable claim that a later standalone Codex restart retained runtime injection

### Kimi Code

- Root resolution:
  - current: `KIMI_CODE_HOME` or `~/.kimi-code`
  - legacy fallback: `KIMI_SHARE_DIR` or `~/.kimi`
  - explicit PromptHub root overrides remain highest priority; fresh targets use
    `~/.kimi-code` and never create new legacy data.
- Rules and context:
  - current user instructions: `~/.kimi-code/AGENTS.md`
  - project instruction discovery remains Kimi-owned.
  - PromptHub exposes the verified path in Agent management; the central Rules
    runtime template remains a separate follow-up.
- Reusable assets:
  - current user Skills: `~/.kimi-code/skills/`
  - current plugins: `~/.kimi-code/plugins/`
  - legacy `~/.kimi/skills/` is read only when no current root exists.
- Config and MCP:
  - `config.toml`: model/provider definitions and `default_model`
  - `tui.toml`: terminal UI preferences
  - `mcp.json`: MCP configuration
  - `credentials/`, logs and update/runtime state are not allowlisted.
- PromptHub Provider adapter:
  - Supports the official `kimi`, `openai`, `openai_responses`, `anthropic`,
    and `google-genai` direct-provider types through unified Provider Profiles.
    The native provider id, model alias, upstream model id, and required
    `max_context_size` remain explicit rather than inferred.
  - Direct API keys remain in PromptHub main-process secure storage until a
    confirmed activation projects them into Kimi Code's required plaintext
    `config.toml` field. The complete prior config is stored only as an
    encrypted rollback bundle.
  - Kimi `/login` OAuth references, provider `env`, `custom_headers`, and
    Vertex ADC remain platform-owned. PromptHub imports only redacted identity,
    does not read or test those credentials, and may only select an already
    valid native model entry.
  - Activation preserves unrelated TOML data semantically, checks the source
    digest, writes atomically, invokes `kimi doctor config` when the allowlisted
    executable is available, re-reads and verifies the full projection, and
    restores the exact prior bytes on failure.
  - Connectivity and streaming tests reuse the existing bounded
    OpenAI-compatible, Anthropic, and Google Gemini probes; no proxy or protocol
    conversion is introduced.
- Sessions:
  - `session_index.jsonl` is the bounded index.
  - session metadata is read from `state.json`; transcript detail is read on
    demand from `agents/main/wire.jsonl`.
  - PromptHub provides `kimi --session <id>` resume metadata and does not edit or
    delete Kimi transcripts.
- Evidence:
  - `https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html`
  - `https://moonshotai.github.io/kimi-code/en/configuration/config-files.html`
  - `https://moonshotai.github.io/kimi-code/en/configuration/providers.html`
  - `https://moonshotai.github.io/kimi-code/en/guides/sessions.html`
  - `https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html`
  - `https://moonshotai.github.io/kimi-code/zh/guides/migration.html`

### Hermes Agent

- Root: `~/.hermes` on macOS/Linux; the platform registry keeps the documented
  Windows Native root independently.
- Sessions: PromptHub opens only regular root-contained `state.db` files in
  SQLite read-only mode, validates the current `sessions` / `messages` schema,
  and uses parameterized bounded queries for list and full visible-body search.
  Only active user/assistant content is projected; reasoning and other runtime
  fields remain excluded. Detail uses a source-revision cursor and native
  continuation uses `hermes --resume <id>` with a verified project cwd when
  available.
- Other provider, usage and lifecycle capabilities remain independently
  planned; session support does not imply that PromptHub owns Hermes state.

### Reasonix

- Root: `~/.reasonix` on macOS/Linux; `%APPDATA%\\reasonix` on Windows;
  `REASONIX_HOME` can override the root.
- Rules and context:
  - project config is `./reasonix.toml` and takes precedence over the user
    config for project-scoped fields
  - `REASONIX.md` and `AGENTS.md` are project memory/instruction documents
  - PromptHub keeps these hierarchy files repository-scoped instead of
    projecting a synthetic global Rules file
- Reusable assets:
  - global Skills: `~/.reasonix/skills/`
  - global slash commands: `~/.reasonix/commands/`
  - Skills can declare `runAs = "subagent"`; MCP/plugin servers are declared
    as `[[plugins]]` in TOML rather than installed as Skill directories
- Config and protected state:
  - global config: `~/.reasonix/config.toml`
  - hooks: `~/.reasonix/settings.json`
  - hook trust store: `~/.reasonix/trust.json`
  - provider secrets, sessions, archives, memory, logs, and caches remain
    Reasonix-owned and are not written by PromptHub
  - `.mcp.json` can be merged by the Reasonix plugin configuration, but the
    TOML/Plugin schema is not compatible with PromptHub's Codex writer
- Sessions:
  - PromptHub reads current project/global JSONL checkpoints and replays the
    corresponding schema-v1 `.events.jsonl` stream when present
  - only user/assistant text is searchable and visible; system, tool and
    provider reasoning fields remain excluded
  - detail is revision-bound and cursor-paginated; native continuation uses
    the verified `reasonix --resume <session-path>` contract
- Evidence:
  - `https://github.com/esengine/DeepSeek-Reasonix`
  - `https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/docs/CONFIG_PATHS.md`
  - `https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/docs/GUIDE.md`

### Augment

- Root: `~/.augment`
- Rules and context:
  - user rules: `~/.augment/rules/` (always applied by the CLI)
  - workspace rules: `.augment/rules/` with `type: always_apply` or
    `type: agent_requested`
  - workspace guideline file: `.augment-guidelines`
  - the CLI skips `type: manual` workspace rules, so PromptHub does not
    flatten this directory protocol into a single global Rules file
- Reusable assets:
  - user/workspace Skills: `~/.augment/skills/` and `.augment/skills/`
  - compatible `.claude/skills/` and `.agents/skills/` roots are discovered
  - commands: `~/.augment/commands/` and `.augment/commands/`
- Config and MCP:
  - persistent MCP servers live in `~/.augment/settings.json`; shared project
    MCP servers live in `<workspace>/.augment/settings.json`
  - `--mcp-config` provides per-run JSON overrides
  - PromptHub projects global MCP servers into `~/.augment/settings.json` and
    registered workspace MCP servers into `<workspace>/.augment/settings.json`,
    using the documented `mcpServers` JSON shape; local settings remain outside
    the global target and are not overwritten.
- Sessions:
  - saved Auggie CLI conversations are read from regular UUID-named
    `~/.augment/sessions/*.json` files
  - PromptHub projects only `request_message` and `response_text`, derives the
    workspace from request-node IDE state, and paginates visible turns without
    persisting transcript bodies
  - native continuation uses `auggie --resume <sessionId>` with the verified
    workspace root; `session.json`, account identity, tool nodes, agent state
    and task storage remain private and excluded
- Evidence:
  - `https://docs.augmentcode.com/cli/skills`
  - `https://docs.augmentcode.com/cli/rules`
  - `https://docs.augmentcode.com/cli/reference`
  - `https://docs.augmentcode.com/cli/interactive`

### ZCode Agent

- Root: `~/.zcode`
- Rules and context:
  - user global instructions: `~/.zcode/AGENTS.md`
  - workspace instructions: `AGENTS.md` in the current workspace
- Reusable assets:
  - user Skills: `~/.zcode/skills/<skill-name>/SKILL.md`
  - user commands: `~/.zcode/commands/<command-name>.md`
  - user subagents: `~/.zcode/agents/<name>.md`
- MCP config:
  - user/global: `~/.zcode/cli/config.json`, entries under `mcp.servers`
  - project/workspace: `.zcode/config.json`, entries under `mcp.servers`
  - ZCode also reads `.agents/mcp.json` as a compatibility fallback; PromptHub's
    native target writes only the documented `.zcode` files.
- Plugin boundary:
  - ZCode documents bundled Skills, commands, subagents, and MCP servers.
  - A stable local Plugin package marker and installation directory are not
    confirmed in the current public docs, so PromptHub keeps Plugin target
    distribution pending rather than writing an invented package format.
- Evidence:
  - `https://zcode.z.ai/en/docs/agents`
  - `https://zcode.z.ai/en/docs/skill`
  - `https://zcode.z.ai/en/docs/mcp-services`
  - `https://zcode.z.ai/en/docs/plugin`
  - official product mark: `https://zcode.z.ai/icon.svg?v=3.0.0`

### Gemini CLI

- Lifecycle: consumer service ended on 2026-06-18 for Free, Google AI Pro and Ultra users. Enterprise licenses, Google Cloud and paid Gemini API keys remain supported. PromptHub keeps this target for compatibility and points general users to Google Antigravity.
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
- Provider Profile boundary:
  - paid Gemini API profiles project `model.name` and
    `security.auth.selectedType=gemini-api-key` into the user settings file
  - PromptHub manages only `GEMINI_API_KEY` and optional
    `GOOGLE_GEMINI_BASE_URL` entries in `~/.gemini/.env`; the credential stays
    main-process only and backups of both files are encrypted
  - OAuth personal, Vertex AI, compute ADC, Cloud Shell and gateway auth remain
    Gemini-owned platform-native modes; PromptHub preserves but does not read,
    test, migrate, back up or export their credentials
  - paid API connection inventory uses `GET /v1beta/models`; explicit model
    tests use `POST /v1beta/models/{model}:streamGenerateContent?alt=sse`
    with bounded response, timeout, retry, cancellation, SSRF/DNS and
    credential-redaction controls
- Provider evidence:
  - official `google-gemini/gemini-cli` commit
    `bef6119500b0238ad84f6396d2a6cabda9991554`
  - `packages/core/src/config/settingsSchema.ts`,
    `packages/core/src/core/contentGenerator.ts`,
    `packages/core/src/code_assist/server.ts` and
    `packages/core/src/config/config.ts`

### Google Antigravity

- Product status:
  - Google currently ships Antigravity CLI as the `agy` TUI and Antigravity 2.0 as the visual desktop editor.
  - Antigravity is the current terminal surface for Free, Google AI Pro and Ultra users. Ongoing Gemini CLI releases serve enterprise, Google Cloud and paid API-key compatibility.
- Managed customization root: `~/.gemini/config`
  - global Skills: `~/.gemini/config/skills/<skill>/SKILL.md`
  - global MCP: `~/.gemini/config/mcp_config.json`
  - global Plugins: `~/.gemini/config/plugins/<plugin>/plugin.json`
  - global Rules remain in the shared `~/.gemini/GEMINI.md`
- Workspace assets:
  - Skills: `.agents/skills/` with `.agent/skills/` as a legacy alias
  - Rules: `.agents/rules/` with `.agent/rules/` as a legacy alias
  - MCP: `.agents/mcp_config.json`
  - Plugins: `.agents/plugins/` or `_agents/plugins/`
- Runtime and protected assets:
  - Antigravity CLI preferences: `~/.gemini/antigravity-cli/settings.json`
  - Antigravity CLI conversation identities are UUID-named `.db` files below `~/.gemini/antigravity-cli/conversations`; project cache maps and readable generated transcript projections remain product-owned runtime data.
  - PromptHub exposes a partial, read-only History adapter: it uses the `.db` filename as identity, bounded cache maps for project association and only known visible message rows from `brain/<id>/.system_generated/logs/transcript.jsonl`. It never decodes or writes SQLite protobuf blobs.
  - Database-only conversations remain listable and resumable with `agy --conversation <id>` but show an intentionally empty body. Credentials, keybindings, updater state, unknown generated artifacts, tool/code payloads and all native conversation files stay excluded from mutation, backup and sync.
  - Antigravity 2.0 runtime data under `~/.gemini/antigravity/` contains artifacts and knowledge items and is not a generic Skill distribution target.
  - Legacy desktop conversation `.pb` files are not parsed or projected by the CLI History adapter.
- PromptHub modeling note:
  - built-in id `antigravity` uses the display name `Antigravity` and represents the shared Antigravity customization surface used by both current clients
  - built-in id `gemini` uses the display name `Gemini`, remains independent as an enterprise/legacy compatibility target, and keeps the Gemini CLI configuration/session adapters
  - both built-in display names omit the `CLI` suffix; lifecycle badges carry availability differences
  - PromptHub uses a dedicated Antigravity MCP adapter for global and workspace targets: remote entries write `serverUrl`, while secret-bearing headers are redacted from previews and preserved only in native configuration

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
  - stable user config precedence: `~/.config/opencode/opencode.jsonc`, `~/.config/opencode/opencode.json`, then legacy `~/.config/opencode/config.json`
  - `~/.config/opencode/tui.json`
  - project `opencode.json`
  - custom path / custom directory / managed config / MDM preferences all documented
  - provider selection uses singular `provider`, `model`, and `small_model`; the experimental v2 plural `providers` shape is detected but not written
  - native credentials live separately at `${XDG_DATA_HOME}/opencode/auth.json` (defaulting to the platform XDG data root), not under the config root
  - PromptHub-managed direct Profiles support only the documented `@ai-sdk/openai-compatible` Chat Completions and `@ai-sdk/openai` Responses packages; native API, OAuth, well-known, environment, file and cloud credentials remain redacted and read-only
- State handling:
  - snapshot system is documented and configurable, but current public docs pass does not name a stable on-disk conversation-history directory
  - `opencode session list --format json` is project/cwd-scoped, so PromptHub lists global conversation metadata through a bounded read-only `opencode db` query and reads one selected transcript through `opencode export <session-id> --sanitize`
  - the metadata projection is versioned against the current native session/message/part schema and fails closed if that schema changes; PromptHub does not open the database file directly or substitute plugin sidecars when the projection is empty
  - History metadata is paged and transcript rendering is progressive; a successful native result with zero rows is shown as an explicit empty data source rather than an adapter failure
- Plugin modeling note:
  - OpenCode's documented plugin surface is a JavaScript/TypeScript or npm hook-module runtime loaded from `.opencode/plugins/`, `~/.config/opencode/plugins/`, or `opencode.json` `plugin`.
  - It is not modeled as a first-version PromptHub Plugin bundle adapter because the public plugin contract is function/hook oriented rather than a multi-child inventory package.

### Pi

- Identity and root: PromptHub uses built-in id `pi`, display name `Pi`, command
  `pi`, and default root `~/.pi/agent`. `PI_CODING_AGENT_DIR` is honored as the
  upstream override. Pi and Oh My Pi remain separate products even though the
  fork retains the same environment-variable name.
- Assets: native user Skills are `<root>/skills`, extensions are
  `<root>/extensions`, and global instructions are `<root>/AGENTS.md`.
- MCP: PromptHub exposes a compatible config-writer target rather than claiming
  to be Pi's runtime or a bundled adapter. Native global/project candidates are
  `~/.pi/agent/mcp.json` and `<project>/.pi/mcp.json`; adapter/shared candidates
  are `~/.config/mcp/mcp.json`, `~/.agents/mcp.json`, `~/.agents/mcp/mcp.json`,
  and `<project>/.mcp.json`. All use top-level `mcpServers`. The target list
  keeps candidates separate because the installed adapter/runtime owns final
  discovery and precedence.
- Config: the raw-editor allowlist is `settings.json`, `models.json`, and
  `AGENTS.md`; authentication files, sessions, caches and installed package
  state are excluded. The model projection reads `defaultProvider` and
  `defaultModel` from `settings.json` and updates only those selection fields
  through the existing backup, atomic-write and verification workflow.
- Provider workbench: Pi uses the same master-detail shell, toolbar, provider
  row and detail surfaces as the other Agent provider adapters. The current
  configuration action creates a same-id `models.json` provider entry with an
  empty override for the verified current model. This establishes editable
  override ownership without changing model routing, replacing built-in models
  or touching existing credentials. Importing a PromptHub provider is an
  explicit native projection into `<root>/models.json` and, when a managed key
  exists, `<root>/auth.json`; the main process resolves the source and
  credential, prepares both JSONC edits, verifies both source revisions and
  restores both files if either atomic write fails. Credentials never cross the
  preload boundary or enter `models.json`.
- Sessions: PromptHub scans only JSONL files below `<root>/sessions`, bounds
  metadata and detail reads, rejects unsafe ids and symlinks, and exposes
  `pi --session <id>` resume metadata without launching or editing Pi.
- Product relationship: Oh My Pi is a fork of Pi, not an alias. PromptHub may
  share version-3 JSONL parsing code, but detection, roots, adapter ids,
  executables, settings and results remain independent.

### Oh My Pi

- Identity and root: PromptHub uses built-in id `oh-my-pi`, display name `Oh My Pi`,
  and resolves `~/.omp/agent` through `PI_CODING_AGENT_DIR` when set. The
  display name intentionally has no `CLI` suffix.
- Assets: native user Skills are `<root>/skills`; global rules are
  `<root>/RULES.md`; the user MCP file is `<root>/mcp.json`; project MCP is
  `.omp/mcp.json`; and native plugins are derived from the sibling
  `~/.omp/plugins` directory. PromptHub does not claim plugin package
  installation or marketplace ownership yet.
- Config: the first raw-editor allowlist is `config.yml`, `config.yaml`,
  `settings.json`, `mcp.json`, `.mcp.json`, and `RULES.md`. Secret-bearing
  `models.yml`, session files, caches, and profile-specific runtime files remain
  outside the raw renderer editor.
- Provider/model projection: PromptHub reads `modelRoles.default` from the
  preferred `config.yml` (or `config.yaml`) and model ids plus sanitized
  provider endpoints from main-process-only `models.yml`. It can update only
  `modelRoles.default` with backup, atomic replacement, re-read verification,
  and exact-byte rollback. API keys, headers, OAuth data, model metadata, and
  unknown provider fields never enter renderer state. Current Oh My Pi stores
  native API-key/OAuth accounts in `<root>/agent.db`, can delegate auth to a
  broker, and resolves additional credentials from runtime/environment
  sources. PromptHub does not read, copy, write, export, sync, or migrate any
  of those native credentials. Full Provider endpoint/credential activation,
  usage/quota, and plugin package installation therefore remain unsupported
  until a separate credential-ownership decision is approved.
- Sessions: PromptHub scans only direct project JSONL files below
  `<root>/sessions`, bounds header/metadata/detail reads, ignores nested
  subagent transcripts and symlinks, filters to visible user/assistant/tool
  rows, and exposes `omp --resume <id>` metadata without launching or editing
  the native client.
- Current PromptHub status: registry, icon fallback, path derivation, Rules,
  global/project MCP presets, allowlisted config paths, redacted model
  projection/default-model editing, and read-only Sessions are implemented.
  The Provider & Model capability remains `partial`: model selection is
  verified, while Profile-owned endpoint/credential projection is
  intentionally unavailable. Usage/quota, native credential management, and
  package installation remain unsupported or planned according to their
  capability declarations.

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
  - PromptHub reads every bounded Agent index, validates declared transcript realpaths remain inside the OpenClaw root, and exposes user/assistant messages read-only; it does not invent a resume command when the store has no verified general CLI contract
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
  - The official CLI global flags include `-V`, `--version`, and `-v`.
    PromptHub declares only the read-only `openclaw --version` diagnostic.
    Native setup, update, repair, Gateway, Plugin, Skill and session commands
    remain outside the maintenance writer until an explicit lifecycle plan
    and rollback contract exists.

### QClaw

- PromptHub root convention: `~/.qclaw`
- Product relationship:
  - Tencent PC Manager QClaw is documented as an AI Agent assistant based on OpenClaw.
  - QClaw can one-click associate an existing OpenClaw instance, so PromptHub treats it as an OpenClaw-compatible subplatform rather than an alias.
- Reusable assets:
  - QClaw documents ClawHub official Skills, GitHub open source Skills, custom/shareable Skills, and MCP Server protocol support.
  - Current public docs do not confirm a stable local installed-skill directory, so PromptHub uses `skills/` as a compatibility surface.
- Context and config:
  - current public docs confirm strong context memory but do not expose stable local memory, transcript, settings, or MCP config paths.
  - PromptHub reuses `workspace/SOUL.md` as a compatibility rule candidate because QClaw is OpenClaw-based and exposes that explicit Agent path through the same `Rules` editor. The UI keeps the compatibility status distinct from an officially documented QClaw rule protocol.
- Modeling note:
  - do not alias `qclaw` to `openclaw`; keep a separate platform id so the UI can explain the Tencent/OpenClaw relationship and so future QClaw-specific local paths can be added without migration ambiguity.

### CoPaw

- Product: CoPaw is tracked as an independent local Agent identity. The
  current AgentScope distribution is published as QwenPaw, so the registry
  keeps `copaw` as the stable PromptHub id while using the current
  `~/.qwenpaw` installation root.
- PromptHub roots: primary `~/.qwenpaw`; legacy/compatibility fallback
  `~/.copaw` on all desktop platforms. The official QwenPaw installer
  documents `%USERPROFILE%\\.qwenpaw\\bin` on Windows; the host data root can
  still vary by install mode, so PromptHub only derives user-overridable
  `skills/` paths and does not claim a universal native skill directory.
- Reusable assets: `skills/` is a PromptHub compatibility surface. The public
  deployment documentation confirms local data and Skills, but does not
  establish one stable host-side Skills directory for every install mode.
- Sessions: PromptHub reads current SafeJSONSession v2 files from configured
  QwenPaw workspaces and one channel directory level, uses `chats.json` only
  for non-sensitive labels/timestamps, and projects visible user/assistant
  text. Synthetic continuation/memory/rubric messages, Skills injection,
  thinking, tool records and visual placeholders remain hidden. The reader is
  paginated and searchable but advertises no unverified native resume command.
- Capability boundary: Sessions is `supported`; Provider, Usage and CLI
  maintenance remain `planned`; path-level Agent/Skill management is
  `partial`.

### AutoClaw

- Product: Zhipu AutoClaw is a locally installed desktop Agent for macOS and
  Windows and is based on the OpenClaw ecosystem. It remains an independent
  `autoclaw` identity; PromptHub does not alias it to `openclaw`.
- PromptHub roots: primary `~/.autoclaw`; fallback `~/.openclaw-autoclaw` on
  all desktop platforms. These are `PromptHub inferred` compatibility
  candidates because the official landing page does not publish a canonical
  host data root.
- Reusable assets: `skills/` is a compatibility surface only. No native MCP,
  Rules, config, transcript, credential, or session path is claimed in this
  batch.
- Capability boundary: Provider, Sessions, Usage and CLI maintenance remain
  `planned`; path-level Agent/Skill management is available as `partial`.

### NanoClaw

- Product: NanoClaw is an open-source local Agent runtime with an arbitrary
  checkout root. Its official repository describes state under the project
  root (`store/`, `groups/`, `data/`) rather than a single global home folder.
- PromptHub roots: compatibility candidates are `~/.nanoclaw`, `~/nanoclaw`,
  and `~/nanoclaw-v2` (with the first existing path selected). Users can set a
  built-in Agent root override to the actual checkout; PromptHub never creates
  a checkout automatically.
- Reusable assets: the registry exposes `skills/` only as a user-overridable
  compatibility surface. NanoClaw group skills and `CLAUDE.md` files remain
  project/group-owned until a native mapping is verified.
- Sessions: PromptHub opens only regular paired `inbound.db` / `outbound.db`
  stores under `data/v2-sessions/<group>/<session>`, validates their current
  message schemas and projects chat/chat-sdk user and assistant text. Operation
  records and non-visible payloads remain excluded; no native resume command is
  claimed.
- Capability boundary: Sessions is `supported`; Provider, Usage, CLI
  maintenance, MCP and Rules remain `planned`; path-level Agent/Skill
  management is `partial`.

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
  - PromptHub exposes the verified Cline CLI global entry at
    `~/.cline/data/settings/rules/AGENTS.md`. Other CLI rule files and the IDE
    compatibility directory remain Cline-managed and are not inventoried by
    the current single-entry Rules projection.
  - Cline's documented plugin surface applies to Cline SDK / CLI / Kanban and uses `AgentPlugin` entrypoints for tools/hooks/commands. It is runtime-only for PromptHub Plugin planning, not a first-version bundle adapter for the VSCode / JetBrains extension runtime.
  - History is read-only and partial: current Cline sessions use
    `~/.cline/data/sessions/sessions.db` as a bounded metadata index with
    `<session-id>.json` snapshots as the authoritative state; older tasks use
    `~/.cline/data/tasks/<taskId>/api_conversation_history.json` with optional
    `task_metadata.json`. PromptHub exposes visible user/assistant text only,
    hides tool payloads, supports `cline --id <session-id>`, and never starts
    the Cline hub or mutates native session files.

### CodeBuddy

- Root: `~/.codebuddy`
- Rules and context:
  - user memory / instruction file: `~/.codebuddy/CODEBUDDY.md`
  - project memory / instruction file: `CODEBUDDY.md`
  - SDK reference documents modular `rules/` as part of the agent package surface
- MCP config:
  - user/global: `~/.codebuddy/.mcp.json`
  - project/workspace: `.mcp.json`
  - config shape: JSON / JSONC with top-level `mcpServers`
- Reusable assets:
  - user skills: `~/.codebuddy/skills/`
  - project skills: `.codebuddy/skills/`
  - user agents: `~/.codebuddy/agents/`
  - project agents: `.codebuddy/agents/`
  - commands, hooks, plugins, and plugin marketplaces are documented
  - plugin packages use `.codebuddy-plugin/plugin.json` and can include commands, agents, hooks, MCP servers, and other assets
- Config:
  - `~/.codebuddy/settings.json`
  - `.codebuddy/settings.json`
  - `.codebuddy/settings.local.json`
- Modeling note:
  - PromptHub keeps the existing `codebuddy` platform id, but the model is no longer skills-only. Settings, MCP, memory, agents, and commands should be surfaced as derived assets from the same root.

### Cursor

- Root convention in PromptHub: `~/.cursor`
- Officially confirmed assets in current pass:
  - `.cursor/rules/` for project rules
  - root and nested `AGENTS.md`
  - user `~/.cursor/skills/` and project `.cursor/skills/`
  - user `~/.cursor/agents/` and project `.cursor/agents/`
  - user `~/.cursor/mcp.json` and project `.cursor/mcp.json`
  - Cursor Plugin packages use `.cursor-plugin/plugin.json`; current runtime
    stores Marketplace packages below `~/.cursor/plugins/cache/` and local test
    packages below `~/.cursor/plugins/local/`
  - user rules and team rules exist as product concepts, with user rules owned
    by Cursor Settings
- History boundary:
  - Cursor documents local chat History and the CLI `ls` / `--resume`
    workflow.
  - The current local runtime stores visible transcript exports below
    `~/.cursor/projects/<project>/agent-transcripts/<session-id>/` as a JSONL
    file named after the session id. PromptHub reads this export read-only,
    with bounded pagination/search and visible user/assistant projection.
  - PromptHub exposes `cursor-agent --resume <chat-id>` metadata but does not
    read Cursor's private SQLite history index, checkpoints, snapshots,
    authentication state, caches, or remote Background Agent chats.
- Not confirmed in current pass:
  - a canonical local global-rule file pathname
  - a durable Provider or programmatic quota contract
  - a non-interactive native Plugin install/load command with a verified
    activation and rollback contract
- Modeling note:
  - PromptHub exposes user Skills, SubAgents, MCP, and read-only Plugin
    discovery from the canonical root. Project assets remain owned by their
    existing domains.
  - It is intentionally not listed in the current `Rules` global whitelist
    because user Rules are settings-owned and no stable local equivalent to
    `CLAUDE.md` or `GEMINI.md` is documented.
  - Provider, Usage, Maintenance, and Plugin distribution remain planned.
    Sessions are partial and read-only through the transcript export above.
    Private settings databases, auth state, snapshots, caches, logs, and
    runtime state are excluded rather than reverse-engineered.

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
  - opt-in transcript hooks write JSONL to `~/.windsurf/transcripts/<trajectory_id>.jsonl`
  - PromptHub reads only public `user_input.user_response` and
    `planner_response.response` fields from those exports; it does not parse
    proprietary `~/.codeium/windsurf/cascade/*.pb` runtime state
- Reusable assets:
  - workspace skills: `.windsurf/skills/<name>/SKILL.md`
  - global skills: `~/.codeium/windsurf/skills/<name>/SKILL.md`
  - workspace workflows: `.windsurf/workflows/*.md`
  - global workflows: `~/.codeium/windsurf/global_workflows/*.md`
  - compatible skill discovery: `.agents/skills/`, `~/.agents/skills/`, optional `.claude/skills/`
- Integration boundary:
  - MCP config: `~/.codeium/windsurf/mcp_config.json`
  - user hooks: `~/.codeium/windsurf/hooks.json`
  - workspace hooks: `.windsurf/hooks.json`
  - transcript export is optional, read-only, sensitive, and version-tolerant;
    unknown steps, code actions, tool payloads, and file contents remain hidden
  - Provider, Usage, generic Config editing, Maintenance, and native Plugin
    installation remain unclaimed
- Modeling note:
  - Windsurf exposes stable paths for rules, skills, workflows, hooks, MCP, and
    opt-in transcript exports. Sessions are therefore `partial`, not fully
    supported: PromptHub cannot resume, mutate, or reconstruct proprietary
    Cascade state.

### Kiro

- Root: `KIRO_HOME` or `~/.kiro`
- CLI settings:
  - `~/.kiro/settings/cli.json`
  - PromptHub projects only `chat.defaultModel`
  - authentication, endpoints, credentials, and account state remain Kiro-owned
- Steering assets:
  - workspace steering: `.kiro/steering/`
  - global steering: `~/.kiro/steering/`
  - foundational steering files: `product.md`, `tech.md`, `structure.md`
  - `AGENTS.md` accepted in workspace root or `~/.kiro/steering/`
- Skill assets:
  - workspace skills: `.kiro/skills/`
  - global skills: `~/.kiro/skills/`
  - skills can also be invoked from slash-command UI
- Agent assets:
  - workspace agents: `.kiro/agents/`
  - global agents: `~/.kiro/agents/`
- MCP config:
  - user/global: `~/.kiro/settings/mcp.json`
  - workspace/project: `.kiro/settings/mcp.json`
  - workspace MCP settings override user MCP settings
- Inclusion model:
  - steering supports `always`, `fileMatch`, `manual`, and `auto`
  - manual and auto steering files surface like commands, but Kiro does not present a separate dedicated local `commands/` directory in current docs
- Modeling note:
  - PromptHub exposes the verified user-level entry
    `<KIRO_HOME>/steering/AGENTS.md` through Rules. Other steering files and
    inclusion modes remain Kiro-managed and are not represented as complete
    directory support.
  - locally verified CLI session metadata and JSONL are read-only runtime
    evidence, not a claimed public stable schema. PromptHub exposes only
    visible Prompt/Assistant `text` content, rejects unsafe files, hides
    thinking/tool/result records, and provides no resume action.
  - existing Power directories may be inventoried, but direct copying is not
    native installation. Distribution remains disabled until Kiro import or
    registration can be confirmed and rolled back.

### Kilo Code MCP Status

- PromptHub tracks Kilo Code as a separate `kilo` Skill/Rules/MCP platform, not as an alias for Kiro.
- Kilo Code MCP config uses the root `mcp` key. Local servers use `type: "local"` with a combined `command` array and optional `environment`; remote servers use `type: "remote"` with `url` and optional `headers`.
- Global config: canonical `~/.config/kilo/kilo.jsonc`; `.json` remains a compatibility input.
- Project config: `<projectRoot>/kilo.jsonc` or `<projectRoot>/.kilo/kilo.jsonc`; the `.kilo` path takes priority when both exist.
- Global Skills remain under `~/.kilo/skills/`, while global instructions and custom Agents live under `~/.config/kilo/AGENTS.md` and `~/.config/kilo/agents/`. This is a real split-root contract, not one synthetic Kilo root.
- PromptHub's built-in MCP UI exposes one default Kilo Code target per scope. Compatible JSON/JSONC/custom paths are parsing inputs, not duplicate Agent MCP or Project MCP cards.
- Kilo JSONC config reads and writes must preserve comments, trailing commas and unrelated fields. Normalizing the complete file to plain JSON is not an acceptable default write policy.
- Current implementation debt: the shared platform/Rules registry still projects `~/.kilo/rules/global.md`. That legacy PromptHub path is not a current first-party global instruction contract and remains planned until an additive multi-root path contract and compatibility policy are approved.
- Sessions: PromptHub reads regular JSON records below
  `~/.local/share/kilo/storage/session`, `message` and `part`; only
  user/assistant `type: text` parts enter History, search and export. Reasoning,
  tool, snapshot and step records remain Kilo-owned and hidden.
- Session list/detail reads are bounded and paginated without a silent catalog
  cutoff. Original-Agent continuation uses `kilo --session <sessionId>` with
  the verified absolute project directory. PromptHub never edits these files.

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
  - current Copilot CLI uses `COPILOT_HOME` or `~/.copilot` as the user root
  - PromptHub models only documented user-owned files and directories; it does
    not copy or vendor Copilot source
  - repository-level instructions remain a separate project-context contract
- User-owned assets:
  - `settings.json` is JSONC; PromptHub may inspect and update only its top-level
    `model` preference
  - `copilot-instructions.md`, `instructions/`, `skills/`, `agents/`,
    `mcp-config.json`, `lsp-config.json`, and hooks remain independently owned
    asset surfaces
  - BYOK provider endpoint, wire type, model override, API key and bearer token
    are process environment variables, not a durable Provider Profile format
- Official instruction assets:
  - `<COPILOT_HOME>/copilot-instructions.md` for user-wide CLI instructions
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
  - Copilot is in the global Rules whitelist through the documented user file;
    repository instruction trees are not flattened into that file.
  - PromptHub may discover `installed-plugins/`, but direct filesystem writes do
    not constitute a Copilot installation. Installation and registration must
    use the native `copilot plugin install` workflow before Plugin distribution
    can be marked supported.
  - Do not describe Copilot as natively supporting Codex `.codex-plugin`; describe PromptHub as adapting a Plugin inventory into Copilot / VS Code Agent Plugin format.
- Excluded platform-managed state:
  - `config.json`, permission state, `session-state/`, `mcp-oauth-config`,
    `mcp-secrets`, logs, native authentication, and Plugin registration metadata
    are excluded from generic config editing and ordinary backup/sync
  - `session-store.db` is also excluded from editing, migration, backup and
    sync; the separate History adapter opens it read-only and projects only
    bounded metadata plus visible user/assistant text

### Tencent WorkBuddy

- Root: `~/.workbuddy` for the user-level MCP config family.
- MCP config:
  - user/global: `~/.workbuddy/mcp.json`
  - project/workspace: `.workbuddy/mcp.json`
  - config shape: JSON with top-level `mcpServers`
  - official examples include WeCom robot MCP configuration.
- Reusable assets:
  - Skill Marketplace is documented as a product surface.
  - custom WorkBuddy Skills are documented as a package containing `skill.yml`, implementation files, and `README`.
  - current public docs do not confirm a stable local installed-skill directory; PromptHub uses `skills/` as a conservative root-derived compatibility surface.
- Modeling note:
  - WorkBuddy is supported as `workbuddy` with MCP target presets because the MCP paths are explicit official contracts.
  - Do not model WorkBuddy remote-control chat connectors such as WeCom, Feishu, DingTalk, QQ, Slack, Telegram, or Discord as separate Agent platforms; they are connector/remoting surfaces of WorkBuddy.

### Amp

- Root:
  - macOS/Linux: `~/.config/amp`
  - Windows: `%USERPROFILE%\.config\amp`
  - PromptHub retains its former `%APPDATA%\amp` Windows root only as a
    compatibility fallback.
- Skills:
  - user precedence begins with `~/.config/agents/skills/`,
    `~/.agents/skills/`, then `~/.config/amp/skills/`
  - project-native Skills live in `.agents/skills/`
  - `.claude/skills/` and `~/.claude/skills/` are compatibility inputs
- Rules:
  - global `~/.config/amp/AGENTS.md` and `~/.config/AGENTS.md`
  - project and subtree `AGENTS.md`, with `AGENT.md`/`CLAUDE.md` fallbacks
- MCP:
  - global `~/.config/amp/settings.json` or `settings.jsonc`
  - project nearest `.amp/settings.json` or `settings.jsonc`
  - literal top-level key `amp.mcpServers`
  - workspace MCP servers require approval in Amp; PromptHub does not bypass
    or claim that trust decision
- Plugins:
  - project `.amp/plugins/*.ts`
  - user `~/.config/amp/plugins/*.ts`
  - executable TypeScript discovery is not native installation or trust, so
    PromptHub keeps Plugin distribution disabled
- Modeling note:
  - Amp-owned modes/models do not define a user-managed Provider projection;
    Provider is unsupported in the current PromptHub boundary.
  - hosted threads, account/cost state, OAuth cache and workspace-managed
    global Plugins remain Amp-owned and are excluded from ordinary backup and
    raw editing.
  - Launch, Usage, Sessions, Maintenance and Config Files remain planned even
    though `amp`, `amp update` and settings paths are documented; each still
    requires its own bounded product adapter.

### Grok Build

- Root: `~/.grok` by default; `GROK_HOME` can override the home directory.
- PromptHub-managed user assets: `~/.grok/skills/` and `~/.grok/AGENTS.md` through the existing Skill and Rules workflows.
- Discovery-only user assets: `~/.grok/plugins/`, `~/.grok/agents/`, and `~/.grok/commands/`. The current Plugin library does not advertise Grok bundle distribution until a Grok-specific target adapter is implemented.
- Provider-managed user configuration: PromptHub can inspect and update only the public model projection in `<root>/config.toml`: `[models].default` and `[model.<alias>]` fields `model`, `base_url`, `name`, `env_key`, `api_backend`, and optional `context_window`. Supported direct backends are `chat_completions`, `responses`, and `messages`; unrelated TOML fields and formatting semantics remain platform-owned.
- Preview-only user configuration: `<root>/pager.toml`, `<root>/settings.json`, `<root>/lsp.json`, and `<root>/sandbox.toml`.
- Project discovery assets: `.grok/skills/`, `.grok/plugins/`, `.grok/agents/`, `.grok/hooks/`, `.grok/config.toml`, `.grok/lsp.json`, and `.grok/sandbox.toml`. The current built-in platform does not write project-scoped Grok configuration.
- Instructions: Grok Build reads global `~/.grok/AGENTS.md`, supported instruction filenames from the repository root to the current directory, and `.grok/rules/*.md`; Claude Code and Cursor compatibility can add their instruction surfaces.
- Agent customization: user/project agents are in `agents/`; user/project roles and personas are in `roles/` and `personas/`; hooks are in `hooks/`. These are recognized Grok assets but not individually managed by the current PromptHub platform model.
- Runtime and protected assets: `auth.json`, `mcp_credentials.json`, `sessions/`, `memory/`, `worktrees/`, `worktrees.db`, `logs/`, `bundled/`, `marketplace-cache/`, and installed-plugin runtime state remain Grok-owned. PromptHub must not write credentials, histories, tool-managed bundled files, caches, or runtime metadata.
- Provider credential boundary: native session/OIDC and `XAI_API_KEY` remain Grok-owned. PromptHub custom Provider Profiles store an environment-variable name only; the value is resolved only by main-process probes and is never projected into `config.toml`, renderer state, logs, exports, or ordinary backups. Existing inline `api_key` values and sensitive headers are redacted and read-only.
- Provider mutation safety: activation requires an encrypted full-config backup, expected-digest validation, atomic replacement, semantic reread verification, and rollback or new-file removal on failure. Unknown TOML fields are preserved and symlinked, oversized, malformed, or out-of-root input is rejected.
- Sessions: PromptHub reads only `sessions/<encoded-project>/<session-id>/summary.json` plus the selected `chat_history.jsonl`, filters runtime/tool records from the transcript, bounds all reads, and exposes `grok --resume <id>` metadata without editing Grok state.
- MCP: Grok Build documents user and project `config.toml` with `[mcp_servers.<name>]`. PromptHub shows `~/.grok/config.toml` as the derived MCP configuration path, but does not expose it as an MCP distribution preset because Grok uses remote `headers` while the current Codex TOML adapter writes `http_headers`.
- Visual identity: PromptHub uses the current Grok icon in exact black and white treatments for light and dark themes. xAI's official brand guidelines and downloadable Grok asset pack are the provenance boundary; the mark is used only to identify the Grok Build target.
- Modeling note: PromptHub supports user-root Skill distribution, global rules, bounded sessions, and the verified user-level Provider & Model projection as built-in platform `grok`; it does not install the CLI, manage xAI authentication, write project config automatically, or advertise incomplete Plugin/MCP distribution. The adapter independently implements the public contract and does not copy or vendor Grok Build or CC Switch source.

### Qwen Code

- Identity: built-in platform id `qwen`, display name `Qwen Code`. It is separate from `qoder` and does not reuse `~/.qoder`.
- Root: user configuration and assets resolve from `QWEN_HOME`, falling back to `~/.qwen`. `QWEN_RUNTIME_DIR` independently relocates conversations, logs, and todos; project `.qwen/` paths are unaffected by either user-root convention.
- Skills: user `<root>/skills/<name>/SKILL.md` and project `.qwen/skills/<name>/SKILL.md`. Current official documentation does not establish user-level `~/.agents/skills/` discovery, so PromptHub does not label that combination compatible without a runtime fixture. PromptHub manages the whole Skill package, not only `SKILL.md`, and writes to native Qwen locations unless the user explicitly selects an experimental shared target.
- SubAgents: user `<root>/agents/*.md`, project `.qwen/agents/*.md`, with YAML frontmatter and Markdown instructions. PromptHub exposes them through a Qwen-only, bounded, read-only Definitions inventory; Qwen remains their lifecycle owner.
- Rules and memory: global `<root>/QWEN.md`, shared project `QWEN.md`, and personal project `.qwen/QWEN.local.md`. Auto-memory below runtime project data and opt-in `.qwen/team-memory/` remain Qwen-owned and do not enter the Rules workspace or ordinary backup/sync.
- MCP: user `<root>/settings.json` and project `.qwen/settings.json` use `mcpServers`; transports include stdio, streamable HTTP, and SSE. PromptHub must preserve unrelated settings and redact command environment values, headers, OAuth client secrets, and token files.
- Extensions and commands: extensions live under user/project `extensions/<name>/qwen-extension.json`; commands live under user/project `commands/`. PromptHub recursively discovers user/project commands through the same bounded, read-only Definitions inventory. Extension-provided Skills, SubAgents, MCP servers, commands, and hooks remain derived children of the extension bundle and must not be double-owned.
- Provider/config: `settings.json` is layered with defaults, user, project, system override, environment, and CLI precedence. Current `$version: 4` stores bare model arrays at `modelProviders[providerId]`; custom provider ids require `providerProtocol`, active selection uses `security.auth.selectedType` plus `model.name`, and model identity is provider id + `id` + normalized `baseUrl`. PromptHub-owned direct credentials are projected to user `<root>/.env` under the public model `envKey`, never to deprecated `security.auth.apiKey` / `security.auth.baseUrl`. Vertex ADC, legacy Qwen OAuth, automatic Coding Plan credentials, custom headers, and credentials not owned by the Profile remain redacted and read-only.
- Sessions: PromptHub uses the native bounded `qwen sessions list --json --limit` surface and `qwen --resume <id>` arguments instead of recursive runtime scanning. A 256-entry process-local metadata window keeps deep-page results readable without persisting transcript bodies; selected transcript realpaths are revalidated below `QWEN_RUNTIME_DIR` before every read, and internal paths never enter list results. Malformed rows are isolated. Session bodies, runtime sidecars, logs, and todos remain local and platform-owned.
- Visual identity: bundled 512x512 icon comes from `QwenLM/qwen-code` commit `760ffd7a4dc4db7834c68fba6533fa15e17accaa`, path `packages/desktop/apps/electron/resources/brands/qwen-code/icon.png`; bundled SHA-256 is `02dac7ae657ddd32793b55cb63c00497807d1b6cf55343cea2b97120d048839a`.
- Current PromptHub status: registry, icon, root resolution, native/read-only-compatible Skill discovery, global/project MCP presets, global Rules, extension bundle discovery, redacted model config, bounded read-only Sessions, and Qwen-only user/project SubAgent plus Command discovery are implemented. Definition bodies and absolute paths remain main-process-only; extension children, raw secret-bearing settings, and Usage remain unavailable or planned. The UI capability matrix must preserve those distinctions.

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

### Doubao Work

- Identity: built-in platform id `doubao`, display name `Doubao Work`; the
  desktop application remains `/Applications/Doubao.app` on verified macOS.
- Root and Skills: verified macOS root
  `~/Library/Application Support/Doubao/Default/.doubao/agent_mode/workspace`;
  user Skills live in `.user_skills/<name>/SKILL.md` and use the existing
  whole-package Skill lifecycle.
- Ownership: `.skills` contains Doubao's bundled Skills and is never a
  PromptHub write target. `~/Doubao/skills`, `~/.codex/skills`, and
  `~/.agents/skills` are not Doubao's default user Skill target.
- Detection and launch: the initialized workspace qualifies the Agent as
  installed; the macOS launch allowlist contains the system and user
  Applications bundle locations.
- Visual identity: reuse the existing PromptHub Doubao provider mark; no second
  brand asset is added.
- Current boundary: Skills, detection, launch, and path overrides are modeled.
  Provider, MCP, Rules, Plugins, Config Files, Sessions, Usage, and maintenance
  remain planned until native contracts are verified. Windows/Linux roots are
  conservative application-data templates rather than locally verified paths.

## Agent Edit Contract

- Built-in Agent path editing is registry-driven. `skillsRelativePath`,
  `globalRuleFile`, `mcpRelativePath`, `pluginsRelativePath`,
  `agentsRelativePath`, `commandsRelativePath`, and non-empty `configFiles`
  independently control whether the corresponding user-level field appears.
- PromptHub does not infer generic `agents/` or `commands/` directories for a
  built-in platform. An existing explicit override remains visible so users can
  clear or repair older settings without data loss.
- Custom Agents expose the complete path schema because their directory model
  is user-owned. Both the Agent workspace dialog and Settings use the same
  adapter and persistence actions.
- Commands paths currently declared by the registry are limited to platforms
  whose entries above already record a stable user-level directory: Gemini,
  OpenCode, Reasonix, Augment, ZCode, Grok Build, Qwen Code and CodeBuddy.

## Agent Workspace Visibility Contract

- The platform registry remains complete, but the Agents management workspace
  lists only platforms detected as locally installed. A configured template,
  root override or pinned id does not make an undetected platform manageable.
- Sidebar count, search, normal selection and detail use the same installed-only
  projection. Detection refresh adds an Agent after installation and removes it
  when the installation is no longer detected.
- Stale undetected detail state is read-protected: only Overview is enabled,
  all other tabs are disabled, and no config, asset, session, provider,
  appearance or usage reader is mounted.

## Evidence Links

- Claude Code memory and CLAUDE.md: `https://docs.anthropic.com/en/docs/claude-code/memory`
- Codex AGENTS.md: `https://developers.openai.com/codex/guides/agents-md`
- Codex config basics: `https://developers.openai.com/codex/config-basic`
- Codex memories: `https://developers.openai.com/codex/memories`
- Codex Chronicle: `https://developers.openai.com/codex/memories/chronicle`
- Codex skills: `https://developers.openai.com/codex/skills`
- ZCode Agent: `https://zcode.z.ai/en/docs/agents`
- ZCode Skills: `https://zcode.z.ai/en/docs/skill`
- ZCode MCP servers: `https://zcode.z.ai/en/docs/mcp-services`
- ZCode Plugins: `https://zcode.z.ai/en/docs/plugin`
- Grok Build overview: `https://docs.x.ai/build/overview`
- Grok Build Skills and Plugins: `https://docs.x.ai/build/features/skills-plugins-marketplaces`
- Grok Build settings: `https://docs.x.ai/build/settings`
- Grok Build MCP servers: `https://docs.x.ai/build/features/mcp-servers`
- xAI brand guidelines and official Grok logo download: `https://x.ai/legal/brand-guidelines`
- Qwen Code repository: `https://github.com/QwenLM/qwen-code`
- Qwen Code settings: `https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md`
- Qwen Code Skills: `https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md`
- Qwen Code SubAgents: `https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/sub-agents.md`
- Qwen Code MCP: `https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md`
- Qwen Code memory and rules: `https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md`
- Qwen Code commands: `https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/commands.md`
- Qwen Code Extensions: `https://github.com/QwenLM/qwen-code/blob/main/docs/users/extension/introduction.md`
- Gemini CLI GEMINI.md: `https://www.geminicli.com/docs/cli/gemini-md`
- Gemini CLI settings: `https://www.geminicli.com/docs/cli/settings`
- Gemini CLI skills: `https://www.geminicli.com/docs/cli/skills/`
- Gemini CLI auto memory: `https://www.geminicli.com/docs/cli/auto-memory/`
- Gemini CLI session management: `https://www.geminicli.com/docs/cli/tutorials/session-management/`
- Gemini CLI custom commands: `https://www.geminicli.com/docs/cli/custom-commands/`
- Gemini CLI current release notes: `https://github.com/google-gemini/gemini-cli/blob/main/docs/changelogs/index.md`
- Gemini CLI to Antigravity transition announcement: `https://github.com/google-gemini/gemini-cli/discussions/27274`
- Google Antigravity CLI overview: `https://antigravity.google/docs/cli-overview`
- Google Antigravity installation: `https://antigravity.google/docs/cli-install`
- Google Antigravity Skills: `https://antigravity.google/docs/skills`
- Google Antigravity Rules and workflows: `https://antigravity.google/docs/rules-workflows`
- Google Antigravity MCP: `https://antigravity.google/docs/mcp`
- Google Antigravity Plugins: `https://antigravity.google/docs/plugins`
- Google Antigravity CLI settings: `https://antigravity.google/docs/cli-using`
- Google Antigravity Gemini CLI migration guide: `https://antigravity.google/docs/gcli-migration`
- Google Antigravity CLI source and current conversation command: `https://github.com/google-antigravity/antigravity-cli`
- OpenCode rules: `https://opencode.ai/docs/rules`
- OpenCode agents: `https://opencode.ai/docs/agents`
- OpenCode config: `https://opencode.ai/docs/config`
- OpenCode skills: `https://opencode.ai/docs/skills`
- OpenCode CLI database/session/export commands: `https://opencode.ai/docs/cli/`
- OpenClaw SOUL.md: `https://docs.openclaw.ai/concepts/soul`
- OpenClaw workspace: `https://docs.openclaw.ai/concepts/agent-workspace.md`
- OpenClaw memory: `https://docs.openclaw.ai/concepts/memory`
- OpenClaw sessions: `https://docs.openclaw.ai/reference/session-management-compaction`
- OpenClaw logging: `https://docs.openclaw.ai/gateway/logging`
- Cursor rules: `https://cursor.com/docs/context/rules`
- Cursor skills: `https://cursor.com/docs/context/skills`
- Cursor subagents: `https://cursor.com/docs/agent/subagents`
- Cursor Plugin reference: `https://cursor.com/docs/reference/plugins`
- Cursor official Plugin repository: `https://github.com/cursor/plugins`
- Cursor CLI overview and parameters: `https://docs.cursor.com/en/cli/overview`,
  `https://docs.cursor.com/en/cli/using`,
  `https://docs.cursor.com/en/cli/reference/parameters`
- Cursor local History: `https://docs.cursor.com/en/agent/chat/history`
- Windsurf / Devin Desktop memories and rules: `https://docs.devin.ai/desktop/cascade/memories`
- Windsurf / Devin Desktop AGENTS.md: `https://docs.devin.ai/desktop/cascade/agents-md`
- Windsurf / Devin Desktop skills: `https://docs.devin.ai/desktop/cascade/skills`
- Windsurf / Devin Desktop workflows: `https://docs.devin.ai/desktop/cascade/workflows`
- Windsurf / Devin Desktop MCP: `https://docs.devin.ai/desktop/cascade/mcp`
- Windsurf / Devin Desktop hooks and transcript export: `https://docs.devin.ai/desktop/cascade/hooks`
- Kiro steering: `https://kiro.dev/docs/steering/`
- Kiro agent skills: `https://kiro.dev/docs/skills/`
- Kiro MCP: `https://kiro.dev/docs/mcp/`
- Kiro CLI settings: `https://kiro.dev/docs/cli/reference/settings/`
- Kiro CLI commands: `https://kiro.dev/docs/cli/reference/cli-commands/`
- Kiro CLI models: `https://kiro.dev/docs/cli/models/`
- Kiro Power installation: `https://kiro.dev/docs/powers/installation/`
- Roo Code custom instructions: `https://docs.roocode.com/features/custom-instructions`
- Roo Code skills: `https://docs.roocode.com/features/skills`
- Roo Code slash commands: `https://docs.roocode.com/features/slash-commands`
- Roo Code checkpoints: `https://docs.roocode.com/features/checkpoints`
- GitHub Copilot repository custom instructions: `https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot`
- GitHub Copilot CLI configuration directory: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference`
- GitHub Copilot CLI command reference: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference`
- GitHub Copilot CLI plugin reference: `https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference`
- VS Code Agent Plugins: `https://code.visualstudio.com/docs/agent-customization/agent-plugins`
- TRAE Work CN docs entry: `https://docs.trae.cn`
- SkillManager README supported agents snapshot: `https://raw.githubusercontent.com/eatmoreduck/SkillManager/master/README.md`
- Cline config layout: `https://docs.cline.bot/getting-started/config`
- Cline skills: `https://docs.cline.bot/customization/skills.md`
- Cline rules: `https://docs.cline.bot/customization/cline-rules`
- Cline session persistence: `https://docs.cline.bot/sdk/architecture/hub-spoke`,
  `https://docs.cline.bot/sdk/clinecore`, and
  `https://docs.cline.bot/cli/cli-reference`
- Kilo Code custom rules: `https://kilo.ai/docs/customize/custom-rules`
- Kilo Code skills: `https://kilo.ai/docs/customize/skills`
- Kilo Code agents.md: `https://kilo.ai/docs/customize/agents-md`
- Kilo Code MCP in CLI: `https://kilo.ai/docs/automate/mcp/using-in-cli`
- Kilo Code MCP in Kilo Code: `https://kilo.ai/docs/automate/mcp/using-in-kilo-code`
- Kilo Code CLI session list/export/resume:
  `https://kilo.ai/docs/code-with-ai/platforms/cli`
- Kilo Code CLI `--session` reference:
  `https://kilo.ai/docs/code-with-ai/platforms/cli-reference`
- Qoder / Qwen Cloud developer tools: `https://docs.qwencloud.com/developer-guides/clients-and-developer-tools/qoder`
- Qoder Hooks and transcript JSONL contract: `https://docs.qoder.com/extensions/hooks`
- Qoder CLI commands and interactive resume: `https://docs.qoder.com/cli/command`
- QoderWork Hooks boundary: `https://docs.qoder.com/qoderwork/hooks`
- Kimi Code data locations: `https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html`
- Kimi Code configuration files: `https://moonshotai.github.io/kimi-code/en/configuration/config-files.html`
- Kimi Code providers: `https://moonshotai.github.io/kimi-code/en/configuration/providers.html`
- Kimi Code sessions: `https://moonshotai.github.io/kimi-code/en/guides/sessions.html`
- Kimi Code command reference: `https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html`
- Kimi Code migration: `https://moonshotai.github.io/kimi-code/zh/guides/migration.html`
- Reasonix repository: `https://github.com/esengine/DeepSeek-Reasonix`
- Reasonix configuration paths: `https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/docs/CONFIG_PATHS.md`
- Reasonix guide: `https://github.com/esengine/DeepSeek-Reasonix/blob/main-v2/docs/GUIDE.md`
- Augment Skills: `https://docs.augmentcode.com/cli/skills`
- Augment rules: `https://docs.augmentcode.com/cli/rules`
- Augment user guidelines: `https://docs.augmentcode.com/setup-augment/guidelines`
- Augment CLI reference: `https://docs.augmentcode.com/cli/reference`
- Augment MCP: `https://docs.augmentcode.com/cli/integrations`
- Cherry Studio storage locations: `https://docs.cherry-ai.com/advanced-basic/data-storage-location`
- Cherry Studio current source contract at revision
  `08a20020fbdae1d667af1633170010867670a695`:
  - path registry:
    `https://github.com/CherryHQ/cherry-studio/blob/08a20020fbdae1d667af1633170010867670a695/src/main/core/paths/pathRegistry.ts`
  - Agent session schema:
    `https://github.com/CherryHQ/cherry-studio/blob/08a20020fbdae1d667af1633170010867670a695/src/main/data/db/schemas/agentSession.ts`
  - Agent session message schema:
    `https://github.com/CherryHQ/cherry-studio/blob/08a20020fbdae1d667af1633170010867670a695/src/main/data/db/schemas/agentSessionMessage.ts`
  - Skill service:
    `https://github.com/CherryHQ/cherry-studio/blob/08a20020fbdae1d667af1633170010867670a695/src/main/ai/skills/SkillService.ts`
  - v2 database migration reference:
    `https://github.com/CherryHQ/cherry-studio/blob/08a20020fbdae1d667af1633170010867670a695/src/main/data/migration/v2/README.md`

## Oh My Pi Evidence

- Evidence was re-audited at upstream revision
  `cc00ab161b2721e50d8a96a0dc9552abfd258b8b`; PromptHub reuses the public
  contracts only and does not copy or vendor upstream source.
- Repository and Skills:
  `https://github.com/can1357/oh-my-pi/tree/cc00ab161b2721e50d8a96a0dc9552abfd258b8b`
  and
  `https://github.com/can1357/oh-my-pi/blob/cc00ab161b2721e50d8a96a0dc9552abfd258b8b/docs/skills.md`
- Settings and root precedence:
  `https://github.com/can1357/oh-my-pi/blob/cc00ab161b2721e50d8a96a0dc9552abfd258b8b/docs/settings.md`
- Model/provider configuration and credential ownership:
  `https://github.com/can1357/oh-my-pi/blob/cc00ab161b2721e50d8a96a0dc9552abfd258b8b/docs/models.md`
  and
  `https://github.com/can1357/oh-my-pi/blob/cc00ab161b2721e50d8a96a0dc9552abfd258b8b/docs/providers.md`
- Session switching and recent listing:
  `https://github.com/can1357/oh-my-pi/blob/cc00ab161b2721e50d8a96a0dc9552abfd258b8b/docs/session-switching-and-recent-listing.md`

## Pi Evidence

- Product, assets and CLI:
  `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md`
- Settings and root override:
  `https://pi.dev/docs/latest/environment-variables`
- Built-in provider composition, `models.json` and `modelOverrides` semantics:
  `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md`
- Session format:
  `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session.md`
- MCP adapter package and supported config discovery:
  `https://pi.dev/packages/pi-mcp-adapter`
- Oh My Pi MCP configuration and precedence:
  `https://github.com/can1357/oh-my-pi/blob/main/docs/mcp-config.md`

## Canonical Sources

- 平台元数据源码：`packages/shared/constants/platforms.ts`
- Doubao Work macOS evidence: local `Doubao 2.27.10` bundle metadata and its
  bundled `workspace/.skills/skill-creator-for-work/SKILL.md` default-location
  contract, inspected 2026-09-02.
- Rules 注册表源码：`packages/shared/constants/rules.ts`
- 平台路径派生逻辑：`apps/desktop/src/main/services/skill-installer-utils.ts`
- CoPaw / QwenPaw: `https://github.com/agentscope-ai/QwenPaw`,
  `https://www.copaw.uk/`
- AutoClaw: `https://autoclaw.zhipuai.cn/`
- NanoClaw: `https://github.com/nanocoai/nanoclaw`
- QClaw: `https://intl.cloud.tencent.com/zh/document/product/1300/81043`
