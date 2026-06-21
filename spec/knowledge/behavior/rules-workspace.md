# Rules Workspace Logic

## Purpose

本文件记录 PromptHub `Rules` 模块的稳定逻辑语义，包括分组方式、文件选择模型、项目规则来源和路径派生约束。

## Stable Logic

### 1. Rules Is A Workspace, Not A Platform Detector

- `Rules` 模块的职责是集中管理规则文件。
- 它不是“平台安装检测面板”，因此左侧不应使用“已识别 / 未识别”作为主要信息架构。

### 2. Sidebar Information Architecture

- 左侧必须分为两组：
  - `全局规则`
  - `项目规则`
- `全局规则` 展示由共享平台注册表声明的已知全局规则文件。
- `项目规则` 只展示用户手动添加目录的 canonical 项目规则文件。

### 3. Current Project vs Added Project

- `Rules` 不再内置“当前项目”伪规则项。
- 用户手动添加的项目目录会被迁移为 `data/rules/projects/` 下的托管规则记录。
- 每个手动项目目录当前只管理一个 canonical 文件：`AGENTS.md`。

### 4. Rule File Identifier Model

- 内置全局规则文件使用稳定 id，例如：
  - `claude-global`
  - `codex-global`
  - `gemini-global`
  - `opencode-global`
  - `windsurf-global`
- 手动项目规则使用动态 id：`project:<project-id>`
- CLI 操作项目规则时必须支持 cwd-aware 初始化：
  - `prompthub rules project-init` 默认把当前工作目录注册为项目规则目录
  - 未传 `--name` 时使用当前目录 basename 作为项目名称
  - 未传 `--root-path` 时使用 `process.cwd()` 解析出的绝对路径
- CLI 读取、保存、重写和版本操作规则时，应允许使用 rule id、显示名称、平台名称或查询词解析规则；非交互模式遇到多个匹配项必须返回冲突，不得静默选择。

### 5. Global Rule Support Is Explicit, Not Automatic

- 平台在 `spec/knowledge/reference/agent-platforms.md` 中“有官方文档”并不等于它会自动进入 `Rules` 运行时支持集合。
- 当前 `Rules` 模块的全局规则区只建模“每个平台一个稳定、可直接编辑的 canonical 全局规则文件”。
- 因此，新增全局规则支持需要同时满足：
  - 该平台存在稳定公开的用户级文件路径
  - 该文件能被当前 `Rules` UI 以单文件模型清晰表达
  - 路径可由 `packages/shared/constants/platforms.ts` 稳定派生，不依赖额外探测
- `OpenClaw` 虽然已有充分公开文档，但其长期上下文表面是 `~/.openclaw/workspace/` 下的一组 bootstrap files，至少包含 `AGENTS.md`、`SOUL.md`、`USER.md`、`IDENTITY.md`、`TOOLS.md`，并不等同于当前 `Rules` 模块支持的“单一全局规则文件”模型。
- 因此，`OpenClaw` 当前仍停留在“资产文档已建模、运行时 Rules 暂未接入”的状态；除非后续明确扩展 `Rules` 为多文件 workspace-context 模型，否则不应仅因官方证据变充分就把它加入 `KNOWN_RULE_FILE_TEMPLATES`。

### 6. Current Supported Global Rule Files

- `Claude Code`: `~/.claude/CLAUDE.md`
- `Codex CLI`: `~/.codex/AGENTS.md`
- `Gemini CLI`: `~/.gemini/GEMINI.md`
- `OpenCode`: `~/.config/opencode/AGENTS.md`
- `Windsurf`: `~/.codeium/windsurf/memories/global_rules.md`

### 7. Documented Platforms Not In The Global Rules Whitelist

- `OpenClaw`:
  - 原因：官方公开的是 `~/.openclaw/workspace/` 下的一组 bootstrap files，而不是单一 canonical 全局规则文件。
- `Cursor`:
  - 原因：当前公开资料能确认 `.cursor/rules/`、repo `AGENTS.md`、user/team rules 概念，但没有在本轮确认一个稳定的本地用户级单文件规则路径。
- `Kiro`:
  - 原因：官方主模型是 steering 目录与 inclusion modes，`AGENTS.md` 只是兼容入口之一，不是当前可直接映射到 `Rules` 单文件白名单的 canonical global file。
- `Roo Code`:
  - 原因：官方规则面由 `rules/` 目录、`rules-{mode}/` 目录、`.roorules`、`.roorules-{mode}`、`AGENTS.md` / `AGENT.md` 共同组成，属于多入口模式，不适合压缩成当前单文件白名单模型。
- `GitHub Copilot`:
  - 原因：其 durable contract 主要是 repository-scoped 文件，如 `.github/copilot-instructions.md` 与 `.github/instructions/*.instructions.md`，而不是单一用户级本地全局规则文件。

### 8. Promotion Criteria For Future Runtime Support

- 若未来要把新平台加入 `KNOWN_RULE_FILE_TEMPLATES`，至少需要满足以下条件：
  - 已确认单一 canonical 全局规则文件，而不是目录或多入口组合
  - 该文件位于稳定的用户级本地路径，且跨平台模板可由常量直接表达
  - 当前 `Rules` UI 不需要新增新的结构概念就能正确展示和编辑
  - 不会让用户误以为 PromptHub 已完整支持该平台的全部上下文面

### 9. Persistence Model

- 全局规则平台注册表来自 `packages/shared/constants/rules.ts`
- Rules 的业务真相源位于 `userData/data/rules/`
- 全局规则保存在 `data/rules/global/<platform>/`
- 项目规则保存在 `data/rules/projects/<slug>__<id>/`
- 版本快照保存在 `data/rules/.versions/<rule-id>/`
- `prompthub.db` 仅承担 Rules 的索引/状态缓存角色，业务正文不应只存在于数据库中
- 旧版 settings 里的 `ruleProjects` 只作为迁移来源，不再是长期真相源
- 旧版 user data 同级 `rule-history/*.json` 只作为首次 materialize 时的迁移来源：
  - 目标文件存在时，目标内容成为当前托管正文，legacy history 合并为更早版本快照。
  - 目标文件缺失时，最新 legacy history 恢复为托管正文，同步状态保持 `target-missing`，等待用户显式部署。
  - 旧版来源值必须归一化到现有版本来源枚举：`create`、`manual-save`、`ai-rewrite`。
- Shared Rules project ids supplied by callers or backup imports must be safe
  single path segments before they are used in managed project directories.
  Valid ids start with an alphanumeric character and may contain only letters,
  numbers, dots, underscores, and hyphens.
- Shared Rules workspace files under `data/rules/`, including managed rule
  content, `_rule.json`, version snapshots, and version indexes, must use
  same-directory temporary writes followed by rename so interrupted writes do
  not replace the previous readable file with partial content.
- Backup import version restoration must stage the replacement version
  directory before publishing it; failed version writes must preserve the
  previous readable version history.
- Web rule workspace imports must preserve the previous readable rule record
  when a rewrite fails: managed content, `_rule.json`, version files, and
  `index.json` must not be left in a half-new/half-old state after an
  interrupted version write.

### 10. Path Derivation Constraints

- 平台根目录由 `packages/shared/constants/platforms.ts` 提供模板
- 主进程通过 `apps/desktop/src/main/services/skill-installer-utils.ts` 将平台根目录派生成：
  - skills 路径
  - global rule 文件路径
  - config 文件路径
- renderer 不直接进行任意文件系统探测或路径拼接写入

### 11. Rule Snapshot Interaction Model

- Rules 工作台中的版本快照不应只是静态列表；用户必须能够点击某个快照来查看其内容。
- 查看历史快照时，右侧规则内容区应进入只读预览模式，避免把历史内容误当作当前草稿直接编辑。
- 从历史快照恢复时，只应把快照内容恢复到当前草稿态，不应自动写回磁盘文件；真正落盘仍由显式保存动作负责。

### 12. AI Provider Protocol Selection

- 对同一个 provider 或 host，系统不能只按域名硬编码鉴权头，必须按最终请求协议决定鉴权方式。
- Google / Gemini 的原生 Gemini API（例如 `/v1beta/models`、`models/...:generateContent`）应使用 `x-goog-api-key`。
- Google / Gemini 的 OpenAI 兼容 API（例如 `/v1beta/openai/chat/completions`）应使用 `Authorization: Bearer <apiKey>`。

### 13. AI Rewrite Result Contract

- `rules:rewrite` IPC 成功返回时，必须同时包含重写后的 `content` 与非空的可读 `summary` 字段。
- renderer 侧 Rules 工作台会把该 `summary` 作为当前 AI 草稿状态文案展示；成功路径不应依赖 `null`/空字符串回退值来补齐摘要。

## Stable Source Files

- `packages/shared/constants/rules.ts`
- `packages/shared/constants/platforms.ts`
- `apps/desktop/src/main/ipc/rules.ipc.ts`
- `apps/desktop/src/main/services/rules-workspace.ts`
- `apps/desktop/src/main/services/skill-installer-utils.ts`
- `apps/desktop/src/renderer/stores/rules.store.ts`
- `apps/desktop/src/renderer/components/layout/Sidebar.tsx`
