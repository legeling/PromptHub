# Tasks

## Clarify And Analyze

- [x] `T-AGENT-001` 盘点现有预置/custom Agent、路径、AI config、Skill、MCP、Rules、Plugin、backup、tray 和 session 边界。
- [x] `T-AGENT-002` 核对 CC Switch 官方功能，并建立 PromptHub current/target/phase 覆盖矩阵。
- [x] `T-AGENT-003` 确认现有预置 Agent 是一级对象，Agent Profile/Persona 不作为第一阶段主模型。
- [x] `T-AGENT-004` 固化启用中预置/custom Agent 的展示清单、常用优先级、默认排序和用户置顶规则；disabled 平台隐藏，但不以 adapter 完成度过滤启用平台。
- [x] `T-AGENT-005` 完成凭据威胁模型与现有 AI config 密钥存储审计，确认 OS secure storage 投影策略。结论记录于 `platform-capability-research.md`：现有 `ai-models.json` 明文密钥不可复用；抽取 cloud auth 的 `safeStorage` 加密、原子替换和 main-only 访问模式。
- [x] `T-AGENT-006` 建立 31 个内置平台的 capability inventory：installation/path、provider/model、Skills、MCP、Rules、Plugins、config files、sessions、usage/quota、launch、maintenance/CLI、backup/export/import、secret/runtime exclusion 和 appearance。
- [x] `T-AGENT-007` 收集首批 provider/session 原生配置 fixture、格式版本和真实外部修改样本。Claude、Codex、Gemini、Grok、Kimi、OpenCode、Qwen 的 Provider 原生文件和已验证 Session adapter 均有版本化真实结构 fixture；外部修改由真实文件 digest race、部分写入、重读不一致和精确 rollback 样本覆盖。
- [x] `T-AGENT-008` 确认外部会话正文保持平台所有、本地、按需读取且不进入同步；PromptHub 不编辑 transcript。删除优先调用平台原生命令，raw-file adapter 仅在另行通过回收站/回滚测试后提供删除。
- [x] `T-AGENT-009` 确认本地代理、协议转换、故障转移、请求拦截和 OAuth 账户池属于高风险独立范围，当前变更不实现。
- [x] `T-AGENT-010` 完成实现前 Analyze：阶段状态与范围决策已统一；全部 FR/NFR、DES、TEST、T 定义唯一且进入追踪表；无阻塞性待确认。
- [x] `T-AGENT-226` 按 `FR-AGENT-136` / `DES-AGENT-155` 将本地 Plugin 来源保存到现有 device projection，并覆盖 canonical reread、restart、update、snapshot、删除和不安全来源失败回滚。
- [x] `T-AGENT-225` 按 `FR-AGENT-135` / `DES-AGENT-154` 隔离 canonical Plugin bundle namespace 与 package materialization，返回 canonical paths，并覆盖本地导入、distribution、restart 与 delete。
- [x] `T-AGENT-224` 按 `FR-AGENT-134` / `DES-AGENT-153` 将 canonical MCP secret-store 加密门禁收窄到非空 extracted secrets，并覆盖 unavailable encryption、完整 CRUD、canonical bundle、restart 与 delete。
- [x] `T-AGENT-223` 按 `FR-AGENT-133` / `DES-AGENT-152` 在共享 usage service 入口阻止未检测 Agent 的凭据、进程、helper 与网络探测，并用真实 Electron 启动验证不会创建或显示缺失的 Antigravity/Gemini root。
- [x] `T-AGENT-222` 按 `FR-AGENT-132` / `DES-AGENT-151` 移除 Provider display-name 唯一索引，增加版本化 legacy migration，并覆盖 fresh schema、旧库迁移、exact/case-only duplicate、rename、restart 与 canonical SQLite rebuild。
- [x] `T-AGENT-221` 按 `FR-AGENT-131` / `DES-AGENT-150` 修正 Skill 详情与批量删除确认文案、7 locales 和真实 Electron 生命周期断言；保持现有 managed/external 删除边界，不新增 IPC 或路径推断。
- [x] `T-AGENT-073` 将 31 平台深度能力声明固化为 machine-readable shared contract；路径能力只从 canonical registry 派生，renderer 不再维护 provider/session/usage 平台 allowlist。

UI screen structure, interaction states, responsive behavior and component boundaries are specified in `ui-design.md`.

## Test-First Verification Contracts

- [x] `TEST-AGENT-217` Plugin 本地来源持久化：先复现 canonical reread/restart 丢失本地来源；断言包内容只保存在 `data/plugins/<id>` canonical bundle，绝对来源路径仅进入 device projection，更新创建旧包快照并发布新包，legacy projection 可读，畸形/缺失/软链接来源不产生写入。
- [x] `TEST-AGENT-216` Plugin canonical materialization：先复现本地导入把 `data/plugins/<normalized-id>` 误判成缺 manifest canonical bundle；单元测试断言只发布 raw stable ID bundle 且返回 canonical files；真实 Electron 覆盖 UI import Toast、package inventory、Codex copy distribution/removal、restart、UI delete 与最终 restart 无残留。
- [x] `TEST-AGENT-215` MCP 非秘密生命周期：单元测试先复现空 secret 更新在 unavailable encryption 下错误失败，并保持非空 secret 失败分支；真实 Electron 完成 create/read/update、canonical resource/version、restart、delete 与再次 restart 后无残留。
- [x] `TEST-AGENT-214` 未检测 Agent usage 副作用：单元测试断言缺失 root 时不调用 Antigravity local helper、keychain resolver 或网络；真实 Electron 启动等待 tray quota scan 后断言 Antigravity/Gemini 均不可见且 `.gemini` 不存在。
- [x] `TEST-AGENT-213` Provider display label identity：DB 黑盒允许同平台 exact/case-only duplicate 与重名 rename；迁移测试从旧 unique index 原位升级并保留稳定 ID；canonical shadow rebuild 保留同名图；真实 Electron 创建同名 Provider 后重启仍按 ID 分离且不改原生配置。
- [x] `TEST-AGENT-212` Skill 删除所有权：组件断言确认文案明确删除 PromptHub 记录、托管包和版本历史并保留外部链接源；main IPC 断言外部路径不进入 managed 删除；真实 Electron 用例断言托管包、canonical state、DB/版本在删除和重启后消失，且无关 Agent 文件不变。
- [x] `TEST-AGENT-001` Agent registry 回归：enabled built-in、enabled custom、configured-but-not-detected 均可见；常用/安装/配置/置顶排序正确；disabled built-in/custom 隐藏；侧栏仅保留搜索；置顶操作垂直居中；不自动创建 Profile。
- [x] `TEST-AGENT-002` capability 决策表：检测与 provider/session/CLI 支持互不混淆，unsupported 不伪装 failed/success。
- [x] `TEST-AGENT-003` DB 黑盒/事务：Provider Profile CRUD、重复名称、归档、模型映射、级联和并发更新。
- [x] `TEST-AGENT-004` secret 安全：DB JSON、IPC、日志、快照、export 和错误均不含 key/token/auth header。覆盖 DB 写入/legacy 读取、main-only secret store、加密 backup、公共 Profile/snapshot/export、IPC 稳定错误和 Provider probe 结果。
- [x] `TEST-AGENT-005` provider import fixture：已知字段、未知字段、畸形内容、Unicode、空值、OAuth-owned 凭据和 import preview。七个完整 adapter 均使用原生格式 fixture；Unicode 未知字段由 Claude JSON fixture 验证精确保留。
- [x] `TEST-AGENT-006` 三方对账决策表：unchanged/backfill/external-modified/conflict/unsupported/blocked。
- [x] `TEST-AGENT-007` 真实文件集成：backup、structured write、comment/unknown field preservation、atomic rename、digest race、verify failure 和 rollback。七个完整 adapter 与共享 activation service 均覆盖 main-owned 加密 backup、结构化写入、并发冲突、重读验证和失败补偿。
- [x] `TEST-AGENT-008` 资产聚合契约：Skill/MCP/Rules/Plugin 列表、计数、状态和动作与 owning domain 一致；当前 Agent 工作台只暴露既有 Skill 域动作，未提供的通用跨域动作明确返回 unsupported。
- [x] `TEST-AGENT-009` config file 安全：首批覆盖 allowlist、仅内容编辑、缺失文件创建、symlink escape、path traversal、null byte 和权限错误；snapshot/restore 随后续版本能力补齐。
- [x] `TEST-AGENT-010` session fixture：增量扫描、search/read/resume、missing、parse-error、超大文件、Unicode 和取消。已由 device-local index、Claude/Gemini/OpenCode/Kimi/Qwen/Codex/Grok/OpenClaw/Kiro/Oh My Pi/Windsurf 真实文件 fixture、IPC 取消和 renderer 搜索回归共同覆盖。
- [x] `TEST-AGENT-011` session 隐私/性能：正文不进入默认 sync/export，10,000 条分页/虚拟化，bounded preview 和 redaction。普通 WebDAV/S3/self-hosted 同步复用同一 portable backup exporter，回归确认只导出有界 opt-in preference；10,000 条 SQLite 元数据使用 200 条有界分页，renderer 使用 50 条列表分页与 80 条 transcript 渐进挂载。
- [x] `TEST-AGENT-012` model test：成功流、stream、timeout、abort、auth/network/model-not-found 分类、redirect/SSRF 边界和 redaction。
- [x] `TEST-AGENT-013` tray/workspace 契约：共享 active-state query 与 activation service，不存在第二状态源。
- [x] `TEST-AGENT-014` backup round-trip：新旧格式、缺失 secret、跨设备 path reconciliation、无 transcript body。（由 `TEST-AGENT-073` / `074` / `075` 完成完整格式、用户可见 ZIP scope、当前设备 session descriptor 重绑定与 runtime/transcript 排除。）
- [x] `TEST-AGENT-015` import/deep-link fuzz：版本、大小、非法 URL、敏感字段、重复 id、未知协议和无确认不落盘。
- [x] `TEST-AGENT-079` Provider Profile 深链回归：严格 `prompthub://import` 解析、敏感值拒绝、主进程有界路由、预览、取消零写入、确认单次创建、无自动激活和 7 locales。
- [x] `TEST-AGENT-080` Qwen Definitions 回归：真实 user/project SubAgent 与嵌套 Command fixture、严格 YAML、命名空间、畸形/超限/Unicode、entry/byte/depth 上限、软链接/越界/空字节、敏感 metadata 脱敏、extension 排除、project id 主进程解析、open 时二次校验、Qwen-only UI、搜索/选择/空态/错误态和 7 locales。
- [ ] `TEST-AGENT-016` CLI detection/lifecycle：custom PATH/prefix、版本、unsupported manager、计划确认、命令参数注入和失败恢复。
- [x] `TEST-AGENT-017` UI 行为：所有 Agent 共用同一 detail shell；Agent 行始终可点击；supported 可操作，partial 按子能力控制，planned/unsupported 置灰且不触发 IPC；覆盖 provider diff、asset actions、sessions、diagnostics、keyboard 和 7 locales。最终聚合 8 files / 106 tests，并补充 Agent 切换导致当前 tab 失效时的 roving focus 恢复与七语言 key/非空值严格对齐。
- [x] `TEST-AGENT-018` 全量回归：Prompt、Skill、MCP、Rules、Plugin、AI Settings、backup/sync、tray 和现有 Agent 分发不回归。（config file 批次已通过 383 files / 3354 tests、desktop build 和隔离 HOME 的 Agent Electron E2E；后续 adapter 批次仍须重复执行）
- [x] `TEST-AGENT-019` Kimi Code 双版本回归：current/env/legacy/override 根目录优先级、缺失根的新目录落点、TOML 模型读写与回滚、secret 脱敏、bounded index、畸形/越界/软链接 session、只读 transcript 和 resume command。
- [x] `TEST-AGENT-020` Codex 外观回归：Dream Skin `theme.json + image` 校验/导入/列表/预览/导出、原子 active staging、平台 start/verify/restore 编排、兼容性失败回滚、loopback CDP、Pet 扫描/预览/原子导入/导出/删除、v1/v2 atlas idle 动画裁切、reduced-motion 静态帧、路径穿越/软链接/超限输入和 UI capability 状态。
- [x] `TEST-AGENT-021` 桌面首页顺序回归：新用户默认 `Prompts -> Agents -> Skills`；settings v17 迁移旧默认顺序时同样把 Agents 放在第二位；迁移后的完整自定义顺序保持不变。
- [x] `TEST-AGENT-022` Google Agent 生命周期回归：Antigravity 排在 Gemini 前并标记为 current；两个内置显示名均不带 `CLI` 后缀；Gemini 仅作为 enterprise-legacy 兼容项保留并指向 Antigravity；界面明确 2026-06-18 普通用户停服边界和企业/付费 API 例外；Antigravity 的 Skill、MCP、Plugin 和 Rules 路径使用官方共享配置合同。
- [x] `TEST-AGENT-023` Claude quota adapter 契约：凭证解析顺序（keychain legacy / hashed 变体 / credentials 文件、root override）、畸形 JSON、缺失 `claudeAiOauth`、`expiresAt` 过期短路、200 映射、401、网络超时、60s 缓存 TTL、非法 agentId 拒绝，且任何输出/错误/日志不含 token。
- [x] `TEST-AGENT-024` Overview 导航 UI 行为：真实计数与 owning store 一致、点击跳转到对应 tab、planned/unsupported 置灰且不发 IPC、用量卡片 ok/no-credentials/expired/unavailable 四态、路径区折叠、7 locales、仅使用中性设计 token。
- [x] `TEST-AGENT-025` Codex provider 写入管线契约：model_providers 增删改、profiles 生成/清理、保留键与注释不受影响、auth.json 与 openai 内置 provider 零改动、reserved id 拒绝、slug/URL 校验、active provider 删除拒绝、digest 冲突回滚、原子写 0600、重读 verify 失败回滚。
- [x] `TEST-AGENT-026` 托管密钥安全契约：secret store 加解密往返、safeStorage 不可用 fail-closed、0600/原子写、同文件并发写入/清除线性化且不丢失无关凭据、先行 mutation 对后续 read 可见、bearer token 投影与 env_key 旁路、密钥不出现在任何 IPC 响应/错误/日志、连通性测试 SSRF 拦截（非 loopback 内网 IP/file 协议/带 userinfo 的 URL；loopback 明确豁免）、测试错误分类与脱敏。
- [x] `TEST-AGENT-044` Codex 身份偏好：默认名称无 CLI 后缀；Codex/ChatGPT 名称与图标可独立选择；列表、搜索、排序和详情共享投影；非法持久化值逐字段回退；设置快照 round-trip 且不接受任意图标路径或 URL。
- [x] `TEST-AGENT-027` Provider UI 行为：列表渲染（managed/env/none 密钥就绪度）、新增/编辑对话框（密钥 write-only；显式保留、替换、移除；只允许显示当前新输入值；替换空值拦截）、删除守卫、设为默认、测试结果展示、非 Codex 平台不渲染该区域、7 locales。
- [x] `TEST-AGENT-028` 桌面形态布局契约：tab 内容顶格（无外层页边距/max-width 画布类名）、工具栏固定且仅内容区滚动、Skills/MCP/Rules/Plugins 顶部直达且无 Assets 二级导航、概览资产格直达所属页签、维护动作在头部 ⋯ 菜单、provider master-detail 选中切换、7 locales。
- [x] `TEST-AGENT-029` Codex quota adapter 契约：auth.json 解析（缺文件/缺 tokens/畸形 JSON）、wham/usage 请求头（Bearer + ChatGPT-Account-Id）、窗口按 limit_window_seconds 分类（5h 在 secondary 槽位也正确归类）、reset_at 秒→毫秒、plan_type 映射、401/403→expired、自定义 provider 活跃时零网络调用、token 不出现在任何输出。
- [x] `TEST-AGENT-030` 概览 provider-aware UI：官方活跃时模型+凭据展示与用量配额、自定义活跃时 baseUrl+模型展示与 custom-provider 用量态、能力网格移除、路径行打开文件夹动作、7 locales。
- [x] `TEST-AGENT-031` 用量横幅契约：概览顶部圆环仪表（各窗口利用率/重置倒计时/plan 徽标/刷新）、单窗口响应渲染、四种引导态横幅、tab 栏无用量 tab（6 个）、概览网格无用量格、7 locales。
- [x] `TEST-AGENT-032` 多态配额适配器契约：Kimi（credentials 解析、usages 映射 weekly/rolling、membership→plan、401/过期）、Antigravity（token 文件、loadCodeAssist+fetchAvailableModels、per-model remaining 映射、tier）、Gemini（oauth_creds、retrieveUserQuota buckets）、Copilot（gh/hosts token 解析、copilot_internal/user premium/chat 映射、reset date）；全部遵守 token 隔离与错误分类。
- [x] `TEST-AGENT-033` 多态横幅 UI：window→圆环、quota→进度条（含 used/total/unit）、模型配额截取与 +N 汇总、已知 id 的 i18n 标签、capability 翻转后各 agent 渲染、既有 Claude/Codex 回归、7 locales。
- [x] `TEST-AGENT-034` 资产卡片契约：徽标语义（managed/symlink/copy/未托管/built-in）、筛选 chips、加入托管流程、卸载确认与 built-in 拦截、安装我的 Skill、点击卡片打开详情页并携带 agent 上下文、7 locales。
- [x] `TEST-AGENT-035` Antigravity 当前会话额度：可信语言服务进程与回环端口解析、月度提示额度和模型额度映射、本地会话优先、过期可续期钥匙串语义、token/CSRF 隔离、未运行专用 UI 引导和 7 locales。
- [x] `TEST-AGENT-037` Agent 启动与 Antigravity 分组额度：应用路径允许列表、IPC 路由、当前 2.x 进程识别、weekly/5h 双组圆环、总 credits 单进度条和未运行态直接打开。
- [ ] `TEST-AGENT-036` Qwen Code 集成回归：`QWEN_HOME`/默认根/PromptHub override 与 `QWEN_RUNTIME_DIR` 分离；用户/项目 Skills 完整包与 `.agents/skills` 兼容发现；SubAgent frontmatter；`QWEN.md`/`QWEN.local.md` scope；MCP `mcpServers` 结构化合并、未知字段保留、secret redaction、原子回滚；Extension 父资产所有权；`qwen sessions list --json` 畸形/超时/超限输出；session/memory/token 文件不进入普通 backup/sync；7 locales 与平台唯一性。
- [x] `TEST-AGENT-038` 常用 Agent 历史会话回归：Codex active/archive 去重、ChatGPT 展示身份不改变 `codex` adapter、Grok summary/chat history、OpenClaw 越界 transcript 拒绝、Qwen native JSONL 与 runtime realpath、畸形记录隔离、2 MiB 截断、列表上限、resume 参数和 capability 白名单。
- [x] `TEST-AGENT-040` 会话规模回归：offset/limit 校验、分页去重、原生 total/hasMore、50 条首屏、追加页、off-screen content visibility、80 条 transcript 首批、渐进展开、2 MiB 截断提示和 Agent 原生空状态。
- [x] `TEST-AGENT-039` 工作台就地编辑回归：内置 Agent 从 ⋯ 菜单打开弹窗、当前值、平台默认重置、保存 override、关闭后仍留在工作台、刷新菜单不回归，头部不重复展示管理 Skills；custom Agent 复用同一弹窗并保存名称、启用状态与路径。
- [x] `TEST-AGENT-041` Antigravity 后台额度回归：桌面进程不存在或进程发现不可用时，仅从 macOS 安装路径允许列表启动临时 native helper；固定参数、随机 CSRF、回环端口、启动/输出/请求上限、分组额度优先、可选账户状态、无 shell/secret 泄漏，以及成功、启动失败、请求失败、优雅退出和强制回收分支。
- [x] `TEST-AGENT-042` Oh My Pi 回归：`PI_CODING_AGENT_DIR`/默认根解析、Skills/Rules/MCP/项目目标/派生 Plugin 路径、`mcpServers` key、直接项目 JSONL 会话、标题/模型/可见消息映射、畸形行统计、嵌套 subagent/软链接/不安全 id 拒绝和 `omp --resume` 元数据。
- [x] `TEST-AGENT-043` Oh My Pi model 回归：`config.yml`/`config.yaml` 选择、`models.yml` provider/model 列表、endpoint 脱敏、apiKey/header/OAuth 不出 renderer、缺失/畸形/超限 YAML、备份/原子写/重读校验/回滚，以及未知字段保留；并发防护复用既有通用写入管线。
- [x] `TEST-AGENT-045` 全量 capability inventory 回归：31 个平台注册项各声明一次；每项状态只能是 supported/partial/planned/unsupported 且 evidence 非空；provider/session/usage 的已实现集合与真实 adapters 一致；custom Agent 只派生路径能力，不伪造深度协议。
- [x] `TEST-AGENT-046` Provider Profile renderer 回归：非 Codex 已支持平台使用统一 Profile split view；覆盖公共凭据就绪态、增删改、独立改名、创建副本、复制无凭据文本、确认删除且不显示归档、结构化 config 编辑保留、write-only 凭据替换/清除/保留、显式原生导入、逐字段冲突选择、blocked/verified/rollback 结果、稳定错误脱敏和 7 locales；Codex 旧 provider 投影仍由 `T-AGENT-079` 迁移。
- [x] `TEST-AGENT-047` 工作台 capability 指引与键盘回归：planned/unsupported 页签保持禁用并显示具体说明，不触发 Provider IPC；tablist 使用 roving tabindex，ArrowLeft/ArrowRight/Home/End 仅在可用页签间循环，活动页签与 tabpanel 通过 `aria-labelledby` 关联；7 locales 提供 planned/unsupported 文案。
- [x] `TEST-AGENT-048` Agent renderer 异步测试稳定性：Overview session/provider cell 与 legacy Codex Provider panel 的初始异步加载在 React `act` 生命周期内收敛；工作台切回 Overview 后再次等待加载完成；回归输出不再包含未包裹 `act(...)` 的状态更新警告。
- [x] `TEST-AGENT-049` Codex Provider 凭据迁移：真实 TOML fixture 覆盖 legacy managed/env/native-inline 三类来源；preview 不含 secret/ref；未确认与 stale digest 零写入；确认后 Profile/映射/`agent-provider:<profileId>` 一致；批次中任一步失败恢复旧 ref 并清理新 Profile/ref；迁移不改 `config.toml`；重复执行幂等；7 locales、键盘/读屏和 Electron 同意/稍后流程。
- [x] `TEST-AGENT-050` Gemini Provider adapter：真实 JSONC + `.env` fixture 覆盖 paid API key 与 platform-native OAuth/Vertex/ADC；inspect/import 不泄露 secret；两文件 unknown-field/comment preservation、并发修改、软链接/超限/畸形输入、加密 bundle backup、部分写失败恢复、重读验证与 rollback；原生 Gemini `/v1beta/models` 和 `streamGenerateContent` 覆盖请求、SSE、SSRF/DNS、redirect、timeout、retry、abort、响应上限、错误分类和脱敏；Profile UI 覆盖 Gemini 默认协议、凭据清除和 7 locales。
- [x] `TEST-AGENT-051` Kimi Code Provider adapter：真实 TOML fixture 覆盖 `kimi`、`openai`、`openai_responses`、`anthropic`、`google-genai`、Vertex ADC、managed OAuth、provider `env` 与 `custom_headers`；inspect/import 不泄露 secret；provider/model/default 语义保留、畸形/超限/软链接/越界、加密备份、digest race、原子写、native validation、重读验证和 rollback；各直接协议复用现有 main-only probe 并覆盖 unsupported/no-credentials；Profile UI 覆盖 provider id、model alias、upstream model、context limit、write-only secret 和 7 locales。
- [x] `TEST-AGENT-052` Qwen Code Provider adapter：当前 `$version: 4` bare-array `modelProviders`、built-in/custom `providerProtocol`、`id + baseUrl` identity、user `.env` credential projection、platform-native Vertex/legacy OAuth/Coding Plan ownership、deprecated auth-field redaction、unknown-field/duplicate-model preservation、畸形/超限/软链接/越界、两文件 digest race、加密备份、部分写入恢复、重读验证和 rollback；OpenAI/Anthropic/Gemini probe dispatch、Profile UI、7 locales 与真实 Electron IPC 路径全部回归。
- [x] `TEST-AGENT-053` OpenCode Provider adapter：current v1 `provider`/`model`/`small_model` JSONC、config precedence、custom provider npm/protocol mapping、XDG data-root `auth.json` API credential projection、native API/OAuth/well-known ownership、v2 plural `providers` 拒写、inline secret/header blocking、unknown-field/comment/auth-entry preservation、畸形/超限/软链接/越界、两文件 digest race、加密备份、部分写入恢复、重读验证和 rollback；OpenAI Chat/Responses probe dispatch、Profile UI、7 locales 与真实 Electron IPC 路径全部回归。
- [x] `TEST-AGENT-054` GitHub Copilot CLI native model 回归：`COPILOT_HOME`/默认根、current user-editable asset paths、JSONC `settings.json` model inspect/update、注释与未知字段保留、缺失/畸形/超限/软链接、并发修改、备份/原子写/重读验证/rollback；BYOK endpoint/secret Profile fail-closed，`config.json`/auth/session/permission/Plugin metadata 不进入 renderer 或普通配置编辑。
- [x] `TEST-AGENT-055` GitHub Copilot Plugin 安装语义回归：target matrix 保持可见但禁用、直接 distribute 在 resolver/文件写入前 fail-closed、真实已安装目录仍可只读发现；不得把生成 `plugin.json` 或写入 `installed-plugins/` 宣称为原生安装。
- [x] `TEST-AGENT-056` Cursor current boundary 回归：canonical root/Skills/SubAgents/MCP/Plugin paths 与 planned deep capabilities；Marketplace cache 和 local Plugin 只读发现；target matrix 可见但禁用；直接 distribute 在 resolver/写入前 fail-closed；不得声明全局 Rules、Config、Provider、Usage 或 Maintenance 已支持。Cursor Sessions 的后续边界由 `TEST-AGENT-098` 覆盖，现为 evidence-backed transcript partial。
- [x] `TEST-AGENT-057` Cherry Studio current boundary 回归：`Data/cherrystudio.sqlite` 优先于兼容旧库、`Data/Skills` 使用跨平台规范路径、macOS 启动入口可用、composite Plugin target 保持禁用；MCP/Rules/Config/Provider/Sessions/Usage/Maintenance 与私有运行时状态不得被误报为已支持。
- [x] `TEST-AGENT-058` Windsurf transcript 回归：真实 `user_input` / `planner_response` / `code_action` JSONL fixture、只读 list/read、`resume: null`、隐藏工具与文件内容、畸形行、未知 step、分页/排序/截断、非法 id、软链接和越界防护；Skills/MCP/global Rules/launch 路径保持真实，Provider/Usage/Config/Maintenance 与 composite Plugin 安装不得误报。
- [x] `TEST-AGENT-059` Kiro current boundary 回归：`KIRO_HOME`/默认根、Skills/MCP/agents/config/launch 路径、JSONC `chat.defaultModel` inspect/update、平台托管凭据、备份/原子写/并发/验证/回滚；CLI metadata + JSONL 会话仅投影视觉 Prompt/Assistant text，隐藏 thinking/tool/result、`resume: null`、畸形/超限/软链接/越界防护；多文件 steering 不伪装为单文件 Rules；Power 直接 distribute 在 resolver/写入前 fail-closed。
- [x] `TEST-AGENT-060` Grok Build Provider adapter：`GROK_HOME`/默认根、当前 `[models].default` + `[model.<alias>]` TOML、三种公开协议、built-in/native session 与 env-owned custom Provider、inline key/header redaction 和只读边界、unknown-field preservation、畸形/超限/软链接/越界/重复/并发输入、加密备份、原子写、重读验证、失败回滚、main-only 环境凭据 probe、Profile UI 无 managed-secret 控件与 7 locales。
- [x] `TEST-AGENT-061` Amp current boundary：跨平台 `~/.config/amp` 根与 Windows 旧路径 fallback、全局/项目 settings preset、literal `amp.mcpServers` 读写与无关 dotted settings preservation、Provider unsupported 及其余深度能力不误报；不得启用 raw Config、hosted thread/usage 或 Plugin 文件系统安装。
- [x] `TEST-AGENT-062` Provider 凭据替换补偿：legacy ref 清理在 DB 更新后失败时恢复 Profile、mapping 和旧 secret；DB 补偿失败时保留当前 DB 所需的新 secret 并返回稳定 rollback error；错误和公共结果不含凭据。
- [x] `TEST-AGENT-063` Session metadata persistence：fresh/migrated schema、source identity、full/incremental scan、missing/parse-error、annotation preservation、失败事务回滚、stable scan error、literal search、bounded pagination、畸形/超限/重复输入和级联删除；不得持久化 transcript body。
- [x] `TEST-AGENT-070` Provider endpoint 凭据隔离：共享 validator 覆盖 HTTP(S)/loopback/空值、userinfo、fragment、协议、控制字符、畸形和超限；SQLite create/update/read fail-closed 且错误不回显凭据；Profile 表单首击即拦截并覆盖 7 locales。
- [x] `TEST-AGENT-071` Provider 公共 JSON 持久化边界：Profile config、model mapping、audit snapshot 在 SQLite write/read 均拒绝敏感键、非 JSON、循环和超限结构；baseline recovery 复用同一 validator；旧 unsafe row fail-closed、错误不回显凭据且失败写入不留部分记录。
- [x] `TEST-AGENT-072` Session index 取消与规模门禁：预取消不调用 adapter；扫描完成至提交之间取消不写 row/cursor/status/failure；真实 SQLite 精确提交 10,000 条并遍历 50 个 200-row page，覆盖 total/hasMore、Unicode literal search、30 秒有界运行和 transcript body schema exclusion。
- [x] `TEST-AGENT-076` Agent workspace UI 韧性：50+ Agent 与 100+ Provider Profile 使用真实生产 virtualizer 配置并保持稳定 key、固定估算、overscan 和有界 DOM；长名称/路径不撑开 header/master-detail，launch 保留完整 accessible name；搜索、选择、current badge 和键盘按钮语义保持可用。
- [x] `TEST-AGENT-077` Agent asset 规模门禁：1,000 个 Skill 卡片和 1,000 个 MCP/Rules/Plugin 紧凑项只渲染有界 page，前后页可达且边界禁用；search/filter/source/domain 改变重置或 clamp page，不出现假空状态；动作仍接收 owning-domain 原对象。
- [x] `TEST-AGENT-078` OpenCode CLI 更新生命周期：官方固定 update/精确版本 rollback 合同、main-owned detached plan、sender 绑定、TTL/容量、一次性与并发防重放、precondition 重检、成功/no-change、失败恢复、rollback 失败、输出脱敏、IPC/preload、显式确认 UI 和 7 locales；不执行用户机器上的真实全局更新。

## Master Delivery Task

- [ ] `T-AGENT-081` 完成 Agent 管理模块当前规划范围内的全部平台适配、核心开发和收敛验证。

  **目标**
  - 以 `packages/shared/constants/platforms.ts` 的 31 个内置 Agent 和用户已启用的 custom Agent 为唯一展示清单。
  - 以 `packages/shared/constants/agent-platform-capabilities.ts` 为能力状态的 machine-readable 投影，不建立第二份平台、路径或 adapter allowlist。
  - 对每个平台逐项完成 installation/path、Provider & Model、Skills、MCP、Rules、Plugins、Config Files、Sessions、Usage、Launch、Maintenance/CLI、backup/export/import、secret/runtime exclusion 和 Appearance 的证据审计。
  - 有稳定协议、真实 fixture 和可回滚实现的能力标记为 `supported` 或 `partial`；缺少证据的能力必须保留为 `planned` 或有依据地标记 `unsupported`，不得用路径存在或 UI 可见冒充已适配。

  **当前基线**
  - 统一 Agent registry、工作台 shell、资产聚合、allowlisted Config Files、Provider Profile DB/CRUD、三方对账和基础激活管线已经存在。
  - Provider & Model 当前有 Claude Code、Codex、Gemini CLI、Grok Build、Kimi Code、OpenCode、Qwen Code 7 个完整 Profile adapter，以及 GitHub Copilot CLI、Kiro、Oh My Pi、OpenClaw 4 个仅 model/config 的 `partial` 投影。Codex 已完成统一 Provider Profile DB、`agent-provider:<profileId>` secret ref、旧配置迁移提示和统一 activation service；旧 `codex-provider:*` secret 仍按显式迁移边界保留，不静默复制或删除。
  - Sessions 当前有 Claude、Codex、Gemini、Grok Build、Kimi Code、OpenCode、Qwen Code、OpenClaw、Pi、Oh My Pi 的 verified read-only adapters，以及 Copilot、Cline、Cursor、Kiro、Windsurf 的有界只读 `partial` adapters；Claude/Gemini 已有显式 opt-in 的持久化 metadata index，其余 adapter 仍为 live reader。Usage 有 7 个 adapters，Appearance 只有 Codex。
  - Agent portable backup/restore、选择性/完整桌面备份、跨设备 session preference 重绑定和 tray Provider 切换已经完成。Maintenance/CLI 目前只在 7 个有证据的平台提供只读诊断；detect/install/update 的 plan/confirm/apply 生命周期仍未完成。
  - custom Agent 只能获得自身声明路径和 owning-domain 资产能力，不得按目录名继承内置平台的 Provider、Session、Usage 或 Appearance adapter。

  **执行批次**
  1. **统一 Provider 边界**：先完成 Codex 从旧 provider 投影到 Provider Profile DB、`agent-provider:<profileId>` secure secret 和统一 activation service 的迁移；原生配置仍是 Agent 运行态投影，旧 `codex-provider:*` 凭据不得静默复制或删除。
  2. **优先平台 adapters**：按 Claude Code、Codex、Antigravity、Kimi Code、Qwen Code、OpenCode、Oh My Pi 的顺序完成有证据的 inspect/import/plan/apply/verify/rollback/test；Gemini 只保留企业/付费 API 兼容边界。
  3. **其余平台注册项**：按 canonical registry 顺序处理 Copilot、Cursor、Cherry Studio、Windsurf、Kiro、TRAE 系列、Cline、Reasonix、Augment、ZCode、Grok Build、Kilo Code、Amp、OpenClaw、QClaw、Qoder、QoderWorker、Hermes Agent、CodeBuddy 和 WorkBuddy。每个平台必须先补证据与 fixture，再决定实现或 `unsupported`。
  4. **资产与配置**：Skills、MCP、Rules、Plugins 继续实时调用 owning domain；补齐平台特有 scope、父 bundle、项目级路径、外部修改检测和受控写入，不复制 durable state。
  5. **Sessions 与 Usage**：完成 session source/index 持久化、分页、bounded transcript、恢复命令、隐私排除和大数据量测试；仅为有官方或真实本地证据的平台启用 Usage/Quota。
  6. **运维与恢复**：完成 tray provider 切换、Agent backup/export/import、跨设备 reconciliation、CLI detect/install/update/diagnose 的 plan/confirm/apply，以及失败后的幂等恢复。
  7. **产品门禁**：补齐无 adapter 指引、7 locales、键盘/读屏、窄窗口、长文本、大数据量、Electron E2E、全量 desktop 回归、typecheck、affected lint 和 `pnpm verify:release:quick`。
  8. **文档收敛**：更新 capability inventory、稳定 knowledge/rules、测试矩阵、coverage map、implementation 和 issue 状态；完成 Converge 后再归档当前 change。

  **每个平台的完成定义**
  - 平台身份、根目录、环境变量、scope 和运行态排除项均有证据代码及可复现 fixture。
  - 每项能力的状态与真实 adapter 一致；`supported` 必须有正常、缺失、畸形、超限、权限、软链接/越界、并发外部修改和兼容性测试。
  - 任何写入均具备受控 backup、原子替换、重新读取验证和失败回滚；不得覆盖未知字段或静默接管外部配置。
  - secret/token/auth header 不进入 renderer、SQLite 公共 JSON、日志、错误、portable export、普通 backup 或 transcript index。
  - Sessions 只读且按需加载；PromptHub 不编辑、删除、同步或默认备份外部 transcript 和认证缓存。
  - UI 的列表、详情、计数、badge 和动作共享同一 capability/query source；planned/unsupported 能力保持可解释且不触发 IPC。

  **关闭条件**
  - `T-AGENT-007`、`T-AGENT-011`、`T-AGENT-012`、`T-AGENT-015` 至 `T-AGENT-019`、`T-AGENT-022` 至 `T-AGENT-031`、`T-AGENT-035` 至 `T-AGENT-039`、`T-AGENT-063`、`T-AGENT-064` 和 `T-AGENT-079` 均已完成，或以证据充分的 `unsupported` 结论收敛。
  - `TEST-AGENT-004`、`TEST-AGENT-005`、`TEST-AGENT-007`、`TEST-AGENT-010` 至 `TEST-AGENT-017` 和 `TEST-AGENT-036` 全部通过。
  - 31 个内置 Agent 均有完整且真实的 capability inventory；不存在重复 Provider、资产、会话、额度、配置、备份或维护事实源。
  - `FR -> DES -> TEST -> T` 审计无重复、孤立或虚假完成项；`implementation.md` 与代码和验证结果一致。
  - 本任务是总交付门禁，不能因为某个 UI、单个平台或单组 targeted tests 完成而提前勾选。

  **明确不包含**
  - 本地代理、协议转换、故障转移、请求拦截、请求日志、OAuth 账户池和敏感数据远程同步；这些能力仍需独立安全审查和 active change。

## Phase 0: Foundations

- [x] `T-AGENT-011` 在 `packages/shared` 增加 Managed Agent、capability、Provider Profile、activation plan/result、session 和 IPC contracts。Managed Agent、capability inventory、Provider Profile、import preview、字段冲突选择、activation plan/result、非敏感 model config、只读 session、Provider CRUD/activation 以及 connection/model/cancel test contracts 均已由固定 IPC channel、main validation、preload bridge 和 renderer store 回归覆盖。
- [x] `T-AGENT-012` 在 `packages/db` 增加 Provider Profile、model mapping、redacted snapshot、session source/index schema、迁移、索引和事务。
- [x] `T-AGENT-074` 完成 Provider Profile 持久化基础批次：shared typed records/inputs、三张 SQLite 表、既有数据库幂等迁移与预迁移备份、active-name 唯一约束、乐观并发、mapping upsert、snapshot history、级联/SET NULL 和事务回滚。
- [x] `T-AGENT-013` 在 `packages/core` 增加 adapter registry、Agent query、provider reconciliation 和 asset aggregation 服务，并将四个 owning-domain 只读 adapters 接入工作台；不复制资产事实源，未实现的通用跨域写操作明确返回 unsupported。
- [x] `T-AGENT-014` 将完整 platform registry/path resolution 接入 Managed Agent query，不复制平台记录，也不按深度 adapter 完成度过滤。
- [x] `T-AGENT-015` 实现 desktop secure secret abstraction、provider apply transaction 和 config allowlist boundary。证据充分的完整 adapter 使用 main-only secure secret、同文件 mutation 队列、allowlisted native targets、加密 backup、原子写入、digest 并发保护、重读验证、审计快照和失败 rollback；其余平台保持 partial/planned/unsupported，不伪造 endpoint/credential 写入。
- [x] `T-AGENT-016` 建立首批 provider/session fixture 与故障注入 harness，并完成 `TEST-AGENT-001` 至 `007`。故障注入覆盖 secret/DB 双写补偿、部分文件写入、并发修改、验证失败、审计失败和 rollback 失败。
- [x] `T-AGENT-075` 完成 Provider adapter registry 与纯三方对账基础批次：可选能力注册不伪造 adapter，平台/版本校验，字段级 preserve/apply/backfill/external-modified/conflict/unsupported/blocked 决策和不可变输入。
- [x] `T-AGENT-076` 将 Managed Agent query/identity/path/order/filter 业务规则下沉到 `packages/core`，renderer 仅保留兼容导出；增加无状态 Agent asset aggregation orchestrator，实时委托 owning domains、隔离单域失败并拒绝跨域 plan/result。
- [x] `T-AGENT-077` 完成 Provider Profile main-only 安全 CRUD 批次：公共 JSON/映射敏感键拒绝、批量密钥存在性查询、write-only secret、稳定 main-owned secret ref、DB/密钥双写补偿、原子 profile+mapping 更新、duplicate 不复制凭据、无凭据 export、受控 IPC/preload 和数据库恢复后的 handler rebind。
- [x] `T-AGENT-078` 完成 Provider 激活应用链路基础批次：原生 import preview 验证、字段级冲突选择、main-owned Agent 路径解析、受控 import/preview/activate IPC 与 preload、八个平台的 model-only adapter 注册、renderer query/action store、stale-load 隔离以及 verified/rollback 结果投影；endpoint/credential profile 在对应平台完整 adapter 落地前 fail-closed。
- [x] `T-AGENT-079` 将 Provider Profile 列表、结构化编辑、原生导入确认、字段级 activation preview、verified/rollback 结果和无 adapter 指引接入 Provider & Model split view；迁移 Codex 旧 provider 管理投影，避免形成第二 Provider 事实源，并完成 7 locales、键盘/读屏和 UI 回归。Codex legacy 凭据同意迁移、统一 Profile 创建/激活、write-only secret 和真实 `config.toml` 投影已通过 Electron E2E。
- [x] `T-AGENT-080` 完成非 Codex Provider Profile renderer 批次：统一列表/详情、公共凭据态、CRUD/创建副本/复制无凭据文本、独立改名、确认删除且移除详情归档操作、write-only 凭据动作、显式原生导入、逐字段 activation preview、verified/rollback 结果和稳定错误边界；编辑保留 adapter-owned `config`，不把 durable 状态复制进 renderer store。
- [x] `T-AGENT-082` 完成 capability 指引与工作台 tab 可访问性批次：planned/unsupported 页签及概览入口显示状态对应说明；禁用页签不触发 Provider IPC；可用页签实现 roving tabindex、ArrowLeft/ArrowRight/Home/End 导航和 tab/tabpanel 关联；新增文案覆盖 7 locales。
- [x] `T-AGENT-083` 完成 Agent renderer 异步测试 harness 收敛：`renderWithI18n` 提供显式、默认关闭的 effect settlement 选项；工作台和 legacy Codex Provider 测试仅在需要时启用，覆盖初始加载与重新进入 Overview，不改变生产组件或持久化边界。
- [x] `T-AGENT-084` 以 CC Switch v3.18.0 公开协议和交互流程为参考，在 PromptHub 边界内独立实现 Codex legacy -> unified Profile 显式迁移、main-only 凭据复制与批次补偿、完整 Codex Provider activation adapter，并在回归通过后移除 legacy renderer 事实源。完成 `FR-AGENT-024`、`DES-AGENT-020`、`TEST-AGENT-049` 和 `T-AGENT-079`；推进但不替代仍需全平台验证的 `TEST-AGENT-004`、`TEST-AGENT-005`、`TEST-AGENT-007` 与 tray 尚未完成的 `TEST-AGENT-013`。

## Phase 1: Core Workbench

- [x] `T-AGENT-017` 实现 Claude Code provider adapter：`settings.json` 的 inspect/import/plan/apply/verify/rollback、Anthropic API Key/Auth Token 凭据投影、平台原生认证保留，以及隔离的 `/v1/models` 连通性和 Messages SSE 模型测试；不读取或改写 Claude-owned `.credentials.json`。
- [x] `T-AGENT-018` 实现 Codex CLI provider adapter：inspect/import/plan/apply/verify/rollback 与隔离连通性检查。统一 Profile adapter 已完成完整激活链路；连通性检查使用 main-only 凭据、受限 `/models` 请求、SSRF/DNS 防护、8 秒总超时、1 MiB 上限、零重试和稳定脱敏分类。
- [x] `T-AGENT-085` 完成 `TEST-AGENT-012` 的显式流式模型测试：最小推理、首 token 延迟、用户 abort、connect/first-token/total timeout、一次有限重试、quota 确认和安全响应预览；该结果与 `/models` 连通性检查分别展示。
- [x] `T-AGENT-019` 为仍受支持的企业/付费 API 场景实现 Gemini CLI provider adapter：inspect/import/plan/apply/verify/rollback/test；普通用户入口保持 Antigravity。
- [x] `T-AGENT-086` 实现 Kimi Code 完整 Provider adapter：基于官方 `config.toml` provider/model 协议完成 inspect/import/plan/apply/verify/rollback/test，平台 OAuth/ADC/custom headers 保持外部所有，PromptHub-owned key 使用 secure secret 与加密备份；不复制或 vendoring 上游源码。
- [x] `T-AGENT-087` 实现 Qwen Code 完整 Provider adapter：基于官方 current `settings.json`/`.env` provider-model 合同完成 inspect/import/plan/apply/verify/rollback/test；自定义 provider 通过 `providerProtocol` 映射，平台所有的 OAuth/ADC/Coding Plan 和非 Profile credential source 保持只读；不复制或 vendoring 上游源码。
- [x] `T-AGENT-088` 实现 OpenCode 完整 Provider adapter：基于官方 current v1 `opencode.json(c)` 与 XDG data-root `auth.json` 合同完成 inspect/import/plan/apply/verify/rollback/test；仅支持官方文档明确的 OpenAI-compatible custom provider 包，原生 API/OAuth/well-known/environment/file/cloud credential 保持只读，v2 plural provider 合同保持拒写；不复制或 vendoring 上游源码。
- [x] `T-AGENT-089` 按 `FR-AGENT-036` / `DES-AGENT-036` 实现 GitHub Copilot CLI current root/asset inventory 与 `partial` model-only adapter，完成 `TEST-AGENT-054`；环境型 BYOK、原生 auth、session store、permission 和 Plugin metadata 保持平台所有。
- [x] `T-AGENT-090` 按 `FR-AGENT-037` / `DES-AGENT-037` 禁止 Copilot 的伪文件系统安装语义，保留已安装 Plugin 只读发现，并完成 `TEST-AGENT-055`。
- [x] `T-AGENT-091` 按 `FR-AGENT-038` / `DES-AGENT-038` 校正 Cursor current asset inventory，保留 Marketplace/local Plugin 只读发现，禁止未验证的文件系统分发，并完成 `TEST-AGENT-056`。
- [x] `T-AGENT-092` 按 `FR-AGENT-039` / `DES-AGENT-039` 校正 Cherry Studio current v2 database precedence、Skill/launch projection 和 composite Plugin 门禁，并完成 `TEST-AGENT-057`。
- [x] `T-AGENT-093` 按 `FR-AGENT-040` / `DES-AGENT-040` 实现 Windsurf opt-in public transcript 只读 adapter，翻转 Sessions 为 partial，并完成 `TEST-AGENT-058`；不得解析 proprietary Cascade protobuf runtime。
- [x] `T-AGENT-094` 按 `FR-AGENT-041` / `DES-AGENT-041` 实现 Kiro model-only 配置与 partial 只读 session adapter，校正 Power 原生安装边界，并完成 `TEST-AGENT-059`。
- [x] `T-AGENT-095` 按 `FR-AGENT-042` / `DES-AGENT-042` 实现 Grok Build Provider & Model adapter，先完成 `TEST-AGENT-060` 红测，再接入 capability、IPC、Profile UI、7 locales、稳定文档与 targeted gates。
- [x] `T-AGENT-096` 按 `FR-AGENT-043` / `DES-AGENT-043` 校正 Amp current path/asset boundary，接入 owning MCP domain 的全局/项目 `amp.mcpServers` target，先完成 `TEST-AGENT-061` 红测，再同步 capability 与稳定文档。
- [x] `T-AGENT-097` 按 `FR-AGENT-044` / `DES-AGENT-044` 修复 Provider Profile secret replacement 在 legacy cleanup 失败后的跨存储补偿顺序，先完成 `TEST-AGENT-062` 红测，再运行 Profile/DB/IPC 安全回归。
- [x] `T-AGENT-098` 按 `FR-AGENT-010` / `DES-AGENT-045` 实现 device-local session source/index schema、幂等迁移、事务型 full/incremental scan primitives、annotation preservation 和 bounded query，先完成 `TEST-AGENT-063` 红测；本批不接入 transcript 扫描器或 renderer。
- [x] `TEST-AGENT-064` 用真实 SQLite 与 Claude/Gemini fixture 覆盖显式 opt-in、增量复用、同一事务 full scan、per-file parse-error、取消不提交、source missing、bounded search/pagination，以及 transcript 始终 live-read。
- [x] `T-AGENT-099` 按 `DES-AGENT-046` 将 Claude/Gemini verified readers 接入 device-local session metadata index orchestration；本批完成 main-process service，renderer progress/cancel IPC 在同一设计的后续 UI wiring 中完成。
- [x] `TEST-AGENT-065` 覆盖 session index IPC 输入验证、renderer-scoped refresh/cancel/destroy cleanup、redacted state/progress，以及 UI 显式启用、刷新、取消、后端搜索和 late-result invalidation。
- [x] `T-AGENT-101` 按 `DES-AGENT-047` 完成 session index shared/preload/IPC/renderer wiring 和 7 locales，不向 renderer 暴露 root、cursor、digest 或 transcript body。
- [x] `TEST-AGENT-066` 覆盖托盘 Provider Profile 分组、真实 verified-current 重校验、stale/error 降级、确认/取消/review/failure、同一 activation runtime、异步菜单刷新、late-result 销毁隔离、7 locales 和零内部错误泄漏。
- [x] `T-AGENT-102` 按 `DES-AGENT-048` 抽取并共享 Provider runtime，将 verified Provider Profile 投影与 quick switch 接入托盘；冲突进入 Agent 工作区，成功后从 SQLite 与原生 preview 重新加载，不建立第二 active-provider 状态源。
- [x] `TEST-AGENT-067` Agent CLI 只读诊断：canonical registry 派生、PATH/prefix-like 路径、版本归一化、candidate fallback、unsupported/missing/timeout/non-zero/超限、redaction、IPC 输入校验、诊断弹窗和 7 locales。
- [x] `T-AGENT-103` 实现 `DES-AGENT-049` 的 Agent CLI 只读检测、版本诊断和维护弹窗；不提前开放 install/update 写操作。
- [x] `TEST-AGENT-068` OpenClaw CLI 证据回归：canonical registry 仅声明 `openclaw --version` 和官方 evidence，维护能力保持 `partial`，不得把官方 install/update 命令误报为已实现生命周期。
- [x] `TEST-AGENT-069` Provider 工作台当前状态回归：workspace 与 tray 复用同一 verified-current projection；verified 显示当前标记并禁用重复激活，none/stale/unavailable 不误报当前；成功激活后重新读取原生状态；IPC 仅返回 platform/status/profile id/timestamp，7 locales 完整。
- [x] `T-AGENT-104` 将 OpenClaw 官方只读版本合同接入 `DES-AGENT-049`；复用既有诊断服务、IPC 和 UI，不增加第二 CLI inventory，也不执行安装、更新或 Gateway 命令。
- [x] `T-AGENT-114` 按 `DES-AGENT-059` 为 OpenCode 接入显式 review/confirm/apply/verify/rollback 更新流程；命令只来自 canonical registry，计划由 main 持有并绑定 renderer，失败仅返回稳定脱敏结果。安装与其他 CLI 更新仍留在 `T-AGENT-029`。
- [x] `TEST-AGENT-081` Codex npm 更新回归：canonical registry、npm/Node version-manager 来源允许列表、Homebrew/standalone/system/unknown 拒绝、npm 缺失、不可变 review plan、固定参数、同 executable/version 前置条件、same-path verify、精确版本 rollback、部分失败、重放/renderer ownership 和脱敏。
- [x] `T-AGENT-118` 按 `DES-AGENT-063` 为 npm-managed Codex 接入显式 review/confirm/apply/verify/rollback；不得把 Homebrew、standalone 或模糊来源误报为可更新，不增加第二 CLI inventory。
- [x] `TEST-AGENT-082` Qwen 深分页详情回归：300+ native JSONL 元数据、200 条后会话可读、256 条元数据上限、cache miss fallback、路径重新校验、软链接逃逸和 transcript 零持久化。
- [x] `T-AGENT-119` 按 `DES-AGENT-064` 为 Qwen live session adapter 增加有界进程内 metadata continuity；不得扩大 transcript 所有权、跳过 runtime realpath 校验或建立第二 session store。
- [x] `TEST-AGENT-083` Qwen npm 更新回归：canonical registry、npm/Node version-manager 来源允许列表、standalone/Homebrew/source/system/unknown 拒绝、npm 缺失、不可变计划、固定参数、同 executable/version 前置条件、精确版本回滚、部分失败和脱敏。
- [x] `T-AGENT-120` 按 `DES-AGENT-065` 为 npm-managed Qwen Code 接入 review/confirm/apply/verify/rollback；不得宣称 standalone、Homebrew、source build 或安装流程已受支持。
- [x] `TEST-AGENT-084` Agent Rules 快速编辑回归：按解析路径优先选择 built-in/custom/shared-root 规则，Agent 切换不闪现旧内容，缓存缺失最多强制扫描一次，缺失/失败可重试，并通过复用的 Rules 编辑器完成草稿、保存、快照和冲突工作流。
- [x] `T-AGENT-121` 按 `FR-AGENT-051` / `DES-AGENT-066` 将 Agent Rules 页从通用只读资产清单切换为现有 Rules 工作台的薄选择适配；不得创建第二 rule store、IPC、持久化或复制编辑器实现。
- [x] `TEST-AGENT-085` Rules 紧凑编辑回归：AI 改写和版本快照通过弹窗进入，成功/失败、空历史、来源标签、展开收起、选择预览、恢复和删除路径均可观察；新增弹窗组件达到 100% statement/branch/function/line coverage。
- [x] `T-AGENT-122` 按 `FR-AGENT-052` / `DES-AGENT-067` 将 Rules 编辑器收敛为单画布和紧凑头部动作，复用共享 Modal/Button/ConfirmDialog/Toast；不得增加第二编辑器、持久化、IPC 或独立历史状态源。
- [x] `TEST-AGENT-086` Agent 详情头部密度回归：身份/动作行不得包含固定最小高度，内容垂直居中，tab strip 不得再添加独立顶部空隙。
- [x] `T-AGENT-123` 按 `FR-AGENT-053` / `DES-AGENT-068` 移除 Agent 详情头部的固定空白带，同时保留动作换行、生命周期提示自然增高和现有 tab 可访问性。
- [x] `TEST-AGENT-087` Rules 编辑画布密度回归：主编辑面不得使用外层 `p-6` inset，draft wrapper 不得带圆角或阴影，现有可编辑 textarea 和状态行保持可用。
- [x] `T-AGENT-124` 按 `FR-AGENT-054` / `DES-AGENT-069` 将 draft 和版本 diff 改为内容区直铺表面，移除重复卡片边缘而不改变 Rules 状态、持久化或交互合同。
- [x] `TEST-AGENT-088` Rules Markdown 编辑回归：复用 CodeMirror Markdown 语言和 keymap，覆盖语法表面、列表续行、父值同步不重复发射、只读切换、编辑/预览/分栏、源行语义双向滚动、应用内目录跳转、回到顶部、折叠箭头居中、book 预览图标与七语言可访问标签。
- [x] `T-AGENT-125` 按 `FR-AGENT-055` / `DES-AGENT-070` 用已有共享 CodeMirror 能力替换 Rules textarea，并以同一 draft 在工具栏最右侧、统计信息之后增加编辑/预览/分栏选择器；不得使用 eye 预览图标、增加编辑器依赖、第二 draft 状态或独立持久化。
- [x] `TEST-AGENT-089` AI 优化选择回归：覆盖多供应商 chat 模型过滤、默认模型、切换后的精确请求配置、legacy fallback、缺失凭据/空模型与失败不关闭弹窗。
- [x] `T-AGENT-126` 按 `FR-AGENT-056` / `DES-AGENT-071` 扩展 AI 优化弹窗并把选定模型传给现有 rewrite store/IPC 请求；不得修改全局默认或显示凭据。
- [x] `TEST-AGENT-090` 版本历史对比回归：覆盖空历史、有界展开、弹窗内切换快照、完整行 diff/无差异、中性图标来源元数据、恢复到 draft、删除确认和 editor 不被预览替换。
- [x] `T-AGENT-127` 按 `FR-AGENT-057` / `DES-AGENT-072` 将历史弹窗改为 master-detail 对比并删除 RulesManager 的临时版本预览状态；不得建立第二历史事实源。
- [x] `TEST-AGENT-091` 规则文件定位回归：覆盖 exact file path、bridge 缺失、Promise rejection 和 shell failure 均可观察，且不修改 draft。
- [x] `T-AGENT-128` 按 `FR-AGENT-058` / `DES-AGENT-073` 通过已有 shell boundary 精确 reveal 当前规则文件并补齐错误反馈；不得增加 IPC。
- [x] `TEST-AGENT-092` Agent 资产视觉与顺序回归：覆盖 Skills/MCP/Plugins 连续排列、Qwen Definitions 不拆散资产组、MCP/Plugin 共用有界双列卡片网格，以及 Plugin 使用 `PlugIcon`。
- [x] `T-AGENT-129` 按 `FR-AGENT-059` / `DES-AGENT-074` 统一 MCP/Plugin 与 Skill 的卡片语言并调整 tab 顺序；继续复用 owning-domain inventory，不增加 store、IPC、持久化或伪动作。
- [x] `TEST-AGENT-093` Agent 资产管理回归：覆盖 Skills/MCP/Plugins 共用同一管理 surface 与右侧加号主操作、长本地化筛选不把主操作换到第二行、各自主操作进入 Skill 选择/MCP 目标/Plugin 商店 owning workflow、无 MCP 目标时仍可添加首个目标、MCP/Plugin 卡片选择、详情、配置/导入/分发/打开目录/卸载快捷操作，PromptHub 管理的 Plugin 分发和 My Plugins 删除均需二次确认，外部 Plugin 不伪造删除动作；目标按 Agent 隔离，刷新与失败状态可观察，新增文案覆盖七种语言，工具条不显示原始资产路径，且不回归 Skills 操作。
- [x] `T-AGENT-130` 按 `FR-AGENT-060` / `DES-AGENT-075` 将 Agent MCP/Plugin 页接入现有管理工作台和 owning stores；删除只读泛化卡片路径，并抽取 Skills/MCP/Plugins 共用的 toolbar、筛选、右侧加号主操作、双列 grid、card、action footer、空态与 pager 原语。共享工具条保持单行，筛选区有界横向滚动，刷新和添加动作固定在右侧；工具条只保留本地化筛选、刷新与主操作而不展示原始路径，三个域只保留自己的数据和动作。Plugin 目标卡通过已分发目标关联 My Plugins，并复用确认弹窗和 canonical remove/delete store 操作，不新增持久化、IPC 或外部目录删除。
- [x] `TEST-AGENT-094` Agent family 分组回归：验证 Hermes 与 OpenClaw/QClaw 同属 Claw 分组，Code / Work 平台仍保持独立，规则排序与设置页复用同一分类策略。
- [x] `T-AGENT-131` 按 `FR-AGENT-061` / `DES-AGENT-076` 将 Hermes 加入显式 Claw family registry；保持独立 platform id、根目录、能力声明和规则文件路径，不引入产品别名或兼容性推断。
- [x] `TEST-AGENT-095` 按 `FR-AGENT-062` 覆盖五个本地 Claw 平台的独立 registry id、Claw 分组、能力 planned/partial 状态、兼容根目录候选和真实品牌图标资产；先完成红测再接入实现。
- [x] `T-AGENT-132` 按 `FR-AGENT-062` / `DES-AGENT-077` 接入 CoPaw、AutoClaw、NanoClaw registry、路径候选、Claw family 分类、能力声明、官方图标与稳定资产文档；不伪造 Provider/Session/Usage/CLI/MCP/Rules 适配器。
- [x] `TEST-AGENT-096` 按 `FR-AGENT-063` 覆盖 Copilot 原生 SQLite session store 的真实建表 fixture、分页排序、标题回退、metadata/turn 搜索、只读详情、缺失 store、非法来源、畸形字段和字段/行/总字节截断。
- [x] `T-AGENT-133` 按 `FR-AGENT-063` / `DES-AGENT-078` 接入 Copilot `session-store.db` 的只读 History adapter、`COPILOT_HOME` 根解析、live adapter 搜索透传、partial capability 和 7 locales 现有 History 工作台；不得写入、索引、备份或同步 Copilot 原生会话。
- [x] `TEST-AGENT-097` 按 `FR-AGENT-064` 覆盖 Cline `sessions.db` + JSON snapshot、legacy task fallback、metadata/turn 搜索、用户/助手可见性、`messagesPath` 路径边界、malformed/oversized/symlink 输入、分页排序和原生 resume 命令。
- [x] `T-AGENT-134` 按 `FR-AGENT-064` / `DES-AGENT-079` 接入 Cline `data/sessions` 只读快照适配器、`data/tasks` 兼容读取、`CLINE_DATA_DIR` 根解析、live 搜索透传、partial capability 和现有 History 工作台；不得启动 Cline hub/CLI，不得写入、索引、备份或同步 Cline 原生会话。
- [x] `TEST-AGENT-098` 按 `FR-AGENT-065` 覆盖 Cursor `projects/*/agent-transcripts/*/*.jsonl` 的真实形状、分页排序、visible-turn 搜索、用户/助手可见性、2 MiB 截断、malformed/symlink/missing-root 输入和原生 resume 元数据。
- [x] `T-AGENT-135` 按 `FR-AGENT-065` / `DES-AGENT-080` 接入 Cursor 只读 Agent transcript 适配器、root override、bounded live 搜索透传、partial capability 和现有 History 工作台；不得读取私有 settings DB、checkpoint、snapshot、凭据或写入/索引/备份/同步 Cursor 原生会话。
- [x] `TEST-AGENT-107` 用户级 Config Files 回归：覆盖多文件递归发现、声明但缺失文件、runtime/credential/Skill/Plugin/backup 排除、软链接/越界、密钥 IPC 脱敏与保留、结构化格式校验、stale revision、加密备份、原子替换、重读验证和失败回滚；独立 Electron E2E 验证真实 HOME 下的多文件树、排除、脱敏保存和加密备份。
- [x] `T-AGENT-144` 将 Config Files 从单文件 allowlist 升级为用户级配置空间：main-owned bounded discovery、安全排除、脱敏 IPC、expected revision、格式校验、加密备份、原子写入、验证回滚和动态文件计数；不增加项目级配置或结构性文件操作。
- [x] `TEST-AGENT-108` Electron 开发启动回归：锁定 Vite Electron 插件为唯一 Electron 生命周期所有者；覆盖根级 render/bootstrap 恢复、单次自动重载、冷却与 storage 失败，并用真实 `pnpm dev` 验证窗口持续加载、Vite reload 后重连且 Agent 懒加载模块可用。
- [x] `T-AGENT-145` 移除 desktop `electron:dev` 的重复 Electron 启动链，保留插件 `args.startup(["."])` 单一生命周期；增加根级 renderer recovery boundary，避免启动、lazy import 或 HMR 异常清空页面。
- [x] `TEST-AGENT-109` Agent 编辑适配回归：遍历全部内置平台核对字段与 canonical registry 一致，覆盖旧 override 可恢复、自定义 Agent 全字段、两个编辑入口保存、目录选择和不再推断 agents/commands；真实 Electron 核对 WorkBuddy 与 CodeBuddy 相反能力样本。
- [x] `T-AGENT-146` 增加 canonical Commands 路径声明和共享编辑适配器，使 Agent workspace 与 Settings 的内置/自定义编辑都保存真实平台字段。
- [x] `TEST-AGENT-110` 未安装 Agent 管理门禁回归：覆盖刷新后不进入列表/计数/搜索、旧选中项回退、直接注入未检测详情时仅概览可用，以及配置/资产/会话/供应商/外观/用量读取均不触发。
- [x] `T-AGENT-147` 将 Agent store 收敛为 installed-only workspace projection，并为详情标签、概览和编辑动作增加未检测防御门禁；保留完整 registry 与检测合同。
- [x] `TEST-AGENT-111` 按 `FR-AGENT-076` 覆盖 Antigravity CLI `.db` conversation identity、CLI cache 项目关联、generated transcript 可见消息、database-only partial detail、搜索/分页、`agy --conversation`、missing/malformed/oversized/symlink/traversal 输入和 legacy desktop `.pb` 排除。
- [x] `T-AGENT-148` 按 `FR-AGENT-076` / `DES-AGENT-091` 接入 Antigravity CLI 只读 History adapter、bounded live search、partial capability 和现有 History 工作台；不得解码/写入 SQLite protobuf blob 或 legacy desktop `.pb`，不得索引、备份、同步或删除原生会话。
- [x] `TEST-AGENT-112` 按 `FR-AGENT-077` 覆盖 Skills/MCP/Plugins 共用 icon/title/status/description/source/chips/action footer 卡片骨架、固定外框和有界内容槽、跨域 class 一致性、每类身份图标、操作按钮保留，以及中日韩 locale 的 `Plugins` 稳定术语。
- [x] `T-AGENT-149` 按 `FR-AGENT-077` / `DES-AGENT-092` 抽取共享 `AgentAssetCardContent`，迁移 Skills/MCP/Plugin 卡片内容并统一 Agent tab 的 `Plugins` 标签；将标题、描述、来源、metadata/supplementary 限制在固定槽位并锚定 action footer，不得改变 owning store、IPC、持久化或域动作。
- [x] `TEST-AGENT-113` 覆盖 Agent 详情头部与资产区共用 `px-5` 左边界，以及 Skills/MCP/Plugins 工具栏均不再渲染搜索框前重复标题；真实 Electron 窗口复核搜索、筛选、路径、刷新和新增按钮布局。
- [x] `T-AGENT-150` 完成 `FR-AGENT-078` / `DES-AGENT-093`：统一 Agent 头部与资产工作区左边界，从共享资产工具栏移除重复域标题，不改变 owning-domain 资产动作。
- [x] `TEST-AGENT-114` 按 `FR-AGENT-079` 覆盖 Codex 超过 2 MiB 隐藏记录前缀后的可见消息、current `response_item/message` 与 legacy `event_msg` 双格式、私有 developer/reasoning/tool/image 排除、跨页无重复、source-bound cursor、扫描预算续游标、IPC/preload limit/cursor 校验、UI 追加页和 stale selection 隔离；补充 Augment native JSON、搜索、分页、恢复与私有字段排除回归；追加 Pi 超过旧 2 MiB 预览边界后的完整 cursor 页链和 UI 不显示永久有限预览提示回归。
- [x] `T-AGENT-151` 按 `FR-AGENT-079` / `DES-AGENT-094` 将 Session detail 升级为 main-owned cursor 分页，接入 Codex streaming JSONL 及 current/legacy visible-message projector、Augment native JSON、Pi/Oh My Pi JSONL 和 History load-more，并让导出/交接收集完整页链；不得把 native transcript body、路径或字节偏移持久化到 DB/renderer/sync。
- [x] `TEST-AGENT-115` 覆盖 Skills/MCP/Plugins 三类 Agent 资产打开与返回时的统一详情状态，以及打开 MCP 卡片后详情替换整个右侧工作区、隐藏 Agent 头部/页签并在返回后恢复；真实 Electron 逐类验证打开、返回和工作区恢复。
- [x] `T-AGENT-152` 按 `FR-AGENT-080` / `DES-AGENT-095` 将三类 Agent 资产详情导航提升到 workspace shell；保留各 owning domain 的选中项、详情组件和动作，不增加路由、store 或持久化状态。
- [x] `TEST-AGENT-116` 覆盖 Cherry Studio 当前/旧版 Agent DB 与 Kilo 本地 JSON 的列表、正文搜索、排序、cursor 分页、缺失源、非法 schema/JSON、symlink、路径越界、隐藏 runtime part 排除、2,001 会话分页和 Kilo 原生续接元数据。
- [x] `T-AGENT-153` 按 `FR-AGENT-081` / `DES-AGENT-096` 接入 Cherry Studio Agent 会话只读数据库与 Kilo session/message/text-part 只读适配器，翻转精确 capability，不伪装 Cherry 普通聊天、TRAE 私有状态或其他无证据平台。
- [x] `TEST-AGENT-117` 覆盖主 MCP 管理与 Agents 管理打开 Agent MCP 后均使用 split-sidebar 详情、展示 Agent 来源侧栏、配置路径和真实 managed/external 状态；保留两处既有导入、打开配置、打开已纳管项和卸载回归。
- [x] `T-AGENT-154` 按 `FR-AGENT-082` / `DES-AGENT-097` 抽取共享 `AgentMcpEntryDetail`，让 `McpAgentsView` 与 `AgentMcpAssetPanel` 复用完整详情组合，不改变各入口的选择、返回、IPC 或持久化所有权。
- [x] `TEST-AGENT-118` 覆盖 Skill 与 Plugin 的共享 Agent 详情适配器：managed/external/read-only/copy/symlink 状态、导入、打开文件夹、打开已纳管项、打开商店与卸载动作均由同一映射产生，并验证只读 Skill 不暴露卸载、直接进入 Agents 时先加载 My Skills 再判定托管状态、加载进行中不重复读取。
- [x] `T-AGENT-155` 按 `FR-AGENT-083` / `DES-AGENT-098` 抽取 `AgentSkillDetailPage` 与 `AgentPluginDetailPage`，让 owning workspace 与 Agents workspace 复用 canonical full detail 和同一 Agent action adapter，修复只读 Skill 卸载差异、Plugin 商店空回调和导航顺序导致的 Skill 托管状态误判。
- [x] `T-AGENT-105` 按 `DES-AGENT-050` 将 Provider 工作台接入与托盘共用的 verified-current query；先完成 `TEST-AGENT-069` 红测，再补 shared/IPC/preload/store/UI 与 7 locales，不建立第二 active-provider 状态源。
- [x] `T-AGENT-106` 按 `FR-AGENT-045` / `DES-AGENT-051` 将 Provider endpoint 固化为无凭据公共元数据；先完成 `TEST-AGENT-070` 红测，再接入 shared validator、SQLite create/update/read、Profile 表单和 7 locales；不静默迁移旧行，不引入第二 credential store。
- [x] `T-AGENT-107` 按 `FR-AGENT-046` / `DES-AGENT-052` 将 Provider public JSON validator 接入 Profile config、model mapping、audit snapshot 的 SQLite write/read 与 baseline recovery；先完成 `TEST-AGENT-071` 红测，不迁移旧 unsafe row，不扩展凭据权限。
- [x] `T-AGENT-108` 按 `FR-AGENT-047` / `DES-AGENT-053` 为 Session metadata refresh 增加 pre-scan、分页和 commit 前取消屏障，并完成精确 10,000 条真实 SQLite 压力回归；不扩展 transcript 所有权、同步或备份范围。
- [x] `TEST-AGENT-073` 覆盖 Provider Profile 可移植备份的严格格式校验、容量限制、凭据与设备本地引用排除、真实 SQLite 导出/事务恢复/故障回滚、同设备与跨设备 secret readiness、IPC/preload、完整桌面备份接线、旧备份兼容和 transcript/runtime 排除。
- [x] `T-AGENT-109` 按 `FR-AGENT-048` / `DES-AGENT-054` 将 Provider Profile、model mapping 和 redacted snapshot 接入完整桌面备份；main process 保持 secret 与本机 backup ref 所有权，旧备份不清空 Agent 数据。本批不包含 Agent 选择性导出、session source preference 或跨设备路径修复。
- [x] `TEST-AGENT-074` 覆盖选择性导出的 Agent scope 开关、关闭时不查询 main、Full Backup/升级前备份始终启用、7 locales 文案与键盘可操作 selector。
- [x] `T-AGENT-110` 按 `FR-AGENT-049` / `DES-AGENT-055` 将 Agent scope 接入选择性 ZIP、Full Backup 和升级前备份，修复用户可见完整备份遗漏 Provider Profile 的差异；不复制 Settings 或 owning-domain 资产。
- [x] `TEST-AGENT-075` 覆盖 session source preference 的旧格式兼容、严格格式/容量/重复校验、绝对路径与 runtime 数据排除、当前设备根目录重绑定、unsupported 报告和 session 写入失败时的整段事务回滚。
- [x] `T-AGENT-111` 按 `FR-AGENT-050` / `DES-AGENT-056` 将有界 session enabled preference 接入唯一 Agent 备份格式，复用现有 session descriptor 和 SQLite owner 完成跨设备路径重绑定，不备份 index/transcript/runtime。
- [x] `T-AGENT-100` 固化 CC Switch 复用边界：以 MIT `v3.18.0` 为已审计证据，允许按组件复用公开工作流、协议和小型独立实现；每次源码级复用必须记录上游路径、tag/commit、许可证、PromptHub ownership 与安全/回归验证，禁止把外部 checkout 或整套 Tauri/Rust/SQLite/UI 子系统复制进应用 `public/` 或发行包。本批未引入 CC Switch 运行时代码。
- [x] `T-AGENT-020` 接入 desktop main IPC、preload `agent` domain API 和 renderer query/action store。（config/model/session、Provider Profile CRUD、import/preview/activation main IPC/preload 与 Provider Profile renderer query/action store 已完成；具体 UI 由 `T-AGENT-021`/各平台 adapter 任务按 capability 接入）
- [x] `T-AGENT-021` 按 `ui-design.md` 和 `assets/agent-workbench-overview.png` 实现所有 Agent 共用的一级工作区和 detail shell：Overview、Provider & Model、Skills、MCP、Rules、Plugins、Config Files、Sessions、Usage、Maintenance；仅由 capability state 和已解析路径控制可用性，不引入 Assets 二级入口。
- [x] `T-AGENT-021A` 启用 allowlisted Config Files 页：补齐首批已验证平台配置路径、复用受限文件编辑器、打开 Agent 根目录、禁止结构性文件变更且不创建版本历史。
- [x] `T-AGENT-021B` 将 Agents 的桌面首页默认位置设为第二位，并兼容旧默认配置而不覆盖用户自定义排序。
- [x] `T-AGENT-022` 实现两个 verified session adapters、增量索引、搜索、只读 viewer 和 resume command。（Claude、Gemini 已完成显式 opt-in 的持久化 metadata index、增量复用、后端搜索、live-read viewer 与 resume；精确 10,000 条 SQLite 压力和取消竞态由 `TEST-AGENT-072` 覆盖。外部 transcript 删除不在本任务范围。）
- [x] `T-AGENT-023` 扩展 backup/export/import 格式、验证、恢复顺序和旧格式兼容。（`T-AGENT-109` / `110` / `111` 已完成 Provider Profile、model mapping、redacted snapshot、secret readiness、Agent 选择性/完整 ZIP scope、有界 session enabled preference、当前设备路径重绑定和旧格式兼容；`TEST-AGENT-014` 已闭合。）
- [x] `T-AGENT-024` 扩展托盘 Agent/provider 快速切换并复用统一 activation service。
- [x] `T-AGENT-025` 补齐 7 locales、可访问性、窄窗口、长文本和大数据量回归。（7 locales、tab/row 语义、响应式基础、60 Agent、120 Provider Profile、10,000 session metadata 和 1,000 Agent 资产有界渲染均已完成）
- [x] `T-AGENT-112` 按 `DES-AGENT-057` 为 Agent sidebar 和 Provider Profile master list 接入已有 `@tanstack/react-virtual`，收敛 header 长文本/窄窗口布局并完成 `TEST-AGENT-076`；不得新增 Agent/Profile 事实源或持久化状态。
- [x] `T-AGENT-113` 按 `DES-AGENT-058` 为 Agent Skill 卡片与 MCP/Rules/Plugin inventory 增加共享有界分页，完成 1,000 资产 `TEST-AGENT-077`；不得复制 owning-domain 状态或改变资产操作对象。
- [x] `T-AGENT-115` 按 `DES-AGENT-060` 修复 Agent 切换后焦点滞留在 disabled tab 的键盘陷阱，并建立 Agent workspace 七语言 leaf-key 对齐回归；不新增 UI 状态、事实源或持久化。

## Project Conversation Continuation

- [ ] `T-AGENT-136` 先实现 `TEST-AGENT-099` 红测，再把所有 verified session adapters 接入统一 device-local catalog，复用现有 project registry，完成精确路径关联、`needs-project`、跨 Agent/项目分页搜索和 Agent detail filtered projection；不得建立第二 transcript 或 project store。
- [x] `T-AGENT-137` 先实现 `TEST-AGENT-100` 红测，再扩展 PromptHub-owned conversation annotations、archive 和 adapter-owned native-delete gate；会话域不提供软删除或恢复，原生删除失败不得修改 metadata，不得改写或通用 unlink 原生 transcript。（PromptHub metadata、archive 与 Codex adapter-owned native delete gate 已交付；其他 Agent 继续保持无删除能力。）
- [x] `T-AGENT-138` 先实现 `TEST-AGENT-101` 红测，再增加 main-owned native resume plan/apply IPC、preload contract 和 UI 主动作；执行时重新解析 session、Agent executable 和 project cwd，使用 typed args、`shell: false` 与稳定错误，不再把 Copy command 作为唯一恢复入口。
- [ ] `T-AGENT-139` 先实现 `TEST-AGENT-102` 红测，再定义 target-Agent handoff capability matrix、full/recent/summary-only context planner、预算和 exact preview；默认不调用 AI，不暴露 hidden/tool/credential/path 数据。
- [ ] `T-AGENT-140` 先实现 `TEST-AGENT-103` 红测，再实现 target-specific direct 与 launch-only apply adapters、临时 payload 生命周期、取消和部分失败补偿；不得通过 renderer 或 shell 拼接命令。（Claude/Codex macOS direct 与跨平台 launch-only 已交付，fallback 不写剪贴板；其余 target-specific direct adapter 和显式取消仍待实现。）
- [ ] `T-AGENT-141` 先实现 `TEST-AGENT-104` 红测，再增加 device-local handoff lineage persistence、状态机、source/target detail links、retry 和 exact target linking；不得保存 transcript body 或按时间静默关联。（device-local lineage、digest 和 apply 状态已交付；retry、detail links 与 exact target linking 仍待实现。）
- [ ] `T-AGENT-142` 先实现 `TEST-AGENT-105` 红测，再实现 versioned JSON/Markdown 单个与批量导出、redaction、partial warning、safe filename、staging/atomic write 和取消清理；普通导出不得包含 source path、secret 或隐藏 payload。（单会话 versioned JSON/Markdown、安全文件名、可见消息过滤和脱敏已交付；批量、partial warning 与 atomic staging 仍待实现。）
- [ ] `T-AGENT-143` 先实现 `TEST-AGENT-106` 红测，再实现 project-centered Conversation History 三栏工作台、Agent-filtered History、目标 Agent 下拉框、handoff preview、CRUD/导出动作层级、Source Settings、窄窗口、键盘/读屏和 7 locales。（Agent-filtered History、项目/状态筛选、全自定义下拉、紧凑图标续接工具条、角色气泡、Markdown transcript、preview、CRUD/导出动作和 7 locales 已交付；全局 project-centered catalog 与窄窗口分步导航仍待实现。）

## Delivery Batches And Regression Gates

1. **Registry and shell:** complete Agent query, ordering, capability states and the shared UI shell first. All preset Agents must appear before any deep adapter is treated as complete.
2. **Provider foundation:** land secure secret, reconciliation, backup/write/verify/rollback, then add provider adapters one platform at a time behind capability declarations.
3. **Assets and config:** connect owning Skill/MCP/Rules/Plugin services and allowlisted config inventory without introducing duplicate state.
4. **Conversation catalog:** land project association, PromptHub-owned CRUD and
   shared source indexing before replacing the per-Agent History projection.
5. **Continuation and export:** land native resume execution, target capability
   matrix, handoff preview/apply, lineage and JSON/Markdown export before
   enabling the new action hierarchy.
6. **Sessions and tray:** add further verified session adapters and tray actions
   only after shared query/action services are stable.
7. **Backup and breadth:** finish backup/restore, locales, accessibility, E2E
   and additional platform adapters.

Every batch must run its targeted failing tests first, then `pnpm typecheck`, affected unit/integration tests, and `pnpm test:run` before the batch is considered complete. High-risk filesystem, secret, backup, IPC and adapter changes require failure/rollback tests in the same batch.

## Phase 2: Coverage Breadth

- [x] `T-AGENT-162` 先实现 `TEST-AGENT-125` 红测，再按 `FR-AGENT-090` / `DES-AGENT-105` 收紧配置文件 read/write inventory allowlist，隔离跨 Agent 文件缓存与异步结果并复用未保存确认；同步实现记录并运行针对性单测、类型检查和 lint。未检测 Agent 创建配置文件与 `FR-AGENT-075` 冲突，等待产品边界确认，不在本任务内静默改写。

- [ ] `T-AGENT-026` 按常用度、安装量证据、格式稳定性和安全风险持续补齐全部预置平台 adapters；每个平台独立声明 provider/session/config/CLI 能力。
- [x] `T-AGENT-026A` 升级 Kimi 到独立 Kimi Code：保留 `kimi` identity，增加 current/legacy root resolution、current config inventory、非敏感 model adapter、index-first read-only session adapter、7 locales 与稳定文档同步。
- [x] `T-AGENT-026B` 增加 Appearance 一级能力和 Codex adapter：原生外观、固定上游提交的 Codex Dream Skin 注入/切换/恢复运行时及本地 Pet 管理；其他 Agent 按 capability 统一置灰。
- [x] `T-AGENT-026C` 按 Google 官方迁移公告更新 Antigravity CLI / Antigravity 2.0 平台元数据、排序、生命周期提示和稳定文档；保留 Gemini CLI 企业/付费 API 兼容身份，不再把它描述为普通用户当前入口。
- [x] `T-AGENT-026D` 将内置 `codex` 默认展示名统一为 Codex，并在 Codex 内置 Agent 编辑器中增加 Codex/ChatGPT 名称与图标独立偏好；ChatGPT 使用随应用打包的官方明暗 Blossom 资源，覆盖统一身份投影、主题切换、保存/取消/重置、7 locales 和 `TEST-AGENT-044` 持久化回归。
- [x] `T-AGENT-062` 完成 Qwen Code 官方能力、路径、scope、secret/runtime 排除项和 Qoder 分离边界调研；同步 proposal、delta spec、design、task、implementation 与稳定平台资产文档。
- [x] `T-AGENT-063` 实现内置 `qwen` registry、官方图标、`QWEN_HOME`/`QWEN_RUNTIME_DIR` 路径解析、Skills/SubAgents/MCP/Rules/Extensions/config/session capability adapters 与 7 locales；复用 owning domains，不建立重复资产事实源。Definitions 只读工作台已补齐 user/project SubAgents 与 Commands，不复制正文或建立第二事实源。
- [x] `T-AGENT-064` 先落地 `TEST-AGENT-036` 失败用例，再实现 Qwen Code adapters；完成 targeted unit/integration/E2E、backup/sync exclusion、`pnpm typecheck`、affected lint、全量 desktop 回归和稳定文档 converge。Qwen Provider、Session 与 Definitions 已进入真实 Agent workspace Electron E2E；Definitions targeted gate 通过 31 tests 且 changed modules 100% coverage；当前全量 desktop 通过 491 files / 4,432 tests。
- [x] `T-AGENT-071` 适配 Oh My Pi：接入 `oh-my-pi` registry、平台路径/图标 fallback、Skills/Rules/MCP/Plugin 资产派生、全局/项目 MCP presets、allowlisted config files 和有界只读 JSONL Sessions；完成 `TEST-AGENT-042` 与 desktop/shared/core 类型检查。Provider、Usage、凭据和插件安装保持 planned。
- [x] `T-AGENT-072` 按 `DES-AGENT-030` 实现 Oh My Pi `models.yml`/`config.yml` 非敏感 model adapter，接入 `partial` Provider & Model capability，完成 `TEST-AGENT-043`、依赖检查、类型检查与相关回归；已基于上游 `cc00ab161b2721e50d8a96a0dc9552abfd258b8b` 复核 `<root>/agent.db`、OAuth、多账户、broker 与 runtime/environment 凭据所有权，因此不实现完整 Profile endpoint/credential 投影、凭据写入、Quota 或插件包安装。
- [ ] `T-AGENT-027` 实现 Universal Provider 与显式 per-platform projections。
- [x] `T-AGENT-028` 实现 provider model refresh、quota/balance adapters 和 freshness semantics。Provider 连接探针实时读取受支持端点的模型清单并报告数量/目标模型可用性，不持久化第二份模型目录；Claude、Codex、Kimi、Antigravity、Gemini、Copilot 的 quota/balance adapters 使用 60 秒有界内存缓存、`fetchedAt` 与显式 `forceRefresh`，自定义 Provider 和无证据平台不发起伪造查询。
- [ ] `T-AGENT-029` 实现 Agent CLI detect/install/update/diagnose 的 plan/confirm/apply 流程。（只读 detect/diagnose 已完成；OpenCode update 已由 `T-AGENT-114` 完成。Install 与其他 CLI update 仍需逐平台官方安装来源、精确恢复合同和独立回归。）
- [x] `T-AGENT-030` 收口 session-derived usage summaries 与 evidence 分类。当前已验证 session adapters 只提供消息元数据/正文，没有可信 token 计数或价格字段，因此 session-derived usage 明确为 unsupported，不从消息数或文本长度估算；已交付用量只允许 `source: "provider"`，proxy evidence 属于范围锁定的独立高风险变更。
- [x] `T-AGENT-031` 实现 versioned `prompthub://` import preview/confirm，并完成 fuzz/security gate。首个允许对象为 Provider Profile；其他域在拥有独立 portable preview contract 前明确拒绝。
- [x] `T-AGENT-116` 按 `DES-AGENT-061` 交付 Provider Profile 深链切片：复用现有 Profile export/create 服务，不复制 CC Switch 子系统；完成 `TEST-AGENT-079`、targeted tests、typecheck、affected lint 与文档证据。
- [x] `T-AGENT-117` 按 `DES-AGENT-062` 交付 Qwen-only Definitions：主进程有界发现 user/project SubAgents 与 Commands、renderer-safe metadata、project id 路径解析、open 二次校验、专用 master-detail UI、7 locales 和 `TEST-AGENT-080`；不得建立定义 DB、复制 extension 子资产或同步定义正文。

## Separate Changes

- [ ] `T-AGENT-032` 为 local proxy、protocol conversion、failover、request logs 和 cost accounting 单独创建 active change。
- [ ] `T-AGENT-033` 如需 OAuth reverse proxy/account management，先完成 legal/security review 再创建 active change。
- [ ] `T-AGENT-034` 如需 Agent Profile/Persona 组合能力，基于已交付 Managed Agent 模型单独设计，不回退到重复平台记录。

## Provider Preset Catalog (Codex/ChatGPT first, official-config focus)

- [ ] `T-AGENT-170` 先实现 `TEST-AGENT-133` 红测,再按 `DES-AGENT-111`(provider-preset-catalog-design.md)在 `packages/shared` 落地版本化预设目录数据结构与校验器:结构、协议白名单、敏感键拒绝、平台过滤、URL 边界、容量限制;首批只含各 Agent 官方配置与有官方证据的供应商,不含赞助/推广条目。
- [ ] `T-AGENT-171` 按 `FR-AGENT-094` 落地 Codex/ChatGPT 官方预制 + 添加模式数据:OpenAI Official(platform-native,内置 `openai` provider,ChatGPT 登录零改动);第三方以 `[model_providers.*]` 追加,managed `experimental_bearer_token` / `env_key` 互斥;切回官方清理 stale third-party auth 残渣。先红测后实现。
- [ ] `T-AGENT-172` 将预设选择器接入 Provider & Model 右侧配置表单(新增时先选预设 → 自动填充表单);选择即填充、取消零写入、7 locales。
- [ ] `T-AGENT-173` 逐个补齐 Claude / Kimi / OpenCode / Google / Copilot 官方预制数据与表单映射,每平台完成预设 → 表单填充 → 保存 → 激活 → 回滚回归。
- [ ] `T-AGENT-174` 左侧列表视觉收敛:去彩色徽章/卡片阴影,统一轻量行样式;更新既有 workbench 测试与 7 locales。
- [x] `T-AGENT-175` Provider & Model 页视觉收敛:左侧工具区单行化(新增 + 导入 + 源导入图标),Profile 行与原生配置行去卡片化,native detail 去灰底卡片与冗余“可编辑管理”说明,7 locales 清理无用 key,workbench 测试同步更新。
- [x] `T-AGENT-176` Pi Model Catalog 读取层(`DES-AGENT-112` / pi-model-catalog-design.md):pi inspect 读取 settings.json + models-store.json + models.json + auth.json 就绪态,合并内置/自定义目录并脱敏;shared 契约增加可选 `modelCatalog` 字段;先红测后实现。修复上限阻止合并的边界 bug;新模块 100% 覆盖率;agent 主进程 853 tests 全绿。
- [x] `T-AGENT-177` Pi 自定义模型写入层:添加/移除 models.json 的 provider/model,backup/atomic/verify/rollback,未知字段保留,凭据不外泄;先红测后实现。写入中修复两个真 bug:非数组 models 字段的追加崩溃(改为整体替换)、备份失败缺稳定错误码;并发竞态测试改为确定性 hook 注入。新模块 99.36% 行/93.1% 分支覆盖;剩余 315-316 为 jsonc-parser 内存结果 verify 的不可达防御分支,已记录。agent 主进程 870 tests 全绿。
- [x] `T-AGENT-178` Pi Provider & Model UI:provider 列表 + 模型目录 + 添加自定义模型表单 + 设为默认;7 locales。新增 `AgentPiModelCatalogPanel`(左栏每供应商一行:内置+自定义,凭据就绪态/默认标记;右栏模型列表 + 设为默认 + 添加模型/供应商/凭据表单),IPC 五通道与校验,preload API;组件 100% 行 / 99.5% 分支覆盖(残留 finally 插桩标记已记录);i18n 七语言 piModels 文案;相关回归 951 tests 全绿,ESLint/typecheck 干净。

## Converge

- [ ] `T-AGENT-035` 执行 affected unit/integration/E2E、`pnpm typecheck`、`pnpm test:run` 和 release regression。
- [ ] `T-AGENT-036` 更新 `implementation.md`，记录真实 schema、adapters、命令、结果和残余风险。
- [ ] `T-AGENT-037` 将稳定术语、能力矩阵和行为同步到 `spec/knowledge/context`、`structure`、`behavior` 和 `agent-platforms.md`。
- [ ] `T-AGENT-038` 更新长期测试矩阵、coverage map、回归套件、README/用户文档和 release notes。
- [ ] `T-AGENT-039` 完成 Converge 并将 change 移至 dated archive。
- [x] `T-AGENT-040` 定义 `AgentUsageQuota` shared contract、`agent:usage:get` IPC channel 和 preload `agent.getUsage`。
- [x] `T-AGENT-041` 实现 main 进程 Claude Code quota adapter（keychain/hashed/file 凭证解析、usage 查询、60s 缓存、错误分类、token 不出主进程）并完成 `TEST-AGENT-023`。
- [x] `T-AGENT-042` 将 Overview 重构为导航枢纽：真实域计数、点击跳 tab、planned/unsupported 置灰、路径区折叠，拆出 `AgentOverviewPanel.tsx` 并完成 `TEST-AGENT-024`。
- [x] `T-AGENT-043` 实现 Usage tab 面板与概览用量卡片：5h/7d 利用率与重置时间、provider-reported 标签、手动刷新、no-credentials/expired/unavailable 引导态。
- [x] `T-AGENT-044` 将 claude 的 usage capability 翻转为 supported（其余平台保持 planned），补齐 7 locales 并跑全量回归。
- [x] `T-AGENT-045` 实现 main 进程 `agent-secret-store.ts`：复用 cloud-auth safeStorage 模式、secret_ref 键控、0600/原子写、fail-closed，并完成 `TEST-AGENT-026` 的存储部分。
- [x] `T-AGENT-046` 定义 Codex provider shared contract、`agent:providers:*` IPC channels 与 preload 方法。
- [x] `T-AGENT-047` 实现 `agent-codex-provider-service.ts`：model_providers/profiles 增删改、默认 provider 切换、bearer token 投影、连通性测试（SSRF+脱敏），复用备份/原子写/verify/回滚管线并完成 `TEST-AGENT-025` 与 `TEST-AGENT-026`。
- [x] `T-AGENT-048` 实现 Provider & Model tab 第三方 provider 区（列表/新增编辑对话框/删除守卫/设默认/测试）并完成 `TEST-AGENT-027`，补齐 7 locales；凭据编辑借鉴 CC Switch v3.18.0 的可用交互，但继续使用 PromptHub Profile + main-only safeStorage 边界，不复制上游组件或存储模型。
- [x] `T-AGENT-049` 全量回归与文档同步（implementation.md、追溯表勾选）。
- [x] `T-AGENT-050` 重构 workspace 壳层：顶格布局（去页边距/max-width）、固定工具栏 + 内容区滚动、维护并入头部 ⋯ 菜单、概览资产格直达所属页签。
- [x] `T-AGENT-051` 实现 Skills/MCP/Rules/Plugins 顶部直达页签（无通用 Assets 入口和二级导航）、配置文件/外观/用量/会话 tab 的顶格紧凑化，并完成 `TEST-AGENT-028` 对应部分。
- [x] `T-AGENT-052` 将供应商与模型 tab 重构为 master-detail（左 provider 列表 + 右详情），复用现有 provider 表单与测试，7 locales 与全量回归。
- [x] `T-AGENT-053` 在 `agent-usage-service.ts` 增加 Codex quota adapter（auth.json 凭证、wham/usage、窗口按时长分类、自定义 provider 短路）并完成 `TEST-AGENT-029`。
- [x] `T-AGENT-054` 概览 provider-aware 改造：移除能力网格、路径行打开文件夹、供应商与模型格按官方/自定义分流展示，并完成 `TEST-AGENT-030`。
- [x] `T-AGENT-055` usage capability 对 codex 翻转 supported；用量 UI 增加 custom-provider 状态；7 locales 与全量回归。
- [x] `T-AGENT-056` 用量迁入概览：移除 usage tab 与用量格，概览顶部圆环仪表横幅（窗口/倒计时/plan/刷新/引导态），复用 `use-agent-usage`，完成 `TEST-AGENT-031` 与全量回归。
- [x] `T-AGENT-057` 将 `AgentUsageQuota` 契约改为多态 `metrics[]`，迁移 Claude/Codex 适配器与横幅渲染。
- [x] `T-AGENT-058` 实现 Kimi / Antigravity / Gemini / Copilot 配额适配器并完成 `TEST-AGENT-032`。
- [x] `T-AGENT-059` 实现多态横幅（圆环 + 进度条、模型配额截取、i18n 标签），翻转四个平台的 usage capability，完成 `TEST-AGENT-033` 与全量回归。
- [x] `T-AGENT-060` 实现顶部 Skills 页签卡片化（徽标/操作/详情钻取/安装我的 Skill），全部复用 Skills 域现有服务与组件，完成 `TEST-AGENT-034` 与全量回归。
- [x] `T-AGENT-061` 修复 Antigravity 已登录误报：优先读取运行中桌面语言服务的套餐身份与额度数据，钥匙串/旧文件仅作回退；增加 `antigravity-not-running` 引导态、7 locales 和本机真实会话验证，完成 `TEST-AGENT-035`。
- [x] `T-AGENT-065` 接入 `RetrieveUserQuotaSummary` 的两组 weekly/5h 额度池，并增加基于 platform allowlist 的 Agent 一键打开/聚焦能力，完成 `TEST-AGENT-037`。
- [x] `T-AGENT-067` 将 Codex、Grok Build、OpenClaw、Qwen Code 的已验证只读会话适配器接入统一 session service，翻转对应 capability，并完成 `TEST-AGENT-038`、类型检查和桌面构建。
- [x] `T-AGENT-068` 将头部 ⋯ 菜单的设置跳转替换为 Agent 就地编辑弹窗，移除重复的头部 Skills 入口，复用现有编辑器与 settings actions，补齐 7 locales、`TEST-AGENT-039` 和构建门禁。
- [x] `T-AGENT-069` 为 Sessions 增加 offset 分页、列表渲染隔离、长 transcript 渐进展开和原生空状态诊断，完成 `TEST-AGENT-040`、性能验证与桌面构建；OpenCode follow-up 将 cwd-scoped `session list` 元数据发现替换为有界全局 `opencode db` projection，并覆盖全局分页、空状态和 transcript body 排除。
- [x] `T-AGENT-070` 在 Antigravity 桌面未运行时短暂启动安装包内的 allowlisted native helper 查询额度，并在所有结果路径中有界回收进程，完成 `TEST-AGENT-041`。

## Current Gate

Cursor Sessions is now a partial, read-only capability backed by the
evidence-backed local `agent-transcripts` adapter (`FR-AGENT-065` /
`DES-AGENT-080` / `TEST-AGENT-098` / `T-AGENT-135`). The planned/disabled
boundary below applies to Cursor Provider, Usage, Maintenance and Plugin
distribution, not this transcript browsing surface.

Registry、shell、allowlisted raw config、非敏感 model config 和只读 session 批次已进入实现。Kiro 已完成 `chat.defaultModel`、平台托管凭据、可见 Prompt/Assistant session 文本、macOS launch 和禁用 Power 直接分发的当前边界；多文件 steering 未伪装为单文件 Rules。Grok Build 已完成基于 `$GROK_HOME`/`~/.grok/config.toml` 公开合同的完整 Provider & Model adapter：支持三种直接协议、env-owned custom Provider、native session/inline auth 只读保留、main-only probe、加密备份、原子写、语义重读验证和失败回滚，不向 renderer 或 TOML 投影凭据。Amp 已校正为当前 `~/.config/amp` user root 和 Windows legacy fallback，并通过 owning MCP domain 管理 user/project settings 中的 literal `amp.mcpServers`；Provider、hosted threads/usage、raw Config 和 Plugin 文件系统安装没有被误报为 supported。Provider Profile 的 legacy secret 替换已按 DB-first compensation 顺序修复：清理旧 ref 失败时先恢复 Profile/mapping，再恢复 secret；若 DB 补偿失败则保留当前 Profile 仍引用的新 secret 并返回稳定 rollback error。Device-local session source/index schema、幂等迁移、full/incremental scan transaction、missing/parse-error 状态、annotation preservation、bounded query、取消 commit barrier 和 10,000 条规模回归已完成；它只保存 redacted metadata，不保存 transcript body。Claude/Gemini 已接入显式 opt-in 持久化索引，其余 verified adapter 继续使用有界 live reader，未被伪装为已持久化。Model config 仅更新平台原生默认模型字段，保留平台认证所有权；Claude、Codex、Gemini、Grok Build、Kimi Code、Kiro、OpenClaw、OpenCode、Qwen Code、Oh My Pi 的已验证 session 适配器只做有界读取、搜索和可用时的恢复命令。Windsurf 仅对 opt-in `~/.windsurf/transcripts/*.jsonl` 公开导出提供 partial、只读会话浏览，隐藏 code/tool/file payload，`resume` 保持为空，proprietary Cascade protobuf runtime 不解析。ChatGPT 仅是 `codex` 的展示身份，不改变会话根或 adapter。Kimi 已采用 `~/.kimi-code` current root，并对 `KIMI_CODE_HOME`、`KIMI_SHARE_DIR` 和 `~/.kimi` 提供兼容解析。Qwen Code 的 registry、官方图标、root、Skills、MCP、全局 Rules、Extensions、脱敏 model config 和 Sessions 已实现；Oh My Pi 使用 `~/.omp/agent`/`PI_CODING_AGENT_DIR`、`skills/`、`RULES.md`、`mcp.json`、项目 `.omp/mcp.json` 和有界 JSONL Sessions，`models.yml`/`config.yml` 的脱敏 model projection 也已实现。项目 SubAgent/Commands 专用管理、Kiro directory Rules/native Power import、Oh My Pi Usage/凭据/plugin installation、其余 adapter 的持久化索引资格和完整 Electron E2E 仍受各自后续门禁约束。Cursor Sessions 已在 `FR-AGENT-065` 中按 evidence-backed `agent-transcripts` 适配器收敛为 partial、只读；Antigravity CLI 已按当前 `.db` identity、cache 项目映射和 generated transcript projection 实现 partial History 与 `agy --conversation` 原生续接，legacy desktop `.pb` 和 SQLite protobuf body 仍明确排除。其余平台的完整 Provider Profile 切换、凭据投影、删除/清理与同步仍受后续安全、fixture、回滚和性能 gate 约束。

- [x] `TEST-AGENT-119` PromptHub Provider 导入回归：覆盖全局 provider/model 关联、协议与平台兼容矩阵、图片模型过滤、无模型/无凭据、畸形与 stale source、主进程密钥复制、renderer/IPC 脱敏、取消零写入和 Agent 工作台可见状态。
- [x] `T-AGENT-156` 按 `FR-AGENT-084` / `DES-AGENT-099` 接通全局供应商到独立 Agent Provider Profile 的脱敏列表与显式导入；复用既有 Profile、安全存储、激活预览和回滚链路，不建立共享可变记录。
- [x] `TEST-AGENT-120` 覆盖 Hermes、Reasonix、NanoClaw、CoPaw 与 Qoder 当前格式的真实列表、正文搜索、完整 offset 分页、source-bound cursor 详情分页、超长消息、超大 JSONL 单行、损坏记录、schema/identity 不匹配、symlink、路径越界和隐藏 runtime/tool/reasoning 排除；验证 capability 精确区分 17 supported、7 partial 和 11 planned 平台。
- [x] `T-AGENT-157` 按 `FR-AGENT-085` / `DES-AGENT-100` 接入五个 current-format 只读 reader；Qoder 只解析官方 transcript JSONL，QoderWork 在官方未公布 transcript 合同前继续 planned，不伪造原生命令续接。
- [x] `TEST-AGENT-121` 当前原生 Provider 回归：覆盖无 Profile/无 snapshot 时的官方与自定义识别、endpoint/model/credential 状态脱敏、读取失败、外部修改刷新、无竖线卡片与分组字段、当前配置确认导入后直接进入编辑器、Claude/Codex 官方 Profile 创建与复用、无模型/不支持平台拒绝、取消激活零原生写入和工作台可见状态。
- [x] `T-AGENT-158` 按 `FR-AGENT-086` / `DES-AGENT-101` 将 adapter `importCurrent` 的脱敏结果提升为卡片式当前配置视图，明确 Agent-owned 只读边界，并将确认导入衔接到右侧 Profile 编辑器；为 Claude/Codex 接入显式官方 Profile 来源和既有激活预览流程，不向未验证平台伪造官方恢复。
- [x] `TEST-AGENT-122` 覆盖 Claude JSONL 真实 cwd/session id 提取、原生续接命令、旧记录不安全 cwd/id 拒绝，以及历史消息紧凑间距和气泡正文不重复叠加顶部外边距。
- [x] `T-AGENT-159` 按 `FR-AGENT-087` / `DES-AGENT-102` 修复 Claude 原生续接从用户主目录启动导致找不到会话的问题，并收紧消息气泡节奏和续接操作视觉层级；工具/系统提示仅保留角色到正文的最小间距。
- [x] `TEST-AGENT-123` 覆盖会话操作区仅有原 Agent 继续与跨 Agent 续接两个主入口、续接选择按需打开、所有已检测目标可见、直接 CLI 交接、复制后打开应用、仅复制兜底、复制后启动失败、剪贴板失败阻止误启动、独立导出图标、次级 CRUD 菜单，以及 20 条消息分页、直接跳页、跨 cursor 增量读取和预览后源会话更新。
- [x] `T-AGENT-160` 按 `FR-AGENT-088` / `DES-AGENT-103` 收敛原 Agent 原生继续与跨 Agent 可移植续接的两阶段交互；由主进程选择直接交接、复制后打开或仅复制能力层级，并保持固定消息页码栏；确认阶段使用有界、短期、不可持久化的已审阅快照，避免实时 transcript 变化导致误报 stale。
- [x] `TEST-AGENT-124` Provider 右侧编辑回归：新增与编辑均使用右侧 labelled region、无 dialog；新增草稿取消零 IPC 写入；Codex 展示真实协议、端点、主模型及 PromptHub/环境变量凭据模式；保存继续满足 write-only secret 与平台适配请求。

- [x] `TEST-AGENT-125` Agent 配置编辑回归：覆盖已存在但未声明/未发现文件的 read/write 拒绝与原文件不变、已声明和已发现文件继续可用、相同相对路径的跨 Agent 缓存隔离、乱序 list/read 结果丢弃，以及未保存切换取消/确认。
- [x] `T-AGENT-161` 按 `FR-AGENT-089` / `DES-AGENT-104` 将 Provider 新增/编辑改为右侧草稿编辑器，按真实 adapter 能力分区并补齐 Codex 环境变量凭据，不伪装 CC Switch proxy-only 配置。
- [x] `TEST-AGENT-126` Appearance 聚焦工作区回归：默认进入桌面皮肤；左侧图标导航按 Pets、skin 顺序显示独立数量；切换 Pets 后只展示 Pet 导入、卡片、无效计数与目录动作；切回皮肤不重复请求 overview，且只展示原生状态、皮肤动作和皮肤卡片。
- [x] `T-AGENT-163` 按 `FR-AGENT-091` / `DES-AGENT-106` 将 Appearance 改为左侧图标导航与右侧聚焦工作区，复用现有 overview、预览、导入、应用、恢复、导出、删除和目录操作，不新增 IPC 或持久化状态。
- [x] `TEST-AGENT-127` Pet 管理与官方目录回归：覆盖 v1/v2 展示、三列响应式 inventory、共享资产卡片尺寸、大预览主视觉、卡片正文隐藏路径/目录 ID、精确路径打开、元数据原子更新与未知字段保留、非法元数据零写入、官方 catalog 仅由按钮/回车提交搜索、输入零请求、搜索分页、发布预览优先与验证后 spritesheet fallback、stale 请求隔离、双前缀 allowlist/redirect/timeout/字节上限、安装 staging 清理和安装后 inventory 刷新。
- [x] `T-AGENT-164` 按 `FR-AGENT-092` / `DES-AGENT-107` 实现 filesystem Pet CRUD 与 `Awesome Codex Pet` 有界官方目录；Pet inventory/store 复用 Agent 资产卡片外壳和操作栏，以大尺寸预览作为主视觉并保留包内 spritesheet fallback；统一 7 locales 品牌、约束变长文案、增加 7 天/96 项/192 MiB 持久预览缓存和 renderer 请求去重，并运行 targeted tests、typecheck 与 affected lint，不执行 Playwright。
- [x] `TEST-AGENT-128` 菜单栏额度回归：覆盖六个 verified adapter 的稳定顺序、两路有界并发、force-refresh 透传、单 Provider 失败隔离、原始错误脱敏、最紧张额度摘要、全部指标/重置时间/plan/status 的七语言原生菜单投影、重复打开 single-flight、销毁后 late-result 隔离和共享 usage service 注入。
- [x] `T-AGENT-165` 按 `FR-AGENT-093` / `DES-AGENT-108` 实现共享 Agent usage service、主进程有界 tray projection、缓存优先的 controller refresh 与七语言 native menu；运行 focused tests、coverage、typecheck、affected lint、file-size、spec traceability 和 `git diff --check`。
- [x] `TEST-AGENT-129` 复现冷启动菜单只有匿名 loading 行的问题，覆盖六个具名 loading 行、逐项完成投影、稳定顺序、单项失败隔离和销毁后的 late-result 隔离。
- [x] `T-AGENT-166` 按 `FR-AGENT-093` / `DES-AGENT-109` 实现具名冷启动额度行和两路并发队列的逐项 tray 更新。
- [x] `TEST-AGENT-130` 复现 Kimi 短期 access token 过期后额度消失的问题，覆盖官方 refresh contract、锁后重读、原子持久化、同进程合并、401/网络/写入失败、锁超时和凭据不泄露。
- [x] `T-AGENT-167` 按 `FR-AGENT-027` / `DES-AGENT-109` 实现 Kimi Code current credential 的安全续期；legacy credential 保持只读。
- [x] `TEST-AGENT-131` 先复现原生菜单把 Agent 名称与百分比拼成一行的展示问题，再覆盖弹层定位/复用/失焦隐藏/销毁、缓存首屏、两路并发、逐项刷新、强制刷新校验、产品图标、tabular 数字、进度、展开指标和非零异常状态。
- [x] `T-AGENT-168` 按 `FR-AGENT-093` / `DES-AGENT-110` 将 Agent 额度改为状态栏锚定的渲染弹层；其余托盘命令保持原生，复用 process-wide usage service，不增加凭据或持久化所有权。
- [x] `TEST-AGENT-132` 先复现 macOS 额度仍需二次点击且弹层百分比视觉过重的问题，再覆盖 primary click 直达、secondary click 原生动作菜单、macOS 去重额度命令、macOS 原生 popover material 与透明渲染外壳、非 macOS 兼容行为、CodexBar 层级、plan 归一化和紧凑 inline remaining 展示。
- [x] `T-AGENT-169` 按 `FR-AGENT-093` / `DES-AGENT-110` 将 macOS tray primary click 直连渲染额度面板，以 Electron `vibrancy: "popover"` 和透明 renderer shell 接入系统材质，再用现有 React 组件复现 CodexBar 使用卡片的信息层级；secondary click 保留原生命令，Windows/Linux 保持既有菜单语义与不透明 fallback。

## Confirmed Unified Provider Design Follow-up

- [x] `TEST-AGENT-136` 先复现 Claude/Pi Provider & Model 使用不同 sidebar、
      toolbar、provider row 和 detail section，以及 Pi 缺少 PromptHub 导入入口；
      覆盖共享布局、兼容/不兼容来源、main-only credential、IPC/preload 合同、
      duplicate 零写入和双文件失败回滚。
- [x] `T-AGENT-182` 按 `FR-AGENT-095` / `DES-AGENT-113` 提取共享 Provider
      workbench 视觉 primitives，并实现 PromptHub Provider 到 Pi 原生
      `models.json` / `auth.json` 的有界、可回滚导入。
- [x] `TEST-AGENT-137` 复现 Pi 工具栏缺少当前配置导入入口；覆盖双按钮顺序、
      确认与取消、已是自定义/未配置时禁用、main-owned 当前供应商解析、同 ID
      override、内置模型与凭据保留、重复/畸形/并发失败零写入，以及 IPC/preload。
- [x] `T-AGENT-183` 按 `FR-AGENT-096` / `DES-AGENT-114` 为 Pi 接入当前配置
      导入按钮和 same-id `models.json` provider override，并让 catalog 正确投影
      override 的可编辑来源；不得复制或返回凭据。

- [ ] `T-AGENT-178` 将系统级模型服务配置确认为跨 Agent Provider Profile 层，补充 `agent_provider_bindings`、继承/独立副本、Agent target provider/model 映射和 projection digest 设计；禁止把同一 JSON 直接复制到不同 Agent。
- [ ] `TEST-AGENT-133` 统一 Provider 来源与权限矩阵：官方目录只读、内置模型只读、内置 override、系统级配置、自定义 provider/model、imported provider；覆盖 UI 禁止编辑错误字段和允许编辑鉴权字段。
- [ ] `T-AGENT-179` 实现系统级 Provider Profile 到 Agent 的 bind/clone/unbind/import 流程；bind 继承系统配置，clone 生成独立自定义配置，删除系统 Profile 前展示受影响 Agent。
- [ ] `TEST-AGENT-134` 统一 Provider 投影回归：Pi/OpenCode/Codex 等不同 provider/model id 映射、协议转换、部分能力 unsupported、共享 credential reference、无明文 secret 跨边界。
- [ ] `T-AGENT-180` 实现内置目录与用户配置的来源标识及 override 语义；内置模型写官方支持的 `modelOverrides`，自定义模型完整编辑/复制/删除，页面显示 `Built-in`、`Override`、`Custom`、`Imported`。
- [ ] `TEST-AGENT-135` 外部原生配置 drift/conflict 回归：baseline/current/desired digest、导入外部修改、重新投影、查看差异、取消零写入和失败回滚。
- [ ] `T-AGENT-181` 将官方供应商 preset 接入系统级 Provider Profile 创建和导入入口；preset 只提供非敏感官方元数据，不携带推广链接、明文 key 或赞助商配置。

## Conversation History Follow-up

- [x] `TEST-AGENT-175` 先复现会话操作栏卡片包裹、选中会话文字对比度不足，以及重复/空 cursor 导致翻页空白；覆盖 duplicate cursor skip、bounded cursor calls、page clamp 和轻量 toolbar class contract。
- [x] `T-AGENT-176` 按 `FR-AGENT-094` / `DES-AGENT-112` 移除会话操作栏的嵌套卡片表面，统一选中行前景 token，并实现有界 cursor 追进、去重和安全页码钳制；不改变 transcript 存储、IPC 或原生 Agent 所有权。

## Unified Quota Presentation Follow-up

- [x] `TEST-AGENT-138` 先复现现有额度 UI 的方向和组合缺陷：月度额度的百分比/金额语义不一致、provider chart kind 泄漏到 renderer、超过五项仍无界渲染、冷启动伪造 5h/7d 值，以及 Overview/菜单栏格式化分叉；再覆盖 scope/period/value V2 contract、六个 adapter、unlimited/unknown/empty/stale 状态、0/1/2-4/5-8/9-64 组合、周期窗口圆环与总量进度条的语义选择、七语言、键盘/焦点、明暗主题、窄宽度和 64 项有界性能。
- [x] `T-AGENT-184` 按 `FR-AGENT-097` / `DES-AGENT-115` 实现测试红态后，将 provider 数据迁移到版本化的 scope/period/value 额度契约，提取共享 presentation model 与 meter，由 renderer 统一将有限 5h/日/周窗口映射为紧凑圆环、将月度/账期/总量映射为水平剩余额度条，令 Overview 和菜单栏只保留密度/展开差异；移除 Agent-id 展示分支、成功态来源赘述和伪造占位值，不新增 endpoint、凭据来源、持久化或后台请求，并完成 targeted coverage、typecheck、affected lint、build、Playwright 视觉验证和文档收敛。
- [x] `T-AGENT-184A` 修复 Kimi 当前 usages 响应兼容：以 `remaining`/`limit` 映射周额度和滚动额度，识别 `TIME_UNIT_MINUTE` 等 proto 时间单位，保留旧 `used`/`limit` 兼容，并明确拒绝把不可信 `totalQuota` 伪装成共享月度总额度。
- [x] `T-AGENT-184B` 恢复统一周期展示规则：Kimi 等 provider 即使同时上报绝对请求数，5h/日/周有限窗口仍使用紧凑圆环；月度、账期和总量继续使用水平条。Agent Overview 的路径详情默认展开。
  - [x] 视觉回归修正：缓存刷新仅由刷新按钮表达忙碌状态，不显示内部缓存文案；同一 scope 的周期圆环使用有界宽度紧凑横排，不再被等分网格拉散。
- [x] `T-AGENT-184C` 将 Kimi `LEVEL_*` 会员枚举映射为公开 tempo 套餐名；过滤无 `lastPrompt` 的默认空会话，并令历史行使用精确 `wire.jsonl` 来源路径与文件大小。
  - [x] Antigravity 来源语义修正：用红测锁定 `GetUserStatus` 旧 prompt-credit 字段不得成为总额度；仅将 `RetrieveUserQuotaSummary` 的 5h/weekly 分组作为 baseline quota，套餐名继续来自 status，AI credits 等待独立且已验证的 overage balance 契约。

## Expanded Native Model Configuration Follow-up

- [x] `TEST-AGENT-176` 先复现 Antigravity、Qoder、CoPaw、AutoClaw、QClaw、Hermes 在 Provider & Model 中仍为 planned/unsupported；覆盖 canonical path、缺失文件、模型读取和更新、注释/未知字段/凭据保留、endpoint 脱敏、active workspace containment、symlink、畸形输入、并发修改、验证失败回滚，以及 NanoClaw 继续拒绝无目标的全局写入。
- [x] `T-AGENT-185` 按 `FR-AGENT-098` / `DES-AGENT-116` 扩展统一 main-only model adapter registry、Provider runtime 和 capability inventory；复用共享 Provider workbench，不增加 Agent-specific renderer 布局分支，并同步 stable desktop behavior 与 implementation 记录。

## Provider Toolbar And Overflow Follow-up

- [x] `TEST-AGENT-177` 先复现 generic/Pi toolbar 只有图标、native row 的 `w-full + margin` 造成横向溢出；覆盖双命令可见文本、accessible name、固定侧栏 containment、只允许纵向滚动，以及真实 Electron sidebar `scrollWidth <= clientWidth`。
- [x] `T-AGENT-186` 按 `FR-AGENT-099` / `DES-AGENT-117` 修复共享 toolbar 和 native row spacing，不改变 import、Provider Profile、凭据或 IPC 语义，并完成 component、Playwright、typecheck、lint、build 与文档收敛。

## Conversation Storage And Project Filter Follow-up

- [x] `TEST-AGENT-178` 先复现 Codex 会话行缺少文件大小、项目下拉只读取已登记 Skill 项目、删除错误写软删除状态且无确认的问题；覆盖精确字节格式化、同名不同路径、确认/取消、成功后本地移除与 metadata 硬删除、Codex contained-file 删除、原生失败时 metadata 不变、cleanup 失败和不支持适配器零写入。
- [x] `T-AGENT-187` 按 `FR-AGENT-100` / `DES-AGENT-118` 增加会话级大小与原生删除能力投影，以真实会话路径组成项目筛选，并把 Codex 删除收敛到主进程适配器；禁止 renderer 路径删除和共享数据库文件删除。

## Submitted Conversation Search Follow-up

- [x] `TEST-AGENT-179` 先复现输入即请求、正文命中和清空后无法显式恢复完整列表的问题；覆盖输入零请求、Enter 单次提交、IME composition、标题/项目 label/path、正文/备注/标签/模型/preview 排除、load-more 复用已提交值，以及隔离 HOME/CODEX_HOME 的真实 Electron 流程。
- [x] `T-AGENT-188` 按 `FR-AGENT-101` / `DES-AGENT-119` 分离搜索草稿与已提交查询，统一 renderer/live/index 的标题与项目搜索范围，更新七语言占位文案并完成 component、DB、service、typecheck、lint、build、Electron Playwright 与文档收敛。

## Conversation Ordering And Native Title Follow-up

- [x] `TEST-AGENT-180` 先复现状态筛选占用排序入口、已归档会话不可见、大小未知值顺序不稳定、当前软删除错误显示“恢复”，以及 Codex 忽略 `session_index.jsonl` 原生改名的问题；覆盖四种排序、未知值置后、分页追加重排、PromptHub 标题优先级、硬删除 metadata、无软删除/恢复合同、Codex latest-valid thread name、畸形/危险记录和 fallback。
- [x] `T-AGENT-189` 按 `FR-AGENT-102` / `DES-AGENT-120` 将第二个会话选择器替换为已加载清单排序，以紧凑状态图标保留归档语义，移除会话软删除/恢复状态与 IPC，并把 Codex 原生 thread name 接入只读标题投影；完成七语言、component/adapter/helper 回归、typecheck、lint、build 与文档收敛。

## Latest Transcript And Row Context Actions Follow-up

- [x] `TEST-AGENT-181` 先复现历史只能从早期页面逐页前进、会话行无右键操作以及仍暴露通用“编辑信息”的问题；覆盖有界跨 cursor 最新跳转、duplicate cursor 去重、右键选择、当前 Agent 续接、JSON 导出、永久删除取消/确认及编辑入口缺失。
- [x] `T-AGENT-190` 按 `FR-AGENT-103` / `DES-AGENT-121` 增加最新消息图标按钮和 viewport-contained 会话右键菜单，复用既有续接、跨 Agent、导出和确认删除流程，移除 metadata 编辑弹窗与七语言废弃文案，并完成 component、locale、typecheck、lint、build 与文档收敛。

## Transcript Table And Tool Message Follow-up

- [x] `TEST-AGENT-182` 先复现宽 GFM 表格撑破消息气泡、Tool 记录被错误绘制为居中通知的问题；覆盖 Markdown 根容器/表格滚动 containment，以及 Tool 的 Agent 头像、左对齐气泡、角色标签和非通知布局。
- [x] `T-AGENT-191` 按 `FR-AGENT-104` / `DES-AGENT-122` 为 Markdown 表格增加气泡内横向滚动并令所有聊天气泡可收缩，将 Tool 记录改为 Agent 消息结构，同时保留 system/unknown 通知语义和原始 transcript/export 内容。

## Conversation Native Location Follow-up

- [x] `TEST-AGENT-183` 先复现顶部更多菜单只有永久删除、无法定位原生会话文件或打开项目目录的问题；覆盖 source/project 两条精确路径、顶部与右键菜单复用、缺失路径禁用、无删除能力仍保留更多入口，以及 shell 打开失败的零数据变更错误状态。
- [x] `T-AGENT-192` 按 `FR-AGENT-105` / `DES-AGENT-123` 将“在文件夹中显示”和“打开项目目录”接入顶部更多与会话右键菜单，复用既有安全 `shell:openPath` 文件/目录分流，不新增 IPC、路径猜测、文件编辑或持久化。
- [x] `TEST-AGENT-184` 先复现 Claude 内部 meta/system/command wrapper 被显示为“事件”、生成文本抢占标题、tool result 被当作用户消息，以及 encoded project key 被显示为项目的问题；覆盖 live/index 一致的 cwd label、resume cwd、合法忽略记录与真实 parse error 边界，并以隔离 HOME 的 Electron E2E 验证项目菜单和可见 transcript。
- [x] `T-AGENT-193` 按 `FR-AGENT-106` / `DES-AGENT-124` 修正 Claude 只读 JSONL 投影：分类 visible/ignored/malformed 原生记录，以安全 cwd 作为项目身份，统一 live/index label 和 resume cwd，并通过 adapter version 2 重建旧的可再生索引投影；不改 schema、IPC 或 Claude 原生文件。
- [x] `TEST-AGENT-185` 先复现 Gemini `.project_root` 未用于 live/index/resume、`info` 被显示为 Event、function response 被当作用户或 parse error，以及 Cursor encoded key 泄漏的问题；覆盖安全/缺失/软链接/超限 marker、Cursor 唯一/歧义/软链接/有界解析和真实项目菜单 E2E。
- [x] `T-AGENT-194` 按 `FR-AGENT-107` / `DES-AGENT-125` 实现 Gemini marker、native summary 与消息角色投影、index version 2，以及 Cursor under-home 唯一路径/紧凑 fallback label 解析；不读取 Cursor 私有数据库、不猜测外部路径、不新增 schema/IPC/写操作。
- [x] `TEST-AGENT-186` 先复现 Grok Build Usage 仍为 planned、会员与周额度不可见以及历史行大小未知的问题；覆盖官方 auth host、畸形/超限/过期 credential、user/billing 成功与部分失败、周额度映射、plan 可读化、token 隔离和精确 `chat_history.jsonl` 字节数。
- [x] `T-AGENT-195` 按 `FR-AGENT-108` / `DES-AGENT-126` 接入 Grok Build 官方 user/billing Usage adapter，并为 Grok history 投影精确 transcript 路径与大小；复用共享 quota UI、缓存、超时与 contained-file 边界，不新增 renderer 专用实现、schema、IPC 或原生写操作。
- [x] `TEST-AGENT-187` 先复现 Claude/Gemini 等文件会话大小未知、索引投影丢失删除能力、非 Codex 删除全部返回 unsupported，以及共享数据库会话误用整库大小的风险；覆盖单文件、多文件、目录、原生 CLI、SQLite 行级删除、二次确认、路径逃逸/软链接/目标变化、部分失败与其他会话保持完整。
- [x] `T-AGENT-196` 按 `FR-AGENT-110` / `DES-AGENT-127` 为所有已返回历史记录的 adapter 注册真实 footprint 与永久删除策略，统一 live/index capability，确保 main 重新解析、原生内容先删除、PromptHub metadata 后清理，并补齐受影响文档、单元、Electron E2E、类型、lint、构建与资源回收门禁。

## Missing Agent Rule Creation Follow-up

- [x] `TEST-AGENT-188` 先复现缺失规则被误当作空文件直接打开的问题；覆盖完整 descriptor inventory、缺失文件零预写入、显式创建成功/失败、已存在空文件直接编辑、不同 Agent canonical 文件名和无 descriptor 的有界重试。
- [x] `T-AGENT-197` 按 `FR-AGENT-109` / `DES-AGENT-128` 保留完整规则描述符清单，为 Agent Rules 增加居中创建确认并复用现有 save IPC；不得硬编码 `AGENTS.md`、新增 renderer 写路径或改变 standalone Rules 对缺失全局文件的隐藏语义。

## Pi MCP Capability Follow-up

- [x] `TEST-AGENT-189` 先复现 Pi 的 MCP 目标预设已经存在，但平台注册表缺少 MCP 路径、导致 Agent MCP 标签被误禁用的问题；覆盖平台注册表、Managed Agent 路径、partial capability、Pi/Oh My Pi 身份隔离和现有目标预设。
- [x] `T-AGENT-198` 按 `FR-AGENT-111` / `DES-AGENT-129` 将 Pi 的兼容 MCP 主入口接回共享平台注册表，复用 owning MCP 工作区和现有 Pi 目标预设；不得伪装为 Pi 原生 MCP runtime、复制 preset 或新增 renderer 分支。

## System History Acceleration And First-Page Follow-up

- [x] `TEST-AGENT-190` 先复现本地索引开关错误占用单个 Agent History、默认关闭，以及深页缺少返回第一页按钮的问题；覆盖系统设置默认值与持久化、支持/不支持 adapter、自动启用刷新、关闭时 live fallback、History 无索引控件、首屏禁用和深页零 I/O 返回。
- [x] `T-AGENT-199` 按 `FR-AGENT-112` / `DES-AGENT-130` 将历史加速迁移到 App Settings 并默认开启，由现有 hook 自动协调支持来源；同时补齐分页最左侧第一页按钮，不新增 schema、IPC、后台常驻任务或 transcript 读取。

## Cursor Rules And Expanded MCP Targets Follow-up

- [x] `TEST-AGENT-191` 先复现 Cursor Rules 因缺少用户全局文件而被禁用、Qoder 无法复用项目 `AGENTS.md`、同一项目无法并存 `AGENTS.md` 与 MDC 规则，以及 OpenClaw/Qoder/Grok/Antigravity 缺少可写 MCP 目标的问题；覆盖显式创建、空文件、重复 target、未知字段保留、OpenClaw transport、Qoder 双项目 scope、Grok headers、Antigravity `serverUrl` 和 Reasonix 项目 `.mcp.json`。
- [x] `T-AGENT-200` 按 `FR-AGENT-113` / `DES-AGENT-131` 增加项目规则 kind 与共享项目选择流程，并将 OpenClaw/Qoder/Grok/Antigravity 及 Reasonix 项目目标接入共享 MCP target/preset；不伪造 Cursor 全局规则、不覆盖 Reasonix 现代全局 TOML、不接管原生 OAuth/未知字段、不新增 IPC/schema/background process。

## Session Index Cache Reuse Follow-up

- [x] `TEST-AGENT-192` 先复现 fresh index 每次 mount 仍刷新、初始 live list 与 full scan 竞争、离开 History 取消 warmup、同 Agent 重入重复扫描，以及 refresh revision 重新遮住已有列表的问题；覆盖五分钟 freshness、stale/missing 后台刷新、per-Agent in-flight dedupe、window-owned lifecycle 和非阻塞列表替换。
- [x] `T-AGENT-201` 按 `FR-AGENT-114` / `DES-AGENT-132` 实现 stale-while-revalidate 会话元数据缓存：初始列表完成后才启动有界 warmup，fresh cache 直接复用，后台请求跨 History mount 复用且完成时不回到 blocking loader；不新增 schema、IPC、watcher、timer 或 transcript 正文缓存。

## Agent-Scoped Add Dialog Follow-up

- [x] `TEST-AGENT-193` 先复现 Agent 工作台的添加 MCP/Plugin 操作跳转到专项管理页的问题；覆盖弹窗打开、My MCP/My Plugins 多选、已安装项禁用、复制/软链接、确认后原地刷新，以及 App module/Agent tab 不变。
- [x] `T-AGENT-202` 按 `FR-AGENT-115` / `DES-AGENT-133` 复用 MCP 库部署弹窗并新增 Agent Plugin 库选择弹窗，将写入限定到当前 Agent 的已验证 target；不得新增 IPC/schema、跳转专项页或复制安装业务逻辑到持久层之外。

## Provider Terminology And Native Ownership Follow-up

- [x] `TEST-AGENT-194` 先复现共享 Provider 工作台和 Pi 目录仍暴露“导入当前配置/转为可编辑配置”，以及列表、表单、激活和删除界面泄漏 Profile/配置档案术语；覆盖原生配置只读、PromptHub 导入保留和七语言供应商文案。
- [x] `T-AGENT-203` 按 `FR-AGENT-116` / `DES-AGENT-134` 移除 renderer 原生配置导入入口与弹窗，统一用户侧供应商术语；保留内部 Provider Profile 类型、存储、IPC 兼容名和官方还原流程，不新增迁移或持久化状态。

## Plugin Empty State And Download Proxy Authority Follow-up

- [x] `TEST-AGENT-195` 先复现空 Agent Plugin 页点击添加连续提示“暂无目标”、直连模式仍继承启动代理、Plugin Git 下载绕过用户代理模式及安装/导入失败展示原始 IPC/Git 错误的问题；覆盖纯空态、无 target 但有库、system/direct/manual 环境语义、Git 单次继承、七语言错误分类、未知原因脱敏、批量首个失败和安装后刷新失败。
- [x] `T-AGENT-204` 按 `FR-AGENT-117` / `DES-AGENT-135` 简化 Agent Plugin 空态、让 Add 始终进入当前页弹窗，让官方商店 Git 下载严格服从网络设置的 system/direct/manual 模式，并统一市场、本地/来源导入、Agent 安装与批量安装的可操作错误说明；不得猜测 target、安装器私自切换代理、无限重试、新增 IPC/schema 或泄露命令/临时路径。

## Rich Provider Import Follow-up

- [x] `TEST-AGENT-196` 先复现 PromptHub 供应商导入缺少供应商/模型图标、模型使用原生文字下拉、协议不可选择以及 main 静默固定协议的问题；覆盖 Codex/OpenCode/Pi 的双协议选择、Claude/Gemini/Qwen 的单协议约束、默认直连映射、篡改协议拒绝和暗色图标复用。
- [x] `T-AGENT-205` 按 `FR-AGENT-118` / `DES-AGENT-136` 复用 Model Services 图标与共享 Select，扩展 source candidate/request 合同并由 main 按 source × Agent 交集验证所选协议；不得新增图标注册表、格式转换代理、无证据协议或存储迁移。

## Provider Sidebar Entry Follow-up

- [x] `TEST-AGENT-197` 先复现新增供应商仍固定在侧栏底部、PromptHub 导入仍用数据库图标且供应商列表右键没有创建/导入入口的问题；覆盖共享 Profile 工作台、Pi 原生目录、顶部双加号、右键复用和 Web 不暴露本地导入。
- [x] `T-AGENT-206` 按 `FR-AGENT-119` / `DES-AGENT-137` 提取共享供应商操作展示，将新增自定义供应商移到顶部并为列表增加同流程右键入口；不得复制创建/导入业务逻辑、新增 IPC、持久化状态或后台任务。

## Internal CLI Maintenance Boundary Follow-up

- [x] `TEST-AGENT-198` 先复现 Agent 更多菜单仍显示 CLI 诊断、preload 仍公开诊断与更新方法的问题；覆盖菜单无诊断入口、刷新/编辑保留、renderer API 无诊断/update plan/apply 方法，以及内部诊断和生命周期服务回归。
- [x] `T-AGENT-207` 按 `FR-AGENT-120` / `DES-AGENT-138` 移除 CLI 诊断菜单、弹窗、更新 review、renderer 状态、preload 方法、共享 IPC channel 和 main handler；保留有界 main-process 诊断与生命周期服务，不新增替代入口、持久化或后台任务。

## Inline Provider Form Hierarchy Follow-up

- [x] `TEST-AGENT-199` 先复现新增供应商右侧编辑器仍为整片灰底、表单无独立白色表面、输入框与背景缺少边界、半宽控件留下空白以及下拉仍调用系统原生/过重菜单的问题；覆盖单一表单表面、四个全宽单列分区、描边输入框、轻量等宽下拉、Agent 专属端点/模型示例和 API Key 提示。
- [x] `T-AGENT-208` 按 `FR-AGENT-121` / `DES-AGENT-139` 为右侧新增/编辑供应商界面增加白色表单表面、分区层次、全宽单列字段和统一描边控件；全部选择项复用 portal-backed Select 的轻量表单样式，字段内容按已有 adapter 对齐 CC Switch 概念但不新增持久化字段、嵌套卡片、IPC 或后台任务。

## Oh My Pi Official Plugin Inventory Follow-up

- [x] `TEST-AGENT-202` 先复现 Oh My Pi 已安装插件清单存在于官方 `installed_plugins.json`，但 Agent Plugin 资产页因只扫描通用目录而为空的问题；覆盖合法用户/项目清单、重复项、缺失包、路径逃逸、软链接、畸形/超限 JSON 和零凭据读取。
- [x] `T-AGENT-211` 按官方 marketplace 清单契约把 Oh My Pi 插件 inventory 接入共享 target matrix；仅做有界只读资产投影，不直接写 `agent.db`、不接管 auth broker、不新增 renderer 专用分支或隐式安装。

## Claude Native Model Routes Follow-up

- [x] `TEST-AGENT-200` 先复现 Claude 自定义供应商只能保存主模型、无法导入或激活 Sonnet/Opus/Haiku/Subagent 路由以及旧路由会残留的问题；覆盖可选字段省略、完整映射、未知/重复/参数化路由拒绝、原生导入、无关 JSON 保留、原子写入验证与回滚。
- [x] `T-AGENT-209` 按 `FR-AGENT-122` / `DES-AGENT-140` 复用现有 model mapping 持久化边界补齐 Claude 五类原生模型路由；不得新增 schema、renderer 网络发现、代理转换、Fable 或供应商宣传元数据。
- [x] `TEST-AGENT-203` 先复现 Codex 自定义供应商无法保存、导入、激活或清理推理强度与上下文窗口的问题；覆盖官方枚举、正整数边界、Responses 限制、原生导入、注释和无关 TOML 保留、旧值清理、验证与回滚。
- [x] `T-AGENT-212` 按 `FR-AGENT-124` / `DES-AGENT-142` 将 Codex 推理强度和上下文窗口建模为主模型参数并补齐表单、adapter、原生配置和七语言文案；不得复制已不在官方参考中的字段或改变凭据所有权。

## Provider Activation Switch And Native Test Follow-up

- [x] `TEST-AGENT-201` 先复现激活命令只存在于详情页、左侧供应商列表没有当前/可激活开关，以及官方原生供应商没有连接与模型测试入口的问题；覆盖当前开关不可关闭、非当前开关进入既有 review、当前原生连接/模型测试、取消隔离、结果身份校验和零 Profile/Agent 写入。
- [x] `T-AGENT-210` 按 `FR-AGENT-123` / `DES-AGENT-141` 将激活入口移到每个供应商列表行，并以经过校验的临时 native target 复用现有 adapter 测试能力；不得新增激活布尔状态、创建 Provider Profile、复制凭据、绕过 review/rollback 或伪造 platform-native 测试成功。

## Codex Official Account Switching Follow-up

- [x] `TEST-AGENT-204` 先复现 Codex 官方账号只能覆盖登录、无法保存当前账号和安全切回的问题；覆盖当前账号保存、write-only JSON 导入、密文落盘、脱敏列表、未保存当前账号自动保留、0600 原子替换、重读验证、失败回滚、并发串行、活动账号拒删、畸形/超限/缺 token 输入和零 `config.toml` 写入。
- [x] `T-AGENT-213` 按 `FR-AGENT-125` / `DES-AGENT-143` 在 Codex 官方供应商详情增加账号快照管理，通过 main-only 加密 vault 替换单一 `auth.json`；不得发明多账号 JSON、返回 token、修改供应商/模型/MCP/会话、隐式网络验证或新增后台进程。

## Codex Official Native Probe Follow-up

- [x] `TEST-AGENT-205` 先复现官方 Codex 供应商被错误隐藏检测入口并返回 unsupported；覆盖 `codex login status` 零模型请求、隔离 `codex exec` 参数、选中模型、临时文件清理、取消、超时、缺少 CLI、未登录、认证/网络/额度/模型错误分类、结果脱敏和零 `config.toml`/Profile 写入。
- [x] `T-AGENT-214` 按 `FR-AGENT-123` / `DES-AGENT-141` 为官方 Codex 恢复连接和模型检测，通过共享无 shell native runner 执行有界官方 CLI 探针；不得读取或返回 token、伪造成功、持久化会话、绕过模型测试确认或改变其他 platform-native 供应商语义。

## DeepSeek Harness Profile Plugin Follow-up

- [x] `TEST-AGENT-206` 先复现 DeepSeek Harness 不在 Agent 清单、复用通用 DeepSeek Provider 图标、通用 Skills/MCP/Rules/Plugin 路径模型无法表达 Profile bundle、且没有安装/更新/卸载/详情入口的问题；覆盖正式标题、明暗主题官方图标、`DSH_HOME`、仅 CLI 检测、Profile/manifest 上限、软链接逃逸、畸形/超限 JSON、bundle 与 direct dependency 区分、脚本正文隔离、命令参数、风险确认、超时/输出限制/失败脱敏、per-profile 串行和专属两栏 UI。
- [x] `T-AGENT-215` 按 `FR-AGENT-126` / `DES-AGENT-144` 注册 DeepSeek Harness 的 plugin-harness 平台模型，增加 main-only Profile/Plugin adapter、类型化 IPC/preload 和专属 Plugins 工作区；安装、更新、移除只调用官方 `dsh plugin`，不得伪造独立 Skill/MCP/Rules 能力、执行 shell、静默接受安装脚本、引入 marketplace、schema、sync 或后台 watcher。

## Registry-Aware Agent Order Upgrade Follow-up

- [x] `TEST-AGENT-207` 先复现旧版已保存完整 Agent 顺序时，新注册的 DeepSeek Harness 被排到清单末尾、首屏看起来像未接入的问题；覆盖纯顺序合并、Agent 管理行位置以及共享官方标题/图标投影。
- [x] `T-AGENT-216` 按 `FR-AGENT-127` / `DES-AGENT-145` 让 Skill 与 Agent 管理共用当前注册表感知的偏好顺序合并；保留用户已有相对顺序，不重置设置、不新增持久化字段、不复制 DeepSeek 身份或图标映射。

## File-Authoritative Agent Skill Inventory Follow-up

- [x] `TEST-AGENT-208` 先复现直接打开 Agent Skills 时不触发扫描、持久化空结果在重启后继续伪装为真实空目录的问题；覆盖首次 loading、单次文件扫描、发现结果和旧缓存丢弃。
- [x] `T-AGENT-217` 按 `FR-AGENT-128` / `DES-AGENT-146` 将 Agent Skill scan 收敛为 session-scoped derived cache；直接 Skills 页负责冷启动扫描，失败与成功空目录分离，不新增 DB、watcher、轮询或网络请求。

## Truthful Cross-Domain Asset Summary Follow-up

- [x] `TEST-AGENT-209` 先复现 Overview 冷缓存永远未知、Skills 未加载却显示 `0 managed · 0 external`、MCP/Plugin 首次失败同时显示成功空态、缺失 Rules 文件被计数的问题；覆盖四域摘要成功/空/首次失败/重试/缓存后刷新失败、摘要 I/O 白名单和最多两域并发。
- [x] `T-AGENT-218` 按 `FR-AGENT-129` / `DES-AGENT-147` 为 Skills/MCP/Rules/Plugins 增加 owner-scoped 轻量摘要加载和统一生命周期；Overview 不得触发市场、健康检查、规则正文、全量库、跨域校验、网络、watcher、轮询、schema 或 IPC 变更。

## Native Tray Quota Follow-up

- [x] `TEST-AGENT-210` 先复现 macOS 主点击打开自绘额度 BrowserWindow、原生动作菜单缺少额度子菜单及 Grok verified adapter 被旧六项硬编码遗漏的问题；覆盖能力注册表派生的具名 loading 行、原生套餐/指标/重置文本、七语言状态、两路并发、single-flight、单 Provider 失败隔离、缓存失败保留、动态文案清理、强制刷新和销毁后迟到结果隔离。
- [x] `T-AGENT-219` 按修订后的 `FR-AGENT-093` / `DES-AGENT-148` 删除额度 popover renderer、window/controller、专属 CSS/i18n/tests，并将所有平台接回 Electron 原生 tray menu；保留共享 usage service，不新增凭据、IPC、持久化、watcher、timer、端口或进程。

## Native Config Editor Surface Hierarchy Follow-up

- [x] `TEST-AGENT-211` 先锁定 Agent 配置页标题栏、共享文件编辑器右侧主画布和 CodeMirror host 使用 `card` 语义面；同时保留文件树的次级灰面，并禁止用 raw white 规避深色主题。
- [x] `T-AGENT-220` 按 `FR-AGENT-130` / `DES-AGENT-149` 在共享文件编辑器边界恢复主次表面对比；不得新增 Codex 专属皮肤、嵌套卡片、状态、IPC、文件 I/O、网络请求或后台生命周期。

## Doubao Work Skill Target

- [x] `TEST-AGENT-218` 先锁定 Doubao Work 的 macOS workspace、`.user_skills` 写入目标、`.skills` 排除、保守 capability、应用启动白名单、内置 registry 唯一性与现有豆包图标复用。
- [x] `T-AGENT-227` 按 `FR-AGENT-137` / `DES-AGENT-156` 复用现有 registry、检测和完整 Skill 包分发链路接入 Doubao Work；不得写内置 `.skills`、借用 Codex/Agents 共享目录、复制未授权品牌资源或宣称未验证的深度 adapter。

## Agent Current Contract Convergence

需求：`FR-AGENT-138`；设计：`DES-AGENT-157` /
[current-contract-design.md](current-contract-design.md)。旧勾选项不代表下列新要求已完成。

- [x] `T-AGENT-228` 审查配置、持久化、路径、安装/状态/卸载、原生产品与测试边界，形成有代码依据的收敛方案；仅设计交付。
- [ ] `TEST-AGENT-219` 建立真实旧 profile → 当前配置 → 正常安装/读取/卸载/重开的功能基线，再覆盖配置冲突、断链、明确模式失败、中断恢复与原生产品错配；按 test-plan 的 Current Contract Convergence 执行故障变异，不能用 mock 成功或静态检查替代。
- [ ] `T-AGENT-229` 第一批：先评审并确定 Antigravity 桌面/CLI 身份、安装归属表提议及旧版本 authority 清单；将 Agent 配置迁入唯一 SQLite 读写路径，同批删除旧字段 fallback/双写以及设备 JSON 的业务覆盖。覆盖启动、恢复、导入，不扩建迁移平台。
- [ ] `T-AGENT-230` 第二批（依赖 229）：统一 core 路径解析并迁移所有当前调用方；移除旧根候选和读时迁移；证明工作台、Skill、MCP、Rules、Plugin 与 CLI 路径一致。
- [ ] `T-AGENT-231` 第三批（依赖 229、230）：统一 Skill 实际状态、明确模式执行与撤回所有权；迁移旧名称、复制安装及 activation 归属，同批移除旧名候选与自动 copy；同步 shared types、IPC、renderer 和相关旧测试预期。
- [ ] `T-AGENT-232` 第四批（依赖 229 的身份清单及 230）：按已冻结产品边界修正 Antigravity 供应商、会话、额度和 capability 声明；保留未知归属数据，不借用 Gemini/CLI 结果补成功。Skill 原生验收依赖 231。
- [ ] `T-AGENT-233` 第五批（依赖 230、231）：依据当前官方合同与原生样本，收敛 Kimi 历史根、Cherry 多 schema 等 adapter；保留第三方数据，逐个平台记录当前支持范围，不能只搜索并删除 legacy 关键字。
- [ ] `T-AGENT-234` 第六批（依赖 229–233）：运行所涉 Desktop/core/CLI 检查、旧 profile/恢复/重启与故障变异；有授权时完成原生 UI/Agent 消费验收。逐批提交并保留恢复说明，所有未验证平台与全量门禁失败单列，发布后再关闭相关 issue。

2026-09-28 部分交付：T-AGENT-229 的 Desktop/CLI 配置读写已收口 SQLite，旧字段/
设备文件仅在升级及恢复边界转换；正常 hydration、保存和分发读取已移除对应旧键
回退与双写。配置生命周期、真实 CLI 启动、恢复和迁移故障变异已有通过证据，见
current-contract-design.md 的第一批实施记录。统一 checksum 升级清单、Web 合同、
完整旧版本 authority 清单及 Antigravity 身份冻结尚未完成，因此 T-AGENT-229 和
TEST-AGENT-219 保持未勾选，后续批次不得据此宣称已完成。
