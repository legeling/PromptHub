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
- 平台排序只决定分组顺序，不能把平台 ID 当作文件唯一键。同平台的全局入口和
  scoped 文件必须全部保留，组内沿用 inventory 顺序；侧栏、搜索结果和选中项均以
  Rule ID 区分。同名但路径不同的文件也不能合并。
- `项目规则` 只展示用户手动添加目录的 canonical 项目规则文件。

### 3. Current Project vs Added Project

- `Rules` 不再内置“当前项目”伪规则项。
- 用户手动添加的项目目录由 SQLite 记录绑定，受管正文位于 runtime paths 定义的 `data/rule-files/projects/`。
- 每个手动项目目录当前只管理一个 canonical 文件：`AGENTS.md`。

### 4. Rule File Identifier Model

- SQLite 中更新 Rule 元数据必须原位保留父记录及其版本；版本只能由明确的
  版本替换、版本删除或规则删除操作改变，不能因父记录的 REPLACE 触发级联删除。
- 内置全局规则文件使用稳定 id，例如：
  - `claude-global`
  - `codex-global`
  - `gemini-global`
  - `opencode-global`
  - `windsurf-global`
- 手动项目规则使用动态 id：`project:<project-id>`
- Claude 目录规则复用 `custom:<id>` 合同，以 `custom:claude-rule:<相对路径的 base64url>`
  保持稳定身份；SQLite 继续拥有记录，实际原文及版本沿用现有 Rules 文件存储。
  受管正文及历史沿用第 9 节的统一布局；旧 scoped `_rule.json` 和版本索引由启动迁移转换。
  Scoped Rule 的目录身份使用 `claude-scoped-<完整id的SHA-256>`，支持合法长文件名与嵌套路径。
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

- [Foundation 数据权威要求](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants) 是现行合同。Desktop/CLI 的 Rule 元数据、项目绑定、版本身份与顺序由 SQLite 的 `rules` / `rule_versions` 独占；当前正文和历史正文位于 runtime paths 定义的 `data/rule-files/`。历史文件名由版本 ID 摘要生成，顺序由 SQL 决定。
- 当前正文和历史可以独立存在；删除历史不回退当前正文。空正文是合法文件。尚未创建的全局规则占位行使用空 `content_hash` 和零版本；实际空文件使用空内容的 SHA-256，丢失实际文件不能被当成占位。
- 日常编辑、历史删除、项目删除和整批导入通过同一文件 publication 与 SQLite 提交收据提交。SQL 失败恢复文件；提交结果未知时先恢复确认，不能靠逐条补偿覆盖已提交内容。普通读取不删丢失历史、不从旧 JSON 重建 SQL，也不以外部目标修复丢失的受管正文。
- 显式保存先提交本地资产，再部署外部目标。部署失败返回 `sync-error`，保留本地编辑。扫描和读取比较受管文件与目标文件，将 `syncStatus` 写回 SQL；目标缺失仍保留项目列表和历史。全局规则的部署路径随当前设备 agent 配置派生，已存在元数据的业务字段不被模板重写。
- 新发现的全局外部文件仍经扫描导入。项目创建保留外部已有正文；新项目 ID 必须是安全单段，受管目录由稳定 ID 决定，不能重用 ID 覆盖另一项目。`AGENTS.md` / `prompthub.mdc` 文件名保留。
- 导入、备份和恢复只写受管状态，不创建或修改外部目标。新导入项目使用 `targetPath: ""` / `projectRootPath: null`；已有本机项目保留绑定。导入按内容合并历史，保留导入前正文与导入正文，沿用 20 条日常历史策略；整批先验证再提交，后续条目失败不能留下前面条目已更新的状态。
- 缺失项目清理只处理用户选择且目标仍不存在的安全 `project:` ID。删除先核对 SQL 文件引用与该身份的规范受管目录；从不删除外部项目根或目标。结果区分 removed / skipped / failed，重复删除幂等。
- `rule-metadata-v1` 在启动边界一次性转换旧 `data/rules/` bundle 与 `cache/rules-workspace/` 的 `_rule.json`、`index.json`；同身份正文或历史不一致时保留来源并阻止启动。旧目录按摘要备份到 `recovery/rule-metadata-v1/`，文件迁移、来源退出和 SQL 完成记录一起提交。SQL 中已删除的身份不能被后来出现的旧目录复活。catalog 维护复制 Rule SQL 表，不把数据库视为可丢索引。
- `rule-history-v1` 仍只在显式 bootstrap 读取旧同级 `rule-history/*.json`。当前受管正文优先；没有当前正文时导入外部目标或最后一条历史。全部原历史保留，不在迁移时套用 20 条策略。同 ID 不同内容/时间/来源与跨 Rule 版本归属冲突拒绝整个批次。原 JSON 保存在 recovery；普通列表和正文读取不查询旧历史。
- ZIP/checkpoint 从 SQL 与受管文件生成归档。Rule 归档文档 schema 2 允许当前正文独立于历史及空历史；schema 1 只作为显式历史导入读取并保留其原校验。元数据版本未知时拒绝。旧版程序不支持 schema 2，应使用升级前完整 user data 备份回退，不能把新布局交给旧版直接写入。
- 单次扫描复用一个 RuleDB 适配器；迁移按记录和文件线性扫描，单条历史排序为 O(v log v)。丢失文件、失败恢复、真实关闭重开及 ZIP 归档由所属回归覆盖；实际检查结果见 Foundation implementation。
- Core/Desktop/CLI 收敛已通过当前记录的服务与真实 ZIP 检查；self-hosted Web 的租户隔离、升级、真实 HTTP 与独立进程重开检查也已通过；其他 Foundation 门禁未完成，不能据此声明全产品发布完成。
- Web Rule 元数据使用同一 SQLite 表，并按 `owner_user_id` 与公开 Rule ID 联合标识；不同用户可以保留相同 Rule/版本 ID。空 owner 仅表示本机 Desktop/CLI 集合，Web 只接受数据库中已存在的用户。服务器正文与历史位于 `data/rule-files/<userId>/`。
- Web 启动迁移 `web-rule-metadata-v1` 保全旧 `data/rules/<userId>/` 并退出 JSON 元数据/索引写入；未知用户、冲突和缺失历史阻止升级，失败可重试。普通 CRUD 和备份只访问受管文件，不触碰记录中的客户端项目路径。旧 schema v5 的本机行通过 schema v6 保持身份与引用，Web 历史迁移不裁剪版本。

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
