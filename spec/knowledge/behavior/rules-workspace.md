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
- Claude Code 同时扫描其配置根的 `rules/**/*.md`。每个文件作为独立规则管理，
  原文包含的 YAML `paths` frontmatter 必须在读取、编辑、版本和恢复中完整保留。
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
- Claude 目录规则复用 `custom:<id>` 合同，以 `custom:claude-rule:<相对路径的 base64url>`
  保持稳定身份；SQLite 继续拥有记录，实际原文及版本沿用现有 Rules 文件存储。
  托管副本置于 `data/rules/global/claude/scoped/<id的SHA-256>/<文件名>`，每个规则独立
  `_rule.json` 和版本目录，不与 `CLAUDE.md` 或相邻规则共享元数据。无需结构迁移。
  Scoped Rule 的版本目录使用 `claude-scoped-<id的SHA-256>`，避免合法长文件名经编码后超过单个目录名的文件系统限制。
  外部修改保持 out-of-sync，外部删除保留托管副本为 target-missing；扫描不自动覆盖。
- CLI 操作项目规则时必须支持 cwd-aware 初始化：
  - `prompthub rules project-init` 默认把当前工作目录注册为项目规则目录
  - 未传 `--name` 时使用当前目录 basename 作为项目名称
  - 未传 `--root-path` 时使用 `process.cwd()` 解析出的绝对路径
- CLI 读取、保存、重写和版本操作规则时，应允许使用 rule id、显示名称、平台名称或查询词解析规则；非交互模式遇到多个匹配项必须返回冲突，不得静默选择。

### 5. Global Rule Support Is Explicit, Not Automatic

- 平台在 `spec/knowledge/reference/agent-platforms.md` 中“有官方文档”并不等于它会自动进入 `Rules` 运行时支持集合。
- 除已实现的 Claude `rules/**/*.md` 目录适配外，当前全局规则区建模“每个平台一个稳定、可直接编辑的用户级规则入口文件”。该入口可以是平台唯一的全局规则文件，也可以是官方规则目录明确接受的约定入口；后一种情况不得暗示 PromptHub 已管理同目录的全部文件。
- 因此，新增全局规则支持需要同时满足：
  - 该平台存在稳定公开的用户级文件路径
  - 平台明确读取该文件，而不是 PromptHub 自行猜测文件名
  - 该文件能被当前 `Rules` UI 以单文件模型清晰表达
  - 路径可由 `packages/shared/constants/platforms.ts` 稳定派生，不依赖额外探测
- 对 Kiro、Cline、OpenClaw 等多文件规则或上下文目录，当前只投影一个已验证入口；其余 sibling files 继续由原平台管理，直到目录型 Rules 适配器单独实现。

### 6. Current Supported Global Rule Files

- `Claude Code`: `~/.claude/CLAUDE.md`
- `GitHub Copilot CLI`: `<COPILOT_HOME>/copilot-instructions.md`，默认 `~/.copilot/copilot-instructions.md`
- `Codex CLI`: `~/.codex/AGENTS.md`
- `ZCode Agent`: `~/.zcode/AGENTS.md`
- `Grok Build`: `~/.grok/AGENTS.md`
- `Qwen Code`: `<QWEN_HOME>/QWEN.md`，默认 `~/.qwen/QWEN.md`
- `Qwen Work (CN)`: `~/.qwenworkcn/awareness/main/AGENTS.md`，只管理工作手册；需要用户在千问办公开启意识模式，不修改开关或 `SOUL.md`、`USER.md`、`MEMORY.md`。
- `Kimi Code`: `<KIMI_CODE_HOME>/AGENTS.md`，默认 `~/.kimi-code/AGENTS.md`
- `Gemini CLI`: `~/.gemini/GEMINI.md`
- `Antigravity`: 与 Gemini 解析到同一个 `~/.gemini/GEMINI.md`，不创建重复 descriptor
- `OpenCode`: `~/.config/opencode/AGENTS.md`
- `Pi`: `<PI_CODING_AGENT_DIR>/AGENTS.md`，默认 `~/.pi/agent/AGENTS.md`
- `Oh My Pi`: `<PI_CODING_AGENT_DIR>/RULES.md`，默认 `~/.omp/agent/RULES.md`
- `Windsurf`: `~/.codeium/windsurf/memories/global_rules.md`
- `Kiro`: `<KIRO_HOME>/steering/AGENTS.md`，默认 `~/.kiro/steering/AGENTS.md`
- `Cline CLI`: `~/.cline/data/settings/rules/AGENTS.md`
- `Augment`: `~/.augment/user-guidelines.md`
- `OpenClaw`: `~/.openclaw/workspace/SOUL.md`
- `QClaw`: PromptHub 兼容入口 `~/.qclaw/workspace/SOUL.md`
- `Hermes Agent`: `~/.hermes/AGENTS.md`
- `CodeBuddy`: `~/.codebuddy/CODEBUDDY.md`
- `Amp`: `~/.config/amp/AGENTS.md`
- `Kilo Code`: `~/.kilo/rules/global.md`

### 7. Documented Platforms Not In The Global Rules Whitelist

- `Cursor`:
  - 原因：公开资料确认项目 `.cursor/rules/`、repo `AGENTS.md` 和设置内 User Rules，但没有稳定的用户级本地文件入口。
- `Qoder`:
  - 原因：当前规则合同是项目级 `.qoder/rules/` 和项目根 `AGENTS.md`，没有已确认的用户级本地文件入口。
- `Cherry Studio` 与 `TRAE` 系列：
  - 原因：当前没有已确认且可由共享平台注册表稳定派生的用户级规则文件入口。
- `Roo Code`:
  - 原因：官方规则面由 `rules/` 目录、`rules-{mode}/` 目录、`.roorules`、`.roorules-{mode}`、`AGENTS.md` / `AGENT.md` 共同组成，属于多入口模式，不适合压缩成当前单文件白名单模型。
- `Reasonix`:
  - 原因：当前已验证合同以项目规则和记忆合并为主，没有独立的用户级单文件入口。

### 8. Promotion Criteria For Future Runtime Support

- 若未来要把新平台加入 `KNOWN_RULE_FILE_TEMPLATES`，至少需要满足以下条件：
  - 已确认平台会读取的用户级文件入口；若入口位于多文件目录，UI 和说明必须明确只管理该入口
  - 该文件位于稳定的用户级本地路径，且跨平台模板可由常量直接表达
  - 当前 `Rules` UI 不需要新增新的结构概念就能正确展示和编辑
  - 不会让用户误以为 PromptHub 已完整支持该平台的全部上下文面

### 9. Persistence Model

- 全局规则平台注册表来自 `packages/shared/constants/rules.ts`
- Rules 的业务真相源位于 `userData/data/rules/`
- 每条规则保存在 `data/rules/<rule-id>/` canonical bundle 中：`rule.md`
  是当前正文，`rule.json` 是逻辑元数据与外部 placement，`versions/` 保存版本正文。
- `cache/rules-workspace/` 只用于运行期兼容工作区和索引 hydration，可以删除并从 canonical bundle 重建。
- `prompthub.db` 仅承担 Rules 的索引/状态缓存角色，业务正文不应只存在于数据库中
- 已绑定项目规则的 `targetPath` 与 `projectRootPath` 必须随 canonical Rule 文件保存，
  使删除或迁移 SQLite 后仍能恢复项目绑定；全局规则路径由当前设备 agent
  配置派生，`managedPath` 和 `syncStatus` 是可重建状态。
- portable 恢复的未部署项目规则保留正文、文件名和完整历史；当前 DB 的空
  `targetPath` 在 bundle 输入转换处归一为省略字段，不重新采用源设备的旧路径。
  非空路径仍执行现有校验。以上描述当前恢复格式；SQLite 权威转换仍按
  [foundation](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants)
  推进，不能据此将旧 catalog 重建模式视为目标已完成。
- Hydrated 项目 `_rule.json` 使用 `targetPath: ""` 与
  `projectRootPath: null` 表示明确未部署状态。启动读取必须保留该配对和
  项目身份，并在找到它时结束旧绑定扫描，不恢复之前设备的部署路径。
  当前规范受管目录的绑定优先于历史目录，不由文件枚举顺序决定部署状态。
  非字符串、null byte、空目标配非空项目根仍须拒绝；正文、历史、列表和
  删除行为沿用当前合同。此修复不改变 bundle schema 或增加迁移，旧代码
  回退后仍保全 bundle，但可能再次拒绝第二次启动；升级后可正常重试。
- 内置全局规则在读取时以当前设备平台注册表和 agent override 重新派生外部目标，
  不得把 canonical `rule.md` 或旧设备路径当作部署目标。
- 旧版 settings 里的 `ruleProjects` 只作为迁移来源，不再是长期真相源
- 旧版 user data 同级 `rule-history/*.json` 只作为首次 materialize 时的迁移来源：
  - 目标文件存在时，目标内容成为当前托管正文，legacy history 合并为更早版本快照。
  - 目标文件缺失时，最新 legacy history 恢复为托管正文，同步状态保持 `target-missing`，等待用户显式部署。
  - 旧版来源值必须归一化到现有版本来源枚举：`create`、`manual-save`、`ai-rewrite`。
- Shared Rules project ids supplied by callers or backup imports must be safe
  single path segments before they are used in managed project directories.
  Valid ids start with an alphanumeric character and may contain only letters,
  numbers, dots, underscores, and hyphens.
- Canonical Rule bundles under `data/rules/` use the shared journaled bundle
  publication boundary. Hydrated compatibility files under
  `cache/rules-workspace/`, including `_rule.json` and version indexes, use
  same-directory temporary writes followed by rename so interrupted writes do
  not replace the previous readable file with partial content.
- Canonical `rule.json` history is chronological from oldest to newest, while
  the compatibility `index.json` is newest first for the runtime workspace.
  Hydration and reads must normalize that boundary before rebuilding SQLite;
  an older reversed compatibility index is repaired atomically without
  changing any Rule body or durable version file.
- Backup, snapshot, Desktop fallback, and CLI Rule imports publish only
  PromptHub-managed state. They never write or create the external target;
  target status is derived after publication, and only explicit save, deploy,
  or conflict resolution may write the target.
- Successful import merges existing and incoming history by content, protects
  the pre-import managed body and imported current body, and retains at most 20
  versions. Imported history selection uses bounded per-Rule memory.
- Rule import stages version replacement and treats managed body, metadata,
  versions, and SQLite projection as one recoverable publication unit. A failed
  publish restores readable pre-import state, and replace cleanup starts only
  after every imported record publishes successfully.
- Web rule workspace imports must preserve the previous readable rule record
  when a rewrite fails: managed content, `_rule.json`, version files, and
  `index.json` must not be left in a half-new/half-old state after an
  interrupted version write.
- A forced scan reconciles registered project targets with the filesystem and
  persists a changed `syncStatus` to `_rule.json` and RuleDB. A missing target
  remains visible as `target-missing`; its managed body and versions remain
  recoverable until the user explicitly deploys or cleans it up.
- Missing-project cleanup is confirmation-gated and accepts only selected safe
  `project:` IDs whose targets are still absent. It deletes PromptHub-managed
  rule/version data and the matching RuleDB row, never the external project
  root or target path, and reports removed, skipped, and failed IDs.
- Project workspace creation, canonical hydration and import cleanup share
  `getProjectRuleManagedDirectory`: the cache directory is keyed by stable
  project ID, never by its display name. Workspace and Cursor project rules
  retain their declared `AGENTS.md` or `prompthub.mdc` filename.
  Reusing an existing project ID for another target is rejected before any
  managed body, binding, version or external file is overwritten.
- Project deletion validates every `_rule.json` binding with the requested
  Rule ID before any mutation. The bound directory must contain the declared
  managed path and a supported project filename. All verified current and
  historical cache bindings, versions and the canonical bundle are removed in
  the existing journaled publication transaction; a pre-commit failure restores
  the files and database record. Matching directory names alone never authorize
  removal. External targets and bindings to other Rule IDs remain untouched;
  repeated removal is harmless and scan/reopen must not restore a deleted Rule.
- This correction changes rebuildable workspace paths only, not the canonical
  Rule schema or the foundation redesign's SQLite ownership requirement.
  Existing name-prefixed cache bindings remain discoverable by their metadata
  until explicit removal; they are not a second path-construction convention.
  Rollback to earlier code preserves canonical bodies and versions but can
  recreate the duplicate-cache defect; upgrading again and removing the selected
  Rule cleans its validated bindings without deleting the external file.
- legacy cached-list API 必须直接委托给一次有界文件扫描并重建 SQLite 投影，
  不得从 DB 复制另一套可见性或路径判定；用户不需要先点击 Rescan 才能看到
  文件持有的规则。
- 单次文件权威扫描只创建一个 SQLite Rule 投影适配器；同一个已打开的数据库
  连接只执行一次 canonical Skill workspace hydration，避免 Rule 枚举把 Skill
  全量 hydration 放大为 `Rules x Skills`。
- Agent Rules 冷启动只加载 descriptor inventory，再按 Agent 声明路径/平台读取
  对应 Rule；不得先读取列表首项或其他 Agent 的 Rule。

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
- Web 的 `/api/rules/rewrite` 和 `/:id/rewrite` 复用 Core 的提示词、协议序列化与响应解析，
  只返回供应商生成的草稿，不保存规则正文或版本。缺少有效 AI 配置返回 422；供应商、网络
  或空正文错误返回通用错误，不得追加指令注释后宣称 AI 成功。
- Web 重写通过现有 `remote-http` 执行 HTTPS、地址检查、重定向与响应边界；Core 只传递
  共享 AI deadline，由实际运输层单独执行。CLI 默认运输仍使用有 deadline 的 fetch，
  不因 Web 注入运输增加第二层 timer、重试或放宽 SSRF 约束。

### 14. Conflict Comparison Scrolling

- 长规则发生同步冲突时，弹窗标题、比较模式和解决操作保持可见。
- 差异视图与并排视图共享一个可聚焦的纵向滚动区，不在外层弹窗、比较卡片和代码正文之间制造嵌套纵向滚动。
- 比较区必须具有可计算的剩余高度和 `min-height: 0`，确保鼠标滚轮与键盘滚动都能检查超出首屏的差异。
- 比较工具行必须持续显示“PromptHub 托管版本 / 内部副本”和“外部文件版本 / 磁盘文件”两个来源；红色减项对应 PromptHub 托管版本，绿色增项对应外部文件版本。
- 来源状态块应按内容宽度紧凑排列并在窄屏自然换行，不得通过 `flex: 1` 或等分网格拉伸占满整行；固定工具栏与滚动正文之间必须保留稳定间距。
- 冲突解决按钮必须使用完整版本名称，不能只写“保留 PromptHub”或“保留外部”让用户猜测覆盖方向。

### 15. Agent-Scoped Missing File Creation

- Agent `Rules` 页必须从完整 descriptor inventory 解析目标；standalone
  Rules 侧栏展示 main 返回的已启用文件持有规则。`exists: false` 只表示外部
  部署目标缺失，不得因此隐藏 PromptHub canonical 正文。
- descriptor 已知但 `exists: false` 时，页面必须居中显示创建确认、声明的
  canonical 文件名和精确目标路径；用户确认前不得读取、创建或打开空编辑器。
- descriptor 的 `name`、`path`、`id` 和 `platformId` 是创建操作的唯一来源。
  renderer 不得假设所有 Agent 都使用 `AGENTS.md`，也不得自行拼接目标路径。
- 创建必须复用现有 Rules save contract 并写入空内容；成功后直接进入共享
  Rules 编辑器，失败后保留可重试的创建状态。
- `exists: true` 且正文为空表示真实空文件，必须直接打开空编辑器，不显示创建
  确认。
- descriptor 完全缺失时，保留一次有界 scan 和显式 retry，不得循环扫描。

## Stable Source Files

- `packages/shared/constants/rules.ts`
- `packages/shared/constants/platforms.ts`
- `packages/core/src/rules-workspace.ts`
- `packages/core/src/rules-workspace-import.ts`
- `apps/desktop/src/main/ipc/rules.ipc.ts`
- `apps/desktop/src/main/services/rules-workspace.ts`
- `apps/desktop/src/main/services/skill-installer-utils.ts`
- `apps/desktop/src/renderer/stores/rules.store.ts`
- `apps/desktop/src/renderer/components/layout/Sidebar.tsx`
