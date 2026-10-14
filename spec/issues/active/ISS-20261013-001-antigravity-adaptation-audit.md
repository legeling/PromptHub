# Antigravity 适配核查

- ID: `ISS-20261013-001`
- Status: open / #220 MCP repairs local_done, including Agent import, native preview and macOS project GUI/stdio calls; IDE Plugin and CLI discovery repairs locally verified; native Windows acceptance pending
- Checked: 2026-10-13
- Related: PromptHub #220, #226, #197, #212, #190, #203; historical #103, #165
- Boundary: 当前工作区源码、官方公开文档、已读取的 GitHub issue 状态、隔离文件系统、真实 `agy` CLI 配置管理，以及 macOS Antigravity 桌面项目 GUI 和真实模型驱动的本地 stdio MCP 调用。当前构建在独立资料目录运行，最终分发/移除使用临时启动器的软件渲染。未改用户全局 MCP 或凭据；Windows 2.16.0、远程/OAuth、签名安装包及默认 GPU 验收仍未覆盖。远端 issue 状态未在 GUI 补验后再次刷新。

## 结论

当前实现部分支持 Antigravity，但统一平台根目录不能完整表达 CLI、Antigravity 2.0、IDE 的资产路径。MCP 通用远程导入、原生字段保全、OAuth 脱敏，以及 IDE Plugin 软链重扫和旧库兼容性刷新已修复。CLI 的安装发现和版本诊断已复用官方 `agy` 入口；CLI 注册、独立资产路径和项目级 Plugin 安装尚未完成。

初始核对时安装的 Antigravity 为 2.8.1；GUI 补验期间客户端更新到 2.23.0，该版本也完成实际项目工具调用。#220 报告的是 Windows 2.16.0，不能将本机探针结果提升为报告者 Windows 版本的原生验收。

## 当前官方路径合同

| 资产 | Antigravity 2.0 / IDE | CLI | 项目 |
| --- | --- | --- | --- |
| Skills | `~/.gemini/config/skills/` | `~/.gemini/antigravity-cli/skills/` | `.agents/skills/` |
| Plugins | `~/.gemini/config/plugins/<name>/plugin.json` | `~/.gemini/antigravity-cli/plugins/<name>/`，由 `agy plugin` 安装管理 | `.agents/plugins/` |
| MCP | `~/.gemini/config/mcp_config.json` | 同左 | `.agents/mcp_config.json` |
| 模块 Rules | `~/.gemini/config/rules/*.md` | 同左，另有 `~/.gemini/antigravity-cli/rules/*.md` | 目录作用域的 `.agents/rules/*.md` |
| Subagents | `~/.gemini/config/agents/` | 同左 | `.agents/agents/` |
| Hooks | `~/.gemini/config/hooks.json` | 同左，另可位于 CLI settings | `.agents/hooks.json` |
| 模型 / 偏好 | 产品内设置，不能把 CLI 文件视为 IDE 设置 | `~/.gemini/antigravity-cli/settings.json` | 按原生作用域管理 |

独立的 `AGENTS.md` / `GEMINI.md` 是另一个规则入口，不应为 Gemini 和 Antigravity 的同一个实体文件建立竞争写入者。CLI 安装目录与官方 Marketplace 跨客户端同步并不等于 PromptHub 直接复制 IDE 包已经完成 CLI 注册。

来源：[Skills](https://antigravity.google/docs/skills)、[Plugins](https://antigravity.google/docs/plugins)、[MCP](https://antigravity.google/docs/mcp)、[Rules](https://antigravity.google/docs/rules)、[Subagents](https://antigravity.google/docs/subagents)、[Hooks](https://antigravity.google/docs/hooks/)、[Settings](https://antigravity.google/docs/settings)。

## 差异、修改建议与验收

下表保留修复前的核查差异与建议；本轮实现和验证见后续修复记录。P0 是敏感数据与保全问题，P1 是现有适配主路径，P2 是独立增量能力。

| 优先级 / 证据 | 项目 | 当前差异 | 修改建议 | 最低验收 |
| --- | --- | --- | --- | --- |
| P0 / 隔离复现 | MCP OAuth 脱敏 | `redactMcpConfigContent` 隐藏 env/headers，却保留 `oauth.clientSecret`；Core 返回的完整配置预览包含它 | 在既有 MCP 传输与 secret 保留边界增加 OAuth 字段脱敏；脱敏占位符不能回写覆盖真实凭据 | 使用合成 OAuth 配置验证 apply/remove/preview 返回值与 IPC；源文件秘密保持，返回值无秘密 |
| P0 / 隔离复现 | MCP 原生字段保全 | 目标导入后生成同名 server 丢失 `authProviderType`、`oauth`、`disabledTools`；共享 server 类型未表达这些字段 | 定义一个有类型的 Antigravity 原生选项边界，覆盖导入、保存、编辑、投影和恢复；使用现有持久化升级及 secret 规则，不任意透传未知 JSON 或默默删字段 | 带 Google 认证、OAuth、禁用工具和 disabled 的旧配置往返；明确覆盖后仍保留所有已声明选项 |
| P1 / 隔离复现 | 文件、粘贴、Plugin 子 MCP 导入 | 原生目标扫描识别 `serverUrl`；通用文件/粘贴导入未传来源 target，远程条目被过滤。Plugin 子 MCP 调用同一通用路径 | 文件、粘贴和子 MCP 共用一个明确来源格式的解析入口；在单一边界转换为规范 server，空导入不能掩盖识别错误 | 同一个原生远程配置从三种入口导入得到一致结果，包含失败诊断 |
| P1 / 源码确认 | CLI / IDE 路径 | registry 只有 config 根和一个 Skill/Plugin 目录；CLI 已有独立 model/session 路径，却未形成统一资产合同 | 保留产品身份，在唯一平台合同中区分客户端与资产用途；MCP 共用、Skill/Plugin 分开，安装状态和撤回记录带相同目标语义 | IDE-only、CLI-only、两者并存，含 Windows 路径、安装、重开、撤回和旧绑定升级 |
| P1 / 源码确认 | CLI 发现和诊断 | Antigravity 缺少 `cli.executableCandidates`；普通发现依赖 Skill 父目录存在 | 增加 `agy` 的官方诊断入口，分别记录产品安装证据与资产目录；扫描不得创建目录或启动额度 helper | CLI 有而 config 根没有仍能正确识别；只有无关 `.gemini` 状态不冒充完整安装 |
| P1 / 文件系统复现 + 源码确认 | Plugin 软链重扫 | 原生 symlink 分发确实生成链接，但 direct scan 只接受 `Dirent.isDirectory()`；realpath containment 也不接受指向 Agent 根外的托管库 | 按已管理分发记录安全识别指向托管包的链接，验证包身份和边界；保留越界链接保护，不盲目跟随任意 symlink | copy/symlink 分发、重扫、重开、撤回都一致；危险链接和断链明确诊断 |
| P1 / 隔离复现 | 旧 My Plugins 元数据 | read 直接返回已存 nativeTargetIds；旧条目缺少新 Antigravity id 时，原生包在 UI 仍被禁用 | 以实际包为依据刷新派生兼容性，复用既有更新/升级所有者，保留 id、历史、源路径和分发绑定；避免每次渲染完整扫描 | 旧条目缺 Antigravity id 的升级 fixture；升级后可选目标，重复升级无变化 |
| P1 / 部分完成 | Plugin 安装面 | #226 已实现 IDE 全局 native-only copy，未覆盖项目路径或 CLI install/list/enable/disable 注册 | 按客户端提供安装面；CLI 使用官方 `agy plugin` 的可验证结果，项目包使用项目根；源包透明保留与转换能力分别标明 | 原生 list/加载、安装状态、失败撤回；源目录与目标包库存核对 |
| P1 / 源码确认 | 原生包健康与 inventory | Antigravity helper 只检查 name/description；rules 没有 inventory 字段，hooks 仅按文件存在计数；前轮 hooks fixture 不证明原生 schema | 增加源格式组件检查与可见诊断，保留原始未知元数据；区分安全、格式和实际加载。官方 manifest 表格与内嵌 schema 的 name/额外字段要求有差异，应使用 IDE/CLI 各自验证边界 | 官方有效 MCP/hooks/Rules/subagent fixtures、错误 fixture、原生加载；不因 schema 不确定性静默删源字段 |
| P1 / 源码确认 | Rules 目录与触发模式 | 当前主要是固定单文件 descriptor；尚未完成 config/rules、CLI rules 和目录级扫描，也没有 trigger 的原生管理合同 | 复用 #197 的规则来源矩阵；支持当前四种 trigger、description/globs 与目录作用域；Instructions 的产品拆分另路由 #212 | 扫描、编辑、删除重扫、冲突保护；缺前置字段与非法 trigger 不冒充有效规则 |
| P2 / 明确能力缺口 | Subagents / Hooks 独立管理 | Plugin 整包保留相关文件，不等于支持全局/项目 native definitions 的单独管理 | 先提供只读发现、schema 诊断和来源说明；新增编辑时再定义所有权、备份/撤回和权限合同 | 不执行 hooks；原生有效 fixture、修改保全和重开一致 |
| P2 / 上游时效 | 旧 Workflows | 当前没有专用转换入口；Plugin inventory 中 workflows 只是 docs，不证明能执行 | 提供发现、迁移预览与明确的 Skill 转换入口，保留原文件和相对资源，避免继续宣传旧目录可执行 | 同名 Skill 冲突、frontmatter、资源引用、幂等和恢复；不自动迁移用户内容 |
| 验证项 / 部分正确 | 模型配置 | 默认 context 已正确转到 CLI settings，写 model 后主要靠重新读文件验收；没有证明 IDE 生效或受支持模型实际采用 | 标明 CLI 配置能力；核对当前 model 字段、模型可用性和原生选择结果。自定义 Provider 不应复用未确认的 Gemini 合同 | 真实 CLI 读取/运行采用所选模型，失败恢复；IDE 单独验收 |
| 验证项 / 部分正确 | History / Usage | History 已限定 CLI 可见文本并禁止解码私有 blob；Usage 依赖语言服务和 Cloud Code 非公开接口，有后台 helper 路径，已有未安装 guard | 保持 partial/source/version 标签；分别验收 CLI/IDE 和额度分组；保留未安装保护，不把后台探针当作无副作用磁盘扫描 | 版本和 OS fixtures、源不可用语义、helper 退出、刷新不开新进程、真实额度与 native UI 对照 |
| P1 / 文档差异 | 平台参考与验收说明 | 平台参考开头已写独立 CLI Skill 根，后面的 Antigravity 段仍称两客户端共享 customization；前轮 106 cases 不含上述新增缺口 | 原位修正现有平台主题，把官方合同、当前实现、已测边界和未测原生加载分别描述 | 链接/路径一致；不能用静态测试关闭 #220/#226 |

## 代码定位

- MCP 来源解析：[mcp-import.ts](../../../packages/core/src/mcp-import.ts)，重点 `importServerEntry`、`parseJsonImportServers`、`readMcpTargetServers`。
- MCP 投影与脱敏：[mcp-config.ts](../../../packages/shared/utils/mcp-config.ts)，重点 `toAntigravityMcpEntry`、`redactMcpJsonValue`、`mergeMcpServersJson`；共享字段位于 [mcp.ts](../../../packages/shared/types/mcp.ts)。
- 三个导入入口：[mcp-library.ts](../../../packages/core/src/mcp-library.ts) 的 `importFromFile` / `createFromSource`，以及 [plugin.ipc.ts](../../../apps/desktop/src/main/ipc/plugin.ipc.ts) 的 `importChildMcpServersForPlugin`。
- 客户端路径与能力：[platforms.ts](../../../packages/shared/constants/platforms.ts)、[agent-platform-context.ts](../../../apps/desktop/src/main/services/agent-platform-context.ts)、[agent-platform-capabilities.ts](../../../packages/shared/constants/agent-platform-capabilities.ts)。
- Plugin 本地元数据：[service.ts](../../../packages/core/src/plugin-library/service.ts) 的 `read`；分发 [distribution.ts](../../../packages/core/src/plugin-library/distribution.ts)；扫描 [plugin.ipc.ts](../../../apps/desktop/src/main/ipc/plugin.ipc.ts) 的 directPackages 与 containment。
- Rules：[rules.ts](../../../packages/shared/constants/rules.ts)、[rules-workspace.ts](../../../packages/core/src/rules-workspace.ts)；保留 [rules-workspace 稳定主题](../../knowledge/behavior/rules-workspace.md) 的同路径不重复 descriptor 原则。
- 深层适配：[agent-model-config.ts](../../../apps/desktop/src/main/services/agent-model-config.ts)、[agent-session-antigravity.ts](../../../apps/desktop/src/main/services/agent-session-antigravity.ts)、[agent-usage-antigravity-local.ts](../../../apps/desktop/src/main/services/agent-usage-antigravity-local.ts)。

## 本轮可重复探针结果

### 后续修复与验证

MCP 的原生远程导入、认证/工具字段保全及 OAuth 脱敏复用现有解析、投影和设备凭据存储；IDE Plugin 的软链扫描与旧兼容性字段刷新复用现有包身份和目标绑定。没有新增发布门禁、重试、后台服务或第二套存储。CLI 安装发现与诊断使用现有平台注册表和 native runner。CLI 独立资产路径、Scoped Rules 及 workflows 迁移仍按上表的独立边界处理，不能用本轮文件读写结果声明原生客户端全量验收通过。

读取旧 Plugin 元数据时只检查有限的 manifest markers 及其引用路径，成本为 `O(P × M + R)`（P 为已物化插件数、M 为固定 marker 集合、R 为 manifest 引用数），不递归扫描包文件。MCP 解析/投影和凭据提取仍按配置字节数线性处理；没有新增网络请求。

通过 `pnpm --filter @prompthub/desktop exec tsx -e ...` 运行现有生产函数，全部使用临时目录和合成配置，结束后清理。

| 探针 | 实际结果 |
| --- | --- |
| 同一 `serverUrl` 配置调用 `readImportServersFromContent` | 0 个服务 |
| 同一文件调用 `readMcpTargetServers(..., "antigravity", ...)` | 1 个服务 |
| 原生导入结果经 `mergeMcpServersJson` 生成同名配置 | authProviderType / oauth / disabledTools 均未保留 |
| 含合成 clientSecret 的配置调用 `redactMcpConfigContent` | 返回值仍含该值 |
| 原生包导入后模拟旧 nativeTargetIds，再重新创建 service.read | 未恢复 Antigravity id |
| native symlink 分发后的 Dirent | isSymbolicLink=true；isDirectory=false，无法通过当前 direct scan 条件 |

以上证明生产解析/投影/元数据函数及文件系统条件的缺口，不证明真实 OAuth 登录、MCP 调用或完整 GUI 操作。未重跑上一轮 106 cases，也未新增产品源码或改变真实 Agent 配置。

验证结果：本轮 16 个相关测试文件、222 个不同用例全部通过（Desktop 189、Core 33），包含真实临时文件读写及重开，不包含 GUI 或远程 MCP 登录/调用。Core、Desktop 与 Desktop tests 类型检查、触及 Desktop 文件的 ESLint 和 diff 检查通过。Plugin 子 MCP 的实际 IPC 返回值也执行了凭据脱敏回归，My MCP 保存的合成密钥保持不变。新临时目录和前台检查进程均已清理/退出。

| 已修复项 | 实际验证 |
| --- | --- |
| 原生远程 MCP 文件/粘贴/Plugin 子配置导入 | 相同 serverUrl 可导入，并在持久化重读后保留 |
| MCP 认证与工具字段 | import → edit → reopen → apply/remove；Google 认证、OAuth、禁用工具保全 |
| OAuth 密钥 | 配置预览/IPC/传输脱敏；脱敏保存不覆盖本地值；canonical current/version 不含明文，vault 回读及下一版本保全 |
| IDE Plugin copy/symlink | 实际 Desktop IPC 分发 → 库存重扫 → 重开 → 撤回；源文件字节保持 |
| 旧 My Plugins 元数据 | 已有 id/source 不变，当前 marker 恢复 Antigravity nativeTargetIds |
| 危险分发链接 | 未登记链接及已登记但指向不同源包的链接均不进入库存 |
| CLI 安装发现/诊断 | 无 config 根但存在 agy 的发现回归；本机实际 native runner 调用 --version，installed / 1.2.7，无更新操作 |

CLI 安装发现、版本诊断已验证，但不等于 CLI Plugin 注册或 Skill 路径已适配。Windows 报告中的 2.16.0、原生 Plugin loader、真实 OAuth/MCP 调用、CLI 独立资产路径、项目级 Plugin 和 Scoped Rules 仍待验收/实施；#220/#226 保持远程 open。

### #220 定向复现与原生配置验证（2026-10-13）

Issue 正文只要求“新版 MCP 配置”，没有提供具体配置、操作步骤或报错。官方 MCP 文档
再次核对确认：远程配置使用 `serverUrl`，可带 `headers`、`authProviderType`、`oauth`、
`disabled` 和 `disabledTools`。本机 IDE 版本为 2.8.1，CLI 为 `agy 1.2.7`；CLI 验证
不替代报告中的 Windows IDE 2.16.0。

旧行为复现使用 `apps/desktop/tests/helpers/reproduce-antigravity-mcp-regression.mts`。
脚本复制 Core/Shared/DB 源码与既有回归到临时目录，复用已安装依赖，不修改工作区产品
源码。第一组从 `0d067dfe8e22badf20fa063804922d9b652fe153` 读取修复前 importer；
第二组恢复当前 importer，仅在副本中恢复“只投影 transport”的旧行为。

```sh
pnpm --filter @prompthub/desktop exec tsx \
  tests/helpers/reproduce-antigravity-mcp-regression.mts \
  0d067dfe8e22badf20fa063804922d9b652fe153
```

| 场景 | 实际入口与断言 | 结果 |
| --- | --- | --- |
| 修复前通用文件/粘贴导入 | 既有 `mcp-antigravity.test.ts` 的两个 `imports remote native config` 用例；预期导入 1 个 `serverUrl` 服务 | 两项均失败：实际 0 个；Vitest exit 1 |
| 旧投影行为 | 同一两个用例，预期原生字段完整往返 | 两项均失败：实际只保留 `serverUrl`，丢失 Google 认证、OAuth 和禁用工具；Vitest exit 1 |
| 当前文件/粘贴、编辑、重开、写入、移除 | 真实 Core 公共入口、临时文件；确认原生字段、凭据保全、脱敏及无关配置 | `mcp-antigravity.test.ts` 6 项通过 |
| Plugin 子 MCP 导入和 IPC 脱敏 | 既有 `plugin-child-mcp-import.test.ts`，替换 Electron 运输层，业务和文件操作真实执行 | 3 项通过 |
| 当前 canonical MCP 持久化 | 真实临时 bundle/version 文件；合成设备 secret-store fixture；版本和重开保留 OAuth | `packages/core/tests/canonical-mcp-library.test.ts` 18 项通过；不是实际账号凭据验收 |
| 原生 CLI 配置管理 | PromptHub 按 preset 写入隔离 HOME 下的全局路径；真实 `agy mcp list` / `disable`；PromptHub 重扫和移除后 CLI 再读取 | 新增 `antigravity-mcp-native.test.ts` 1 项通过：HTTP/stdio 识别、禁用状态读回、认证字段保留、只移除自有条目 |

当前正常流程使用所属 package 的常用入口，命令为：

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/main/mcp-antigravity.test.ts \
  tests/unit/main/plugin-child-mcp-import.test.ts
pnpm --filter @prompthub/core exec vitest run tests/canonical-mcp-library.test.ts
PROMPTHUB_NATIVE_AGENT_TESTS=1 pnpm --filter @prompthub/desktop exec vitest run \
  --project integration tests/integration/antigravity-mcp-native.test.ts \
  --minWorkers=1 --maxWorkers=1
```

新原生用例的正常闭环保留在一个超过 50 行的用例中，确保输入、落盘、重新构造 service 并重读、
CLI 消费、CLI 修改和撤回共享同一份配置，避免拆成彼此独立且不能证明重开保全的样本。
CLI 只执行配置 list/disable，没有启动 MCP server 或调用模型。所有 profile、隔离源码
副本和前台进程已清理；首次临时复制运行因 pnpm bin 包装器相对路径解析失败，不作为
红测证据，改用现有 Vitest 的绝对入口后两组命中业务断言。

新增测试与复现 helper 均已被 Desktop tests TypeScript 检查选中并通过，两个文件 ESLint
通过；文件大小检查及 `git diff --check` 通过。临时目录检查确认没有遗留本轮源码副本或
原生 profile。此次只新增验证文件并更新本问题记录，未修改用户 Agent 配置或产品实现。

初次定向验证确认配置导入及字段保全缺陷，当前 Core 路径和本机 CLI 配置管理通过。
后续发现的 renderer Agent 导入和预览缺口已按下一节修复；当前 MCP 配置范围标记为
`local_done`。Windows IDE 2.16.0、桌面 GUI、真实 MCP 连接或 OAuth 登录仍未运行，
也没有报告者的确切输入；本地完成不证明该原生环境或发布已验收。

### Agent MCP 导入与原生预览修复

真实 renderer action → Zustand → preload → 注册 IPC → Core → canonical storage
的复现发现两个额外缺陷：导入从脱敏库存重建普通 draft，丢失 OAuth / 禁用工具且会把
请求头遮罩作为新凭据；详情预览由 renderer 手写旧 `url` 格式，遗漏原生字段和禁用状态。

两个回归在产品修复前均命中业务断言并退出 1：新记录没有 `oauth` / `disabledTools`；
预览显示 `type` / `url` 而非期望的 `serverUrl` / native fields。首次测试准备中的 Electron
导入顺序和 localStorage 初始化失败已修正，不计作缺陷红测。

当前实现复用 create-from-source IPC 的 `{ kind: "target", preset, serverName }` 分支，
由 Core 读取实际目标文件并创建完整记录；renderer 仅提交来源定位信息。MCP 工作区和
Agent asset panel 共用相同请求构造器，原生预览使用共享投影与脱敏合同。权威约定见
[MCP preservation requirement](../../changes/active/mcp-version-history-and-projection-safety/specs/mcp/spec.md#antigravity-native-definition-preservation-220)。
新增分支按配置大小线性读取解析一次，没有新增 IPC channel、依赖、DB schema、vault
布局、代理、重试或业务限制。

```sh
pnpm --filter @prompthub/desktop exec vitest run --project integration \
  tests/integration/antigravity-mcp-agent-import.test.tsx --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/components/mcp-manager-agent.test.tsx \
  tests/unit/components/agent-assets-workspace.test.tsx \
  tests/unit/main/mcp-antigravity.test.ts \
  tests/unit/main/mcp-library-import-health.test.ts \
  tests/unit/services/mcp-form-utils.test.ts
```

新增三项集成通过，分别覆盖实际 renderer action / preload / IPC 导入、表单编辑、数据库
关闭重开、完整凭据投影；原生字段与 disabled 的脱敏组件预览；失效条目/非法路径拒绝且
不新增记录。Electron 消息运输和 OS encryption 边界被替换，后者使用临时密钥的 Node
AES-GCM；业务、SQLite、canonical bundle、设备 vault 和文件读写真实执行。未启动
Electron GUI，未使用用户凭据。61 项相关既有回归及 Core / Desktop tests 类型检查通过。
Desktop 源码类型检查、11 个相关文件 ESLint、文件大小检查与 diff 检查通过，全部本轮
临时 profile 已移除；没有新增或保留常驻进程。

升级无需迁移并保持已有原生目标文件不变。历史错误导入不能从遮罩恢复凭据：先备份
My MCP 和原始 Agent 配置并记录目标绑定，再删除 My MCP 中的错误记录，从 Agent MCP
重新导入并按需恢复分发。My MCP 删除记录本身不卸载 Agent 条目；应避免选择“从 Agent
卸载”。回退新版本前保留原始目标配置与当前管理库备份，旧代码仍有上述导入缺陷。

## MCP 完整操作链路复核：原生名称与双作用域

原生条目 `Docs.API` 与 `docs-api` 在 `getTargetStatus` 返回中都变成 `docs-api`，
导致名称碰撞、选中导入失真和按名移除找不到原条目。新增集成用例在修复前实际失败于
`serverNames` 断言。Core 统一导入不再预先改写名称，共享 normalizer 对 imported
记录保留原始 entry key；手动、生成和商店命名仍使用既有 slug。编辑、canonical 重开、
去重、分发、同步和移除沿用同一名称，无新增 schema、目录或限制。

验证入口：

```sh
pnpm --filter @prompthub/desktop exec vitest run --project integration \
  tests/integration/antigravity-mcp-agent-import.test.tsx --minWorkers=1 --maxWorkers=1
PROMPTHUB_NATIVE_AGENT_TESTS=1 pnpm --filter @prompthub/desktop exec vitest run \
  --project integration tests/integration/antigravity-mcp-native.test.ts \
  --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/main/mcp-antigravity.test.ts \
  tests/unit/main/mcp-library-import-health.test.ts \
  tests/unit/main/plugin-child-mcp-import.test.ts \
  tests/unit/services/mcp-config.test.ts \
  tests/unit/components/mcp-manager-agent.test.tsx \
  tests/unit/components/agent-assets-workspace.test.tsx
pnpm --filter @prompthub/desktop exec vitest run --project unit \
  tests/unit/main/mcp-library-codex-sync.test.ts \
  tests/unit/main/mcp-library-persistence-targets.test.ts \
  tests/unit/main/mcp-native-roundtrip.test.ts
pnpm --filter @prompthub/core exec vitest run tests/canonical-mcp-library.test.ts
```

新增集成验收覆盖：原生大小写/标点名称同时存在时的扫描、选中导入、编辑重开、原位
分发和精确移除；实际 preload/IPC 文件路径导入、粘贴去重、脱敏预览、全局和带空格
项目路径部署、stdio 环境变量导入、Google/OAuth 字段保存、独立目标同步、外部禁用
产生冲突、显式覆盖、PromptHub 禁用跳过、重开和两种移除入口；绑定持久化失败后
目标字节回滚、库不变和幂等重试。失败注入只替换持久化故障点。原生 `agy` 用例改用
全局 `issue-220-Remote.Docs` 名称，验证真实 list、disable、移除后的读回。

先前 CLI 验收中的项目加载差距：本机 `agy 1.2.7` 的 `mcp list` 在项目 cwd 下仍只列全局
条目，未列出已写入 `.agents/mcp_config.json` 的 `Workspace.Docs`。该探测实际失败，
不能视为原生项目验收通过。[官方 MCP 文档](https://antigravity.google/docs/mcp)
声明项目路径，但 CLI reference 描述的是交互 `/mcp` 管理器；当前非交互命令没有
scope 参数。保留官方项目路径，不把项目条目复制进全局以掩盖此差距。项目文件的
PromptHub 写入、同步与移除由真实 IPC 集成覆盖；后续桌面交互验收已补齐，见下节。

升级不自动改名旧记录，因为无法从已归一化名称恢复原始身份；应从原始配置恢复并
核对已有绑定。回退会重新归一化 imported 名称，回退前备份库与目标配置并审查名称。
此批集成与 CLI 验收不包含 Electron GUI、Windows IDE 2.16.0、远程握手、模型调用或 OAuth 登录；
健康检查只检查配置和运行时前提，不表示已连接 MCP。

本批结果：6 项流程集成均通过（初次 4 项通过；补齐既有外部同名覆盖确认及重开后的
IPC 注册 fixture 后，定向重跑其余 2 项通过）；原生 CLI 1 项通过；桌面相关回归
93 + 39 项和 Core canonical 18 项通过，共 150 项。名称碰撞在修复前明确复现。
Core、Desktop 源码和测试类型检查通过；桌面 4 个测试文件 ESLint 通过；Core/Shared
两个源码文件通过使用同一 ESLint 配置、repository cwd 的 Node API 检查，无忽略、
错误或警告。6 个相关文件格式检查、文件大小和 diff 检查通过。所有本轮测试进程
已退出，临时 profile 已移除，无保留服务。新增集成由桌面 integration glob 及根级
desktop-integration harness 选择；原生 CLI 验证保留既有显式环境开关，不宣称默认
无 CLI 环境也执行了原生验收。

| 入口或步骤 | 本轮审查与证据 |
| --- | --- |
| 手动、文件选择、拖入、粘贴、源路径 | UI 源操作与 modal 均路由到既有 create/import API；path/file/paste、共享 normalizer 和通用导入回归执行通过 |
| MCP 工作台 / Agent 面板导入 | 两者共用 target request；工作台真实 renderer action + preload/IPC/storage 集成通过；面板组件回归通过，未操作真实 GUI |
| Plugin 子 MCP | 实际子资产导入 IPC 的 3 项回归通过，共用原生 parser |
| 表单编辑 / 预览 / 重开 | 遮罩保留真实凭据、原生 preview、名称与 OAuth canonical 重开通过 |
| 单条 / 批量分发，全局 / 项目 | 共享 apply 入口，native JSON、Google/OAuth/stdio/env、带空格项目路径的 IPC 文件读回通过 |
| 同步 / 外部冲突 / 禁用 | 安全目标独立更新、外部 disabled 冲突不改文件、显式覆盖、PromptHub disabled 跳过通过 |
| 按库记录 / 按 Agent 名称移除 | 精确名称移除和绑定清理通过；其他服务及配置保留 |
| 健康检查 / 原生消费 | 配置前提检查通过；真实 agy 全局 list/disable/remove 通过；后续桌面项目 stdio 加载和模型调用通过，远程连接与 OAuth 登录未验收 |
| 部分写入失败 | 真实目标替换后注入绑定持久化故障；目标字节回滚、库不变、重试仅一个绑定通过 |

## 桌面项目 MCP 加载与实际调用验收

2026-10-13，当前 Desktop 源码执行 `pnpm --filter @prompthub/desktop build`
通过后，以独立用户资料目录运行构建产物；开始时原生客户端为 macOS Antigravity
2.8.1，客户端更新后再补验实际安装的 2.23.0；模型为 Gemini 3.8 Flash Medium。
验收项目路径包含空格，未修改用户全局 MCP 配置。

| 实际界面步骤 | 可观察结果 |
| --- | --- |
| Project Skills → Add Project | 登记隔离项目，Project MCP 出现该项目的 Antigravity 目标 |
| New MCP → Paste config → Import config | 导入 stdio `Project.Acceptance`，保留大小写及标点；My MCP 显示 1 项 |
| Project MCP → Antigravity → Add MCP | 从 My MCP 选择并分发；页面显示 1 MCP / 1 managed，原生 `.agents/mcp_config.json` 读回 command、args、cwd 正确 |
| Antigravity → Create New Project → 选择相同目录 | 客户端直接启动探针，原生日志记录 initialize、notifications/initialized、tools/list；未复制到全局配置 |
| 在项目会话请求 MCP 工具并选择“allow this time” | 原生界面显示 `Project.Acceptance / project_acceptance_probe` 及 Tool Output；服务日志记录 tools/call，返回值与仅保存在项目文件中的随机标记一致 |
| 退出客户端、重开同一项目会话，再次调用 | 首个客户端及服务进程已退出；重开后出现第二个服务 PID，并读取新随机标记。两次 tools/call / call-result 均有日志，第二次没有复用会话中的旧结果 |
| PromptHub → Remove from Project → Uninstall | 页面归零，目标文件读回为 `{"mcpServers":{}}`；My MCP 记录保留，可重新分发 |
| 重新分发 → Antigravity 2.23.0 → 同一会话再次调用 | 实际安装版本重新 initialize/tools/list；第三个服务 PID 执行 tools/call，原生 Tool Output 与第三个新随机标记一致 |

首次立即请求得到“tool unavailable”，后续按服务器名称请求发现并调用工具成功。
首次与后续请求文本和时间不同，未隔离确认首次失败的原因，不把它归因于 PromptHub 或宣称
增加等待即可修复。完整加载、单次权限确认、工具执行及重开后的再次执行已实际观察。

客户端原有全局 `github` 服务同时显示缺失 `fetch-blob` 的 MCP Error；该错误未阻止
本次项目工具调用，未修改全局配置或第三方依赖缓存。临时 Electron 副本的 Helper
启动失败及直接入口导致的版本标识差异仅发生在验收启动方式；最终使用原始 Electron
运行当前构建、正确产品版本和独立资料目录，不修改产品升级保护。测试窗口启用控件
读取的时序已改为 app ready 后执行；临时窗口出现截图与控件树不同步，最终重新分发
及移除使用该验收启动器的 software rendering。未改产品启动参数，也不据此声明默认
GPU、签名安装包或 Windows GUI 通过。

本地证据位于 `output/playwright/antigravity-mcp-20261013/`：分发及移除截图、
`antigravity-tool-call.png`、`antigravity-2.23-tool-call.png`、对应控件记录、原生请求日志、
三次随机标记及 `receipt.json`。工具请求日志
保留 method/name/arguments，移除客户端注入的个人运行目录元数据。证据确认的是当前
macOS 桌面项目 stdio 主流程，不覆盖 Windows IDE 2.16.0、远程 SSE/HTTP 或 OAuth 登录。
本轮未新增业务源码、限制、重试或兼容分支，未提交、推送或修改远端 issue 状态。
最终再次通过界面移除 MCP；验收会话已归档，测试项目解绑临时文件夹。所有本轮启动
的客户端、Electron、语言服务与三个探针进程已退出，临时应用副本、资料目录和项目
文件已清理；保留本地证据及原生客户端中已归档的验收会话和无目录的测试项目记录。

## #220 configuration closure verification (2026-10-14)

The original request asks for the newer MCP configuration. The configuration
defects are fixed by `bd4ad7f3`; unrelated CLI Plugin registration, Windows
native execution and remote OAuth login are not evidence of missing JSON
configuration support and remain separate unverified boundaries.

The isolated reproduction script now preserves the test's repository-relative
layout and copies its real SQLite helper. It again proves two failures against
the pre-fix importer (`0ad39c27bfcb600cb239268be0628451d78c28e2`) and two against
the legacy native projection: empty import and lost native authentication/tool
options, respectively. It removes the temporary copy on completion.

Added a regression that closes and reopens the actual SQLite connection before
checking stable identity, native options, credentials and redacted transport.
This is stronger than reconstructing only the service with the same connection.
No production source change or storage migration was needed.

Current isolated verification:

- Desktop `vitest run --project unit tests/unit/main/mcp-antigravity.test.ts
  --minWorkers=1 --maxWorkers=1`: 9 passed.
- Desktop `vitest run --project integration
  tests/integration/antigravity-mcp-agent-import.test.tsx --minWorkers=1
  --maxWorkers=1`: 7 passed, including real preload/registered handlers,
  filesystem/SQLite, reopen and rollback. Electron OS encryption is substituted
  with an isolated AES-GCM test boundary; native OAuth is not exercised.
- Desktop `tsx tests/helpers/reproduce-antigravity-mcp-regression.mts
  0ad39c27bfcb600cb239268be0628451d78c28e2`: both expected red checks passed.

This closes the configuration request locally, not a release, Windows native
execution or full Antigravity feature acceptance. The earlier native GUI
evidence above is historical and was not repeated in this cycle.

## GitHub issues (historical 2026-10-13 snapshot)

本轮读取 PromptHub 全部 200 个 issue（open + closed），不是仅按标题搜索；#220/#226 当前均 open，评论均为空。检索正文明确提到 Antigravity 的当前 open 报告只有这两条。

| 仓库 / issue | 当前状态 | 关联 |
| --- | --- | --- |
| PromptHub [#220](https://github.com/legeling/PromptHub/issues/220) | open | 新版 MCP，现已能路由到上表的导入、原生认证字段和验收缺口 |
| PromptHub [#226](https://github.com/legeling/PromptHub/issues/226) | open / local in_progress | IDE 原生路径、软链及旧兼容性刷新已本地验证；Windows 原生加载/发布验收待完成 |
| PromptHub [#197](https://github.com/legeling/PromptHub/issues/197) | open | 各 Agent Rules 目录来源矩阵，是 Antigravity scoped Rules 的实施入口 |
| PromptHub [#212](https://github.com/legeling/PromptHub/issues/212) | open | Instructions 与 Scoped Rules 的产品/数据模型设计；不是要求立即重命名全部存量规则 |
| PromptHub [#190](https://github.com/legeling/PromptHub/issues/190) | open | 多 native manifests 与本地格式能力记录，关联旧库兼容性刷新 |
| PromptHub [#203](https://github.com/legeling/PromptHub/issues/203) | open | 配置备份与适配文件所有权，关联恢复/清理，不应散落新 sidecar |
| PromptHub [#103](https://github.com/legeling/PromptHub/issues/103)、[#165](https://github.com/legeling/PromptHub/issues/165) | closed | 历史 Skill 支持与大型 Skill 仓库导入，不能据此声明当前 CLI 全量适配完成 |
| google-antigravity/antigravity-cli [#390](https://github.com/google-antigravity/antigravity-cli/issues/390) | open | 原生 Plugin MCP 中路径占位符未展开的上游报告 |
| google-antigravity/antigravity-cli [#784](https://github.com/google-antigravity/antigravity-cli/issues/784)、[#998](https://github.com/google-antigravity/antigravity-cli/issues/998) | open | 远程 MCP 初始化与 SSE endpoint 的上游报告；均有特定版本背景，未确认影响所有新版 |

上游 bug 不是采用旧字段、写双格式或叠加重试的依据；先用合法配置和固定版本确认归属。未发评论、创建或关闭远端 issue。

## 时效与实施顺序

最新打开的 [Workflows 页面](https://antigravity.google/docs/ide/workflows/) 和 [迁移指南](https://antigravity.google/docs/migration/workflows-to-skills/) 都明确写明 2026-10-19 停止旧 Workflow 行为。搜索缓存仍有 2026-11-01 的旧文本，不能按缓存日期安排验收。

建议顺序：OAuth 脱敏和原生选项保全 → 三入口导入统一 → 客户端路径/识别与 Plugin 软链/旧元数据 → Rules 来源矩阵 → 原生 CLI/IDE/Windows 验收。独立 Subagents/Hooks 管理和 Workflow 转换按增量功能评估。历史 Skill 链接迁移复用现有 [记录](ISS-20260928-001-skill-platform-management.md)；未安装额度查询保护复用 [已有问题记录](ISS-20260825-003-agent-usage-undetected-side-effect.md)，不重建并行所有者。
