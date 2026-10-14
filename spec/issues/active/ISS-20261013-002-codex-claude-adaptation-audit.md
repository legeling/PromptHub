# Codex / Claude Code 适配核查

- 日期：2026-10-13
- 状态：local_done；以下八项缺陷已修复并完成相关回归及隔离原生 CLI 验证，尚未发布。
- 后续 Claude 目录与账号四项遗漏：local_done；本地回归及实际生成脚本验证完成，
  不包含真实账号、模型请求或 GUI 验收。
- 范围：Skills、Plugin、MCP、Rules、配置、CLI、会话、用量；当前工作区代码。
- 路径决定：保留 Codex `~/.codex/skills`，不自动迁移；权威约定见
  [Agent Platform Assets](../../knowledge/reference/agent-platforms.md)。

## 修复前证据与修改范围

下表记录修复前的实际复现和原生合同差异。当前实现与验证结果见下一节。

| 优先级 | 能力 | 当前证据 | 必要修改 | 所有者 / 关联 |
| --- | --- | --- | --- | --- |
| P1 | Codex MCP 导入 | 真实 `importFromFile` 将 `enabled=false` 导入成 `true`；多行 `args`、嵌套 `env`、认证环境变量及工具选择丢失，重新读取后仍丢失 | 复用现有 TOML 解析器；在原生适配边界保留状态、参数、环境变量、认证引用及工具选择，再正确投影 | `packages/core/src/mcp-import.ts`；shared MCP 类型与投影；#202 已关闭不代表此缺陷已修复 |
| P1 | Claude MCP 认证 | 真实配置导入后投影仅剩 `type` / `url`，`headersHelper` 丢失 | 将原生动态认证字段纳入单一 MCP 契约，导入、保存、重开、投影均保留；导入时不执行认证脚本 | shared MCP 类型 / 规范化 / 投影；core MCP Library |
| P1 | 原生单 Skill Plugin | `.codex-plugin` / `.claude-plugin` 包只有一个 Skill 时，PromptHub 返回 `UNSUPPORTED_PLUGIN_SEMANTIC`；本机 Claude 原生校验通过 | 对合法原生 Plugin 按原生包合同校验，移除“至少多个子能力”的人为条件；保留包边界和路径校验 | core Plugin package validation；#190 |
| P1 | Codex portable Plugin | 根 `plugin.json` 的官方 portable schema 被识别为 Antigravity / Copilot，Codex 缺失；显示元数据和根 `mcp.json` 清单丢失；旧 Codex overlay 覆盖 portable 根身份 | 依据 schema 和原生 manifest 识别格式；保留根身份、MCP 清单及 `com.openai` 元数据，按官方整块覆盖优先级读取 overlay | core Plugin shared / normalization / validation，desktop inventory；#190 |
| P1 | Plugin 原生加载 | 隔离分发只复制目录并记录 distributed target，未完成 marketplace / native registration / enable 流程 | 明确“已复制”和“原生已安装启用”的结果；通过各 Agent 当前官方入口完成安装加载并验证，不再由文件存在推断可用 | core Plugin distribution，desktop target paths；#190 |
| P1 | Codex Provider 协议 | `wire_api` 缺省时真实 inspect 返回 `chat`；源码允许 Chat profile 并存在写出 `wire_api=chat` 的路径；当前官方合同默认且仅支持 `responses` | 修正缺省协议和直接配置能力声明；只按当前原生合同写入。上游 Chat-only 转换属于既有独立 bridge 主题，不在此新增代理或 fallback | desktop Codex Provider adapter，shared Provider 合同 |
| P2 | 自定义 Agent 配置根 | 合成环境下平台根和 MCP preset 忽略 `CODEX_HOME` / `CLAUDE_CONFIG_DIR`；Claude 会话模块却单独处理配置根变量 | 在既有平台注册表及路径解析所有者统一处理官方根变量，让资产、配置、会话指向同一根；保留用户显式覆盖优先级 | shared platforms，core presets / inventory，desktop installer paths |
| P2 | Claude Scoped Rules | 真实 rules workspace bootstrap / scan 未列出 `rules/typescript.md`（含 `paths` frontmatter） | 在 Rules 所有者加入目录及作用域语义，避免丢失 frontmatter；不以全局 `CLAUDE.md` 替代目录规则 | core Rules workspace；#196 / #197；#212 产品范围独立 |

上表每项修复应落在既有能力所有者，并进入其正常测试入口。无需增加新的业务门禁、
限流、超时链或兼容模式。目录包库存与配置文件解析为线性扫描；复用现有解析器即可，
没有需要引入队列、并发池或大型依赖的容量证据。

## 当前实现

| 能力 | 修复结果 | 验证边界 |
| --- | --- | --- |
| Codex MCP | 使用已有 TOML 解析器；保留禁用状态、多行参数、嵌套环境变量、认证引用、工具选择及原生可选字段；投影使用同一规范对象 | 导入、持久化重开、投影及原生 `codex mcp get --json` |
| Claude MCP | 保留 `headersHelper`，不在导入时执行脚本 | 导入、重开、投影；未连接真实 MCP 服务 |
| 单 Skill Plugin | 合法 Codex / Claude 原生 manifest 定义包身份，不再因只有一个 Skill 拒绝 | 本地包、marketplace 预览和原生 CLI 安装 |
| Codex portable Plugin | portable 根身份优先，inline `com.openai` 整块覆盖旧 overlay；保留显示元数据和根 MCP 清单 | 本地/marketplace 识别、原生安装及桌面库存服务重扫 |
| Plugin 原生安装 | 桌面分发使用各 Agent 官方 CLI 注册 marketplace、安装、启用；成功后记录目标。卸载同步原生注册状态 | 隔离配置根下安装、启用、重复安装、卸载、失败重试；Claude 有安装注册表时不把残留缓存显示为已安装 |
| Codex Provider | 缺省为 Responses；直接配置写入、表单选项和供应商导入复用原生协议合同 | Adapter、旧 Provider 服务、Source 服务及共享协议路由回归；未发起模型请求 |
| 配置根 | 统一读取 `CODEX_HOME` / `CLAUDE_CONFIG_DIR`，保留显式路径覆盖 | 路径回归及真实 Claude `mcp add` 的配置写入位置 |
| Claude Scoped Rules | 扫描用户级 `rules/**/*.md`，保留原始 `paths` frontmatter；复用托管副本、历史、重扫和备份恢复 | 编辑、重开、外部修改、备份恢复、缺失记录、越界路径及长文件名回归；项目级 Rules 由 #197 继续跟踪 |

没有新增依赖、数据库 schema、代理或业务限制。原生 Plugin 的临时源位于各 Agent
配置根的 `plugins/prompthub-sources/<owned-marketplace>/<name>/<version>`；卸载只清理
该 Plugin 的 PromptHub 源和注册，供应商缓存由供应商管理。Core 目录分发是包文件操作；
桌面分发入口负责原生安装闭环，二者不混淆成功含义。

既有 MCP 记录里已经丢失的字段不能自动推断恢复。同名导入仍遵循跳过重复记录的合同；
应先备份并核对原始配置、现有记录与目标绑定，再依据原始配置恢复正确记录。旧
`wire_api=chat` 可被检查，但不能继续作为当前 Codex 原生直连配置写入；既有独立
bridge 主题保持原范围，未新增转换代理。用户确认的 `~/.codex/skills` 保持原状。

原生安装函数保留注册、安装、必要启用及读回确认的顺序编排，因而超过 50 行；拆成
多层策略会分散这一闭环。安装、重复安装和失败重试的隔离原生 CLI 用例覆盖该顺序。

## 可用基础与未验收边界

- 当前 `.codex-plugin/plugin.json` 与 `.claude-plugin/plugin.json` 同包、含两个 Skills
  的 fixture 能正确识别两个 native targets 并完成目录复制。#190 的旧格式双目标识别
  在初始样本通过；新增 portable / 单 Skill / 原生安装验证见上节。
- 本机只读 CLI 诊断返回 `codex-cli 0.148.0`、`Claude Code 2.1.209`。
- Claude 单 Skill Plugin 原生 `plugin validate` 返回成功，只有缺少 description / author
  的元数据警告；修复前 PromptHub 拒绝同一包，修复后接受。没有执行包内 hooks、Skill 或 MCP server。
- Session JSONL、分页和恢复入口的既有测试通过；Usage 测试覆盖替代远端边界。
  未查询真实账号额度、未验证 OAuth 登录和实际模型请求，不能宣称这些远端功能已验收。
- Plugin 子 Skill 导入的当前源码会复制包并保存 managed repo 路径，失败会回滚新增记录。
  历史子 Skill 导入失败不能直接当作当前缺陷；本轮未执行该 Electron UI 流程。
- 当前 `CLAUDE.md` 外部修改后重新 bootstrap / scan 的隔离样本保留外部修改。
  这不是 #209 的真实桌面启动验收，不据此关闭 issue。
- Provider 有用户文件之外的项目、环境与 managed precedence。当前文件 inspect / 单元测试
  不等同于 Agent 最终生效配置验收；本轮没有改动真实账号或 Agent 配置。

## 复现输入与结果

复现使用实际 core 公共入口、隔离 SQLite 和临时文件；供应商根目录由 fixture 注入。
初始复现仅执行 CLI 版本参数及临时包校验；修复验证另外执行隔离 profile 下的原生
安装、启用、卸载及 MCP 配置检查。临时脚本、数据库、包和目录已清理。

### Codex MCP

输入 TOML 的关键部分：

```toml
[mcp_servers.docs]
url = "https://example.test/mcp"
enabled = false
bearer_token_env_var = "AUDIT_TOKEN"
enabled_tools = ["read"]
disabled_tools = ["delete"]
[mcp_servers.docs.env_http_headers]
Authorization = "AUDIT_AUTH"

[mcp_servers.local]
command = "node"
args = [
  "--inspect",
  "server.js",
]
[mcp_servers.local.env]
MODE = "audit"
```

`CoreMcpLibraryService.importFromFile` 后 `docs.enabled=true`，Codex 投影只有 URL；
`local` 投影只有 command。新的 service 读取持久化结果仍缺少上述字段。

### Claude MCP

配置 `{mcpServers:{helper:{type:"http",url:"https://example.test/mcp",headersHelper:"./get-headers.sh"}}}`
通过 `createFromSource({kind:"config", input})` 导入，
`getMcpTargetEntryObject("claude", server)` 丢失 `headersHelper`。

### Plugin

1. 根 `plugin.json` 使用 `agent-plugins.org/schemas/1.0.0/plugin.schema.json`，
   name 为 `portable`，包含 `extensions["com.openai"].interface.displayName`，
   目录含一个 Skill 和根 `mcp.json`。
2. `importLocalPluginPackage` 的 native targets 为 Antigravity / Copilot，未包含 Codex；
   displayName 退回包名，MCP inventory 为零。
3. 另一个包同时添加 `.codex-plugin/plugin.json`（name 为 `stale-overlay`）和第二个 Skill，
   导入身份变成 `stale-overlay`，与 portable 根身份及官方 overlay 优先级不符。
4. 双原生 manifest、单 Skill 包在 PromptHub 被拒绝；`claude plugin validate <临时包>` 成功。
   添加第二个 Skill 后 PromptHub 接受，native targets 为 Codex / Claude Code。

## GitHub 对照（2026-10-13）

| Issue | 远端 | 本轮结论 |
| --- | --- | --- |
| [#190](https://github.com/legeling/PromptHub/issues/190) 双原生 Plugin | open | Codex / Claude 双原生、portable、单 Skill 及原生安装生命周期已验证；Windows / GUI / 大包及发布范围仍未完成 |
| [#194](https://github.com/legeling/PromptHub/issues/194) 共享 Skills 目录 | open | 独立共享目标；不要求迁移用户确认可用的 Codex 目录 |
| [#196](https://github.com/legeling/PromptHub/issues/196) / [#197](https://github.com/legeling/PromptHub/issues/197) Rules 扫描 | open | #196 用户级 Claude rules 扫描和读写已本地完成；#197 更广平台及项目级矩阵仍未完成 |
| [#212](https://github.com/legeling/PromptHub/issues/212) Instructions / Scoped Rules | open | 产品范围请求；此次不做模块重命名或全面重设计 |
| [#209](https://github.com/legeling/PromptHub/issues/209) 外部 CLAUDE.md 被恢复 | open | 隔离重开样本未复现；真实桌面启动链待验收 |
| [#210](https://github.com/legeling/PromptHub/issues/210) 备份恢复覆盖 / 历史 | open | 本地覆盖层记录已修复待发布；相关既有检查通过，不宣称本轮完成真实用户恢复 |
| [#193](https://github.com/legeling/PromptHub/issues/193) 删除规则后失效记录 | open | 当前规则模块已有 missing 状态与显式清理合同；不将远端 open 等同于未实施 |
| [#203](https://github.com/legeling/PromptHub/issues/203) 配置备份管理 | open | Codex sync 相关测试通过；其完整跨平台交付范围仍由原主题跟踪 |
| [#202](https://github.com/legeling/PromptHub/issues/202) MCP 请求头环境变量 | closed | 已发布的目标写法适配；上述 native TOML 导入丢失是独立缺陷 |

未修改 GitHub issue 状态，未提交、推送或创建 PR。

## 已执行检查

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/main/mcp-library-codex-sync.test.ts \
  tests/unit/main/agent-codex-provider-adapter.test.ts \
  tests/unit/main/agent-claude-provider-adapter.test.ts \
  tests/unit/main/agent-session-service.test.ts \
  tests/unit/main/agent-usage-service-codex.test.ts \
  tests/unit/main/agent-usage-service.test.ts \
  tests/unit/main/rules-workspace.test.ts \
  tests/unit/main/rules-workspace-import.test.ts
```

初始核查结果：8 个文件、147 项测试通过。该组既有测试没有覆盖全部新发现的原生输入，
不用于否定实际复现。修复后新增 MCP 往返、原生 Plugin 本地/marketplace、配置根、
Scoped Rules 和安装失败重试回归，并运行相关既有 Provider / Plugin / Rules / MCP 回归。
Core canonical MCP / Plugin 与 schema 四个文件共 43 项通过。

原生安装验证入口：

```sh
PROMPTHUB_NATIVE_AGENT_TESTS=1 pnpm --filter @prompthub/desktop exec vitest run \
  --project integration tests/integration/native-plugin-installation.test.ts \
  --minWorkers=1 --maxWorkers=1
```

三个原生集成用例分别通过：双目标安装/启用/重扫/重复安装/卸载；真实 marketplace 注册后
的安装失败及重试；Codex MCP 配置解析和 Claude 自定义根写入。使用空的隔离 profile，
未修改用户现有 Agent 配置。没有运行桌面 GUI、Windows 原生流程、发布构建、真实模型
请求或 MCP 网络连接；CLI 配置与注册成功不代表这些边界已经验收。

最后的 MCP 回归包含 config、导入健康、Codex 同步、持久化目标及新增往返五个文件，
共 84 项通过；共享协议路由 7 项通过。Core 与 Desktop 源码类型检查、Desktop 测试
类型检查、40 个相关源码/测试文件 ESLint、文件大小检查和 `git diff --check` 通过。
原生集成文件的三个用例在最终代码上统一运行通过。没有保留测试进程或临时 profile。

## 当前官方合同

### Claude 配置目录与账号后续回归（2026-10-13）

后续核查复现四项遗漏：关闭云服务的字符串值被当作启用；显式目录与继承环境在
会话索引、备份来源、MCP inventory / preset 间分歧；自定义目录额度优先读取默认
Keychain 账号；原生 resume 丢失配置目录。四项已修复；显式设置保留优先级，
旧 inventory 不能覆盖新目录设置。默认原生 MCP 位置和其他 Agent 的既有行为保留。

权威行为见 [Claude Code 平台卡片](../../knowledge/reference/agent-platforms.md#claude-code)。
路径语义由既有平台路径层及每 Agent 定义维护，不新增存储位置或自动搬移用户数据。
`AgentResumeCommand.environment` 是当前动作的派生参数，不写入 SQLite；索引读取
时从当前 reader descriptor 派生，已有索引无需 schema 迁移。回退代码不会改变原生
配置、凭据或 transcript；已有错误目录绑定不自动合并或删除。

回归入口：`apps/desktop/tests/unit/main/claude-provider-flags.test.ts`、
`apps/desktop/tests/unit/main/claude-usage-account-scope.test.ts`、
`apps/desktop/tests/unit/main/claude-config-root-workflow.test.ts`。覆盖真实 Provider /
模型配置读取、隔离凭据与额度、真实 SQLite 关闭重开、live / indexed session、
备份 descriptor、注册 MCP preset、preload → registered resume IPC → 实际生成
脚本。只替换 Electron 运输、OS 终端打开与外部凭据/网络边界，脚本通过本任务
记录程序执行，不启动 Claude、hooks 或真实模型请求。无 GUI / Windows 原生验收。

部分根目录与 Provider 工作流用例超过 50 行，保留配置准备、SQLite 关闭重开、注册入口、脚本执行及
账号隔离断言的可见顺序，便于识别遗漏的产品初始化或实际消费步骤；其 fixture
只准备前提，不替代被测业务。其余实现仍沿用既有模块和固定规模的路径判断。

本地验证：17 个 Desktop 文件共 186 项、4 个 Core 文件共 33 项通过（按文件和
用例去重，共 219 项）。Shared 常用全套测试、Shared / Core 类型检查、Desktop
源码及测试类型检查、26 个相关 TS 文件 ESLint、`git diff --check` 通过。
首轮目录脚本断言因 macOS `/var` 与 `/private/var` 的真实路径差异失败；fixture
使用真实临时目录后重跑通过，未改变业务路径或放宽断言。Desktop 工作目录下的
首轮 lint 未覆盖 base path 外的共享文件；仓库根指定现有 Desktop config 后完整通过。

关键回归重跑命令：

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/main/claude-provider-flags.test.ts \
  tests/unit/main/claude-usage-account-scope.test.ts \
  tests/unit/main/claude-config-root-workflow.test.ts \
  tests/unit/main/codex-claude-root-paths.test.ts
pnpm --filter @prompthub/desktop typecheck:tests
pnpm --filter @prompthub/core typecheck
```

其余正常基线覆盖 Claude Provider、模型配置、Usage、live / indexed sessions、
index factory、terminal launcher、portable backup、conversation IPC / service、
managed inventory、公共 runtime；Core 覆盖 Agent assets / settings upgrade 与 MCP
projection / sync policy。新增目录工作流还通过真实 MCP preload / 注册 IPC 写入
所选文件，保留另一目录的原始字节和目标文件中的无关字段。

隔离副本中恢复四类错误行为（字符串存在即启用云服务、默认 Keychain 优先、备份
source 再读继承目录、启动脚本不设置/清除配置环境），运行前三个新回归文件，
退出码为 1，18 项中 11 项按业务断言失败、7 项通过。失败覆盖 Provider/protocol、
账号 plan、备份 source root 及实际生成脚本的环境值，不是编译或初始化失败。
共享工作区未施加变异；临时副本、数据库和启动文件均已清理，未保留进程。

- [OpenAI Plugin 构建](https://developers.openai.com/plugins/build/plugins)：portable schema、
  `com.openai` overlay、Skills/MCP 自动发现、marketplace 和启用合同。
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)：TOML 原生字段、
  环境变量认证、HTTP headers、工具选择。
- [Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)：当前
  `wire_api` 默认及合法值为 `responses`。
- [Codex 环境变量](https://learn.chatgpt.com/docs/config-file/environment-variables)：`CODEX_HOME`。
- [Claude Plugin 参考](https://code.claude.com/docs/en/plugins-reference)及
  [Plugin 加载](https://code.claude.com/docs/en/plugins/loading)：包校验、安装注册、启用与加载区别。
- [Claude MCP](https://code.claude.com/docs/en/mcp)：配置作用域、`headersHelper`。
- [Claude 环境变量](https://code.claude.com/docs/en/env-vars)：`CLAUDE_CONFIG_DIR`。
- [Claude Memory](https://code.claude.com/docs/en/memory)：规则目录及路径作用域。

文档为核查日内容；安装 CLI 版本与文档中的新增能力需分开验收。Skills 默认目录
按用户已确认决定保留，不以最新文档的新路径强制迁移已有内容。
