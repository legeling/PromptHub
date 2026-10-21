# Skill / MCP / Plugin 公共资源架构

状态：2026-10-17 用户确认统一公共契约、通过多态保留领域差异；范围已扩展至 CLI、自托管 Web 与 Cloudflare 的 0.6.0 能力对齐，实现待收敛。
本文是三类资源公共管理语义、模块边界和验收的权威主题。领域特有要求继续由
[Skills](../behavior/skills.md)、[Plugins](../behavior/plugins.md) 和
[MCP](../../changes/active/mcp-version-history-and-projection-safety/specs/mcp/spec.md) 定义。
存储权威与迁移遵循 [Foundation](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md)，不另建存储体系。

## 目标与边界

Skill、MCP、Plugin 共用资源管理接口、控制流程和可见交互，通过类型适配器实现差异。
采用按能力拆分的接口多态与组合；不要求三种实体继承包含全部功能的大父类。
公共抽象应消除三处重复的状态计算、加载、分页、分发反馈和错误处理。

- 共同能力：身份与展示摘要、来源、查询筛选、收藏与标签、版本入口、导入、分发和删除结果。
- Skill：完整目录包，保留 SKILL.md、文件库存、指纹、复制／链接及外部目录绑定语义。
- MCP：服务定义、凭据引用、配置投影和健康检查；不能用文件复制代替配置合并。
- Plugin：原生包及子资产库存；子 Skill/MCP 继续调用各自领域服务，安装不自动授权连接器或启动子服务。
- 能力缺失通过明确的支持状态及原因表达。公共层不得伪造领域能力，也不通过大量可选字段混合三种持久化实体。

### 0.6.0 各端职责

- Desktop 与 CLI：本机资源管理、来源获取、包安装、扫描与 Agent 分发共用 Core
  业务合同。CLI 缺失的对应能力纳入本次范围，不能以已有命令调用 Core 为全能力对齐依据。
- 自托管 Web 与 Cloudflare：保存、管理及同步 Skill、MCP、Plugin 资源，并按
  运行环境提供受支持的读取、编辑、版本与导入导出能力。两种 Web 均不提供
  Agent 分发，不扫描服务器或浏览器用户的 Agent 目录，不为分发接入服务器
  SSH 凭据、共享目录或本地客户端连接器。
- Web 的资源文件操作仅针对当前用户有权访问的托管资源包，不暴露任意服务器
  路径读写。Skill 的保存及同步保留完整包，MCP 保存配置定义但不启动服务。
- 云端采用适配运行时的存储与运输；不可支持的能力应在接口和界面明确表达，
  不能显示可用按钮后才返回 501，也不能用空结果或成功响应掩盖缺失实现。
- CLI、自托管 Web、Cloudflare 包版本以各自 `package.json` 为准；版本字段不代表功能已对齐、
  已验收或已发布。此次范围不扩展 Prompt、Rules 或 Agent 会话等其他业务。

## 公共契约

### 资源摘要与来源

公共摘要以资源类型和稳定 ID 定位，不以名称或平台显示名作为统一身份。
收藏、标签、版本、来源与展示字段由领域适配器映射，列表、详情、侧栏和操作结果使用一致的派生入口。
来源分别表达发现渠道（商店名称）与上游定位（仓库、URL 或本地目录）；
Git 是获取方式之一，不能把“商店来源”替换为含义不清的“软件包”。
原始领域字段和历史 ID 保持兼容，不为展示一致而改写持久化身份。

### 加载、缓存与错误

本地资源列表、商店目录、目标扫描和主动健康检查分别加载。
本地库可用时立即展示，不等待远程商店或平台检测；同一请求去重，旧请求不能覆盖新的选择或刷新结果。
商店缓存保留来源／查询身份、完整性、成功获取时间和刷新状态；缓存命中先展示，失败保留上次成功结果。
远程目录、目标状态等缓存均可重建，不成为业务数据权威；刷新失败不得清空为零或宣称已是最新。
沿用已有持久化缓存和 Core 来源配置，明确失效与重开规则，不额外复制业务状态。

公共错误结果包含稳定错误码、操作阶段、可重试性和脱敏诊断；界面按 i18n 显示可理解的原因与恢复操作。
GitHub 认证／限流、Git／SSH、代理连接、超时、包校验、文件写入和目标冲突要能区分。
复用现有 Token、代理与本机 SSH 配置，遵守凭据作用域；日志与通知不泄露密钥。
失败必须对调用方可观察，不能仅记录 console 日志后把操作当成功。

### 分发状态与操作

分发存在状态与内容同步状态是两个维度，不能合并为一个 installed 布尔值：

- 分发存在状态表达未检查、检查中、已分发、未分发、失效和检查失败，保留最近成功观察时间。
- 内容同步状态表达一致、待同步、内容冲突或尚未核验。目标保留旧副本或被外部修改时仍计入“已分发”，另显示待同步／冲突；不会因为不是最新版本就转入“待分发”。
- 同步判断复用领域指纹、安装基准和配置语义；没有足够基准时标记尚未核验，不能仅凭内容不等就断言外部修改。

已有分发记录是核验线索；目标检查未完成或失败不能直接映射为“未分发”。
每种资源使用自身验证器确认目标实际状态：Skill 检查包／链接，MCP 检查对应配置条目，Plugin 检查其目标所需的包或原生注册状态。
目标暂不可访问时保留上次结果并标明陈旧／失败，只有成功观察才可确定失效。
新资源尚未扫描时不归入“未分发”；已分发／待分发计数以已知结果计算，并显示尚未核验的状态，不用总数减已分发数掩盖未知项。
首次展示采用有界、只读的状态检查。完整包内容比对独立执行并复用现有基准／缓存，不在每次列表渲染、每个平台逐项重复遍历整个包。

列表图标、筛选、计数、详情和分发弹窗共享同一状态快照及失效机制。
用户勾选的期望目标、实际已安装目标、待执行差异分别建模。
“应用变更”只执行期望目标与实际安装目标的差异；无差异时禁用并明确显示“无待应用变更”。
已安装目标使用独立“重新分发”入口，写入当前库中内容；不能要求先卸载再安装，也不能借重新分发改选其他目标。
重新分发继续使用领域已有的所有权、冲突检查和备份／恢复合同；发现外部修改或未知所有者时展示冲突并要求明确处理，不能将普通勾选视为静默覆盖授权。
安装、更新、移除后更新受影响资源，不能依靠切页或全量重扫纠正界面。
批量结果逐项表达成功、失败和未执行；保留已经成功的目标，重试不会重复破坏成功项。

平台身份复用 Agent 定义和现有路径解析器；历史 target ID 在边界映射并保持兼容。
平台可见性、能力支持、实际安装状态分别判断；共享目录保留高级目标语义，不参与普通平台全选。

### 公共界面

三类资源共用列表／卡片骨架、筛选栏、列数选择、分页、批量操作及状态反馈。
相同模式下使用同一套尺寸、间距、列数选项和分页策略；差异通过领域内容插槽及能力声明表达。
同一操作区使用一致的纯图标或图标加短文字形式；纯图标提供可访问名称和提示。
平台图标数量增加不撑高卡片；长文本、窄窗口及弹窗滚动不得覆盖固定操作区。
复用 GalleryColumnSelect、gallery-layout、Modal、PlatformIcon 等已有组件，支持主题和全部语言。

## 修改范围与实施批次

以下为已确认的实施范围；路径是负责层，当前完成情况见本文末尾。

| 批次 | 负责层与主要落点 | 交付边界 |
| --- | --- | --- |
| 1. 契约与状态 | `packages/shared/types`；三类 renderer Store、selector 和分发模型 | 资源摘要、能力、错误与操作结果；一致的分发快照、身份映射及计数 |
| 2. 加载与商店 | 三类 Store、renderer 远程源服务；Core marketplace 与 Desktop 网络适配器 | 独立加载、请求去重、缓存恢复与失效、错误反馈；保留各商店解析器 |
| 3. 界面复用 | `apps/desktop/src/renderer/components/{ui,skill,mcp,plugin,layout}` | 公共工具栏、列表／卡片、分页、批量及弹窗框架；详情保留类型内容 |
| 4. 生命周期与 CLI | `packages/core/src/skills`、`mcp-library`、`plugin-library`；Desktop services/IPC/preload；Core CLI | 共用命令流程及安装／分发能力接口；补齐 CLI 对应的来源、安装、分发与错误处理能力；保留既有原生适配器 |
| 5. Web 与 Cloudflare | `apps/web` 路由、服务、desktop bridge；`apps/web-cloudflare` 路由与存储；Shared 运行时契约 | 保存、管理、同步三类资源；运行时能力准确映射到界面；托管包完整性、用户隔离及错误处理；两种 Web 均无 Agent 分发 |
| 6. 验收与兼容 | Shared/Core/Desktop/CLI/Web/Worker 测试与既有 release harness | 三类公共契约测试、真实存储与失败恢复、跨入口一致性、租户隔离和界面验收 |

优先以三个 My Library 页面验证公共接口，再让详情、侧栏、分发弹窗消费同一状态。
无需合并三个完整 Store 为一个巨型 Store；每个 Store 通过公共控制流程和领域适配器协作。
CLI 的 Git/SSH、认证、代理、下载回退及结构化错误需与 Desktop 对应能力对齐，
扩展来源格式与必要参数时保持现有命令兼容。Web MCP/Plugin 的资源保存、管理及
同步入口纳入范围；不得因此引入服务端 Agent 分发。
不扩展 Prompt、Rules、Agent 会话等模块，不新增商店、目标平台或连接器授权机制。

### 页面与模块触达边界

| 入口 | 本次修改深度 | 保留边界 |
| --- | --- | --- |
| 我的 Skill / MCP / Plugin | 工具栏、筛选、计数、卡片／列表、分页、批量、来源与错误状态共用 | 类型特有字段和动作通过能力适配；保留已有收藏、标签及视图偏好 |
| 详情与两处分发入口 | 共用状态快照、操作结果、分发选择、无差异提示、重新分发和弹窗布局 | 预览、源码／配置编辑器、文件树、版本算法与 Plugin 子资产流程不全面重写 |
| 商店 | 加载隔离、缓存、刷新、错误、来源及导入结果统一 | 保留既有目录解析、搜索／分页协议和发现来源；不重做商店设计 |
| Agent / 项目资源与侧栏 | 消费同一资源摘要、目标状态和可见性；必要的调用适配与回归 | 不新增扫描范围、项目功能或原生 Agent 集成 |
| 设置 | 复用现有 Token、代理、平台路径和可见性设置 | 不新建认证系统、密钥库或设置页面 |
| CLI | 对齐三类资源对应的本机管理能力，复用 Core 并补齐命令入口 | 现有命令、输出与退出码兼容；不扩展其他业务模块 |
| 自托管 Web / Cloudflare | 三类资源保存、管理与同步，托管包和运行时能力适配 | 无 Agent 分发、任意服务器文件操作或本地客户端连接器；保留用户隔离 |
| 数据与其他产品 | 优先复用既有 DB/file 提交与同步／备份格式；新增持久化合同先补存储设计及兼容测试 | 不因跨端对齐隐式改写数据权威，不扩展其他资源模块 |

列数／分页选项可统一，但已有有效选择必须保留或通过明确的兼容映射恢复，不能在升级时无提示地重置用户偏好。
公共服务按查询、来源、分发、版本等实际共享能力拆接口；领域特有健康检查、授权和原生注册不强行纳入所有资源的必选方法。

### 范围确认记录（2026-10-17）

- 已确认：CLI 与 Desktop 对应能力同步至 0.6.0，补齐 CLI 能力；替代此前“CLI 新能力另做”的范围。
- 已确认：自托管 Web 与 Cloudflare 都纳入，云端提供运行环境支持的能力。
- 已确认：服务器只保存、管理及同步 Skill、MCP 等资源；两种 Web 均不提供 Agent 分发。此前提出的服务器 Agent 分发和服务器 SSH 权限选项不适用。
- 已确认：“应用变更”处理差异，另设“重新分发”入口。
- 已确认：旧副本／外部修改仍计入已分发，另标待同步／内容冲突。
- 差异应用与重新分发、内容状态与分发存在状态的既有决定继续有效，适用于 Desktop/CLI。
- 本文已授权范围内的命令补齐和等价适配不重复确认；如果发现必须改变数据权威、租户权限、凭据作用域或冲突覆盖策略，应先列出具体设计与影响，未确认的安全边界不擅自扩大。

## 数据、兼容与恢复

平台副本的内容基准沿用 `.prompthub-platform-activations.json` 的每个激活记录，
增加可选 `installedFingerprint` 与 `sourcePath`，不新增独立数据库或第二份副本索引。
旧记录继续用于存在状态；缺少基准时仅在目标与当前来源完全一致后建立基准，
内容不一致则保持“待核验”并拒绝静默覆盖。普通复制目标先比较上次写入基准，
外部修改拒绝重新分发及移除。软链接仅移除已知来源的链接，不删除其源目录。
详细内容检查与列表存在检查分开；后者不遍历包内容。读取损坏或不可访问的状态
返回错误，不把错误当空结果。现有记录仍可由旧代码读取，回退不删除新增字段。

Plugin 分发沿用目标目录发布，复制包内新增保留文件 `.prompthub-plugin-target.json`，
记录来源 ID、来源包摘要和已发布副本摘要。软链接通过已知来源验证所有权。
旧目标没有记录时仅接受与当前来源一致的包；无法核验的目标拒绝覆盖或移除。
副本外部修改保持已分发，另报冲突；同一目标通过旁路 staging/backup 替换，
单目标失败恢复原包，多目标失败返回成功目标及失败原因，成功状态立即持久化。
该记录不是资源库或同步权威，旧客户端忽略它；原始包不得使用此保留文件名。

公共资源抽象本身不要求万能 JSON 表或重建存储。Web 新增资源管理入口需先核对
既有存储与同步能力，涉及新表、目录、HTTP 合同或迁移时在对应领域记录具体差异、
用户隔离、兼容读取和失败恢复，不把此前仅做兼容验证的“无存储变化”当作已验事实。
SQLite 继续持有领域元数据与设置，实际包及历史内容继续由文件系统持有。
现有 IPC、CLI 参数、平台别名、来源身份与数据路径先保留，通过边界适配渐进替换内部实现。
公共层不得直接读写其他领域的私有 Store、原始数据库表或用户目录。

若实施中确需改变序列化契约或缓存形状，先补充对应领域的兼容读取、失效与降级方案；
持久化变更仍由 Foundation 和存储规则管理，不由 UI 重构隐式触发。
包与配置提交继续复用已有事务、staging、收据与恢复机制；失败保留原数据或返回明确的部分成功结果。
无存储变更的批次应可独立回退代码；涉及历史迁移的回退沿用既有完整备份恢复合同。

## 验收与当前差距

### 2026-10-18 跨端 Skill 实施批次

Skill 平台安装流程从 Desktop 的混合模块移至 Core `skills/platform-service`；
Desktop 与 CLI 注入各自已解析的平台目录，复制、软链接及回退、安装身份记录、
状态核验与移除使用相同操作。Cherry Studio 的 SQLite 注册及双目录原子发布也归
Core，Desktop 仅保留设置路径适配。原生平台支持矩阵不因 CLI 对齐而扩大。
工厂函数保留原有独立操作函数的闭包，长度超过普通函数 50 行约束：它只组装同一
平台边界及依赖，不包含单个长业务流程；回归覆盖 Desktop 平台/Cherry 测试及 CLI
真实完整包分发、重开、模式和移除。后续按责任提取辅助模块，不按行数切分流程。
CLI `skill redistribute` 只接受已安装目标，`--mode copy|symlink` 与桌面一致；
`platform-status --details` 返回真实模式。GUI 验收仍由用户执行。

Web MCP/Plugin 管理继续使用认证用户现有 `mcpLibrary`、`pluginLibrary`、
`pluginPackages` 与 `agentAssetFiles` 同步载荷，自托管沿用用户独立 JSON 原子替换，
Worker 沿用 D1 快照 CAS。不新增表或服务器 Agent 工作区。新增
`GET/POST /api/resource-libraries/:kind`，写请求必须携带读取时的内容 revision；
陈旧写入返回 409，资源不存在返回 404，失败保留原快照。Plugin 修改同步更新
portable bundle 的当前元数据、清单摘要，历史和包字节不变；删除清理对应包及历史。
MCP 顶层定义沿用现有恢复顺序，在恢复存储快照后应用；凭据继续归本机设备密钥库，
Web 接受环境引用及脱敏占位，不建立明文服务器凭据库，也不执行配置里的命令。
损坏的用户资源文件必须报错，不允许以空库覆盖。回退代码仍能读取既有同步格式。
接口已通过真实 HTTP、用户隔离与持久化恢复回归；具体边界见下文验证记录。

- CLI 与 Desktop Git clone 进程边界移入 Core；CLI 接受 GitHub tree 子目录、
  SCP SSH URL、`--branch` 和 `--directory`，选择后仍安装完整目录包。
- 两种 Web 新增 `GET/PUT /api/skills/:id/files`，PUT 接收 `{ files }` 完整快照，
  请求体上限 1 MiB；沿用共享包数量、字节、路径及编码限制，拒绝排除文件、
  大小写冲突路径和缺失入口。无需表或目录迁移，不接受任意服务器路径。
- 自托管沿用 Core 托管目录、SQLite 与 publication 恢复收据；Cloudflare
  沿用用户 D1 快照与已有 CAS 提交，不建立第二份包索引。失败不得覆盖原包；
  已存在的同步格式与二进制编码保持兼容，回退代码不会删除已保存快照。
- Cloudflare Skill CRUD 与版本接口纳入本批次，HTTP 校验从自托管路由提取到
  Shared；两种部署共用字段限制，存储适配器维持各自权限和事务边界。
- Cloudflare 的资源操作限定于认证用户的已有 D1 快照；同步载荷中的 Desktop
  owner ID 不用作服务器租户 ID。共享资源的写入仍要求管理员，不增加跨租户可见性。
- 整包保存及版本恢复复用 Core 快照 publication，保留托管包已有 `.prompthub`
  注释目录；输入包不得覆盖该目录。外部直连包不通过托管替换入口写入。
- Web 文件编辑器及完整包上传已接通；不启用 Web 分发或服务器扫描。GUI 未执行。
- 两种部署通过认证后的 `GET /api/runtime` 返回实际部署类型和受支持能力；
  Web 工作区在读取成功前不挂载资源界面，失败显示错误并允许重试。
  不新增持久化状态，不依据版本号或浏览器平台推断支持状态。
  Agent 分发始终关闭；Cloudflare 不展示未实现的 Agent 管理和 Skill 扫描，
  两种 Web 的完整 Git 导入尚未接通，暂不展示该入口。
- SKILL.md / JSON 序列化及 ZIP 打包统一到 Core 的可移植导出模块。
  Web 读取认证资源及整包快照后在浏览器打包，不读取服务器任意路径；ZIP 保留
  附属文本与二进制文件。原始文件保存仍由各端适配器负责，浏览器只报告开始下载。

验证（Windows / Node 24）：CLI 两文件 17 项、Core 三文件 20 项、Desktop 请求
生命周期 5 项与 Git clone 筛选 14 项、自托管 Web 四文件 35 项、Cloudflare 两文件
3 项通过，共 94 个不同用例。CLI、Web 客户端及服务器生产构建通过；Desktop、Core、Shared、CLI、
Web、Worker 类型检查通过，相关 app 文件 lint 与全仓文件行数门禁通过。Git clone 筛选跳过的 69 项
不计入通过数。CLI Git 来源用例替换远端 checkout；Core Git 进程用例实际创建、
提交和 clone 临时本地仓库，不证明 GitHub 网络或真实 SSH 凭据可用。
Web 用真实 HTTP 入口及 SQLite / 包文件验证保存、版本、跨用户拒绝、SQL 提交失败
恢复和关闭重开；Worker 用本地 Wrangler D1 验证保存、编辑、版本、重启、删除及租户
隔离，未部署云端。连续 HTTP 生命周期测试保留单个顺序用例以展示完整前后状态，
其长度超过普通 helper 的 50 行上限，夹具、请求和断言辅助函数仍分离。

本批次完成情况和剩余范围以以下差距表及实际验证记录为准，不代表 0.6.0 全量验收。

部署能力补充验证：Web 工作区与能力断言 4 项、Desktop runtime 与扫描设置
9 项通过；两种部署的真实 HTTP 生命周期用例同时检查 `/api/runtime`。
Web 客户端／服务器重建及 Desktop / Worker 类型检查通过。Web 启动测试替换
HTTP 运输及 Desktop 根组件，只证明启动边界和重试，不代表真实 GUI 已验收。
导出补充验证：Core 2 项、Web bridge 15 项、Desktop 导出／保存／提示 14 项及
CLI Skill 14 项通过（其中 bridge 与 CLI 已有用例与前述统计重叠）。ZIP 用例
实际解压并核对文本及二进制内容；Web 请求被替换，浏览器下载完成状态未验证。

以下均为实施验收目标，不能以静态检查或 mock 调用次数代替：

1. 三类适配器复用同一组公共契约用例：查询、筛选、计数、收藏／标签、选择和分页行为一致。
2. 缓存成功后真实重开；离线或刷新失败仍能展示已获取目录、明确错误并重试。慢目标扫描不阻断本地列表。
3. 未检查、空结果和失败可区分；外部删除目标、目标暂不可访问、操作后返回列表，图标／计数／详情同步。
4. 分发勾选后准确显示差异；无差异时“应用变更”禁用且原因明确，“重新分发”仍有独立入口；旧副本仍计入已分发并显示待同步，外部修改显示冲突且不自动覆盖；部分失败及重试不会误报或破坏成功目标。
5. 使用真实临时 SQLite、包文件和目标配置验证导入、更新、分发、移除、重开及失败恢复；凭据和未知原生配置保留。
6. Desktop preload/IPC 与 CLI 对应能力调用同一 Core 合同；验证 CLI 新增来源与参数、完整包、Git／SSH、认证／代理错误、分发和失败恢复，保留旧命令兼容。替换网络运输的测试标明边界。
7. 实际界面验证三页、列表／卡片、长内容与多图标、两处分发入口、窄窗口和主题；GUI 授权按测试规则执行。
8. 自托管 Web 与 Cloudflare 经真实 HTTP 入口验证受支持的资源保存、读取、修改、重开、版本和同步往返；包文件及二进制保全、跨用户访问拒绝。运行时不支持的操作明确拒绝且 UI 不宣传支持；两种 Web 均不呈现 Agent 分发。

### 跨端实施状态（2026-10-18）

| 边界 | 当前实现 |
| --- | --- |
| 资源列表 | Shared 统一筛选、计数、分页和观察状态；Desktop 共用视图切换、列数、分页及卡片／行外壳。领域内容保留插槽。未检查和失败不计为未分发。 |
| 加载与商店 | 本地库、商店、目标扫描及主动健康检查分别加载；同类请求合并，旧请求失效。刷新失败保留原目录和最近成功状态并显示错误。 |
| Skill Desktop / CLI | Core 共用 Git/SSH 来源、tree 子目录、分支、Token、代理、HTTP 归档回退及错误分类；完整包复制／链接、来源更新、版本和 ZIP 导出走同一合同。 |
| Plugin Desktop / CLI | Core 共用完整包管理、来源更新、元数据、版本、目标状态、分发和移除；CLI 增加独立重新分发和子 MCP 导入。子 Skill 可用已有完整目录导入命令。 |
| 分发反馈 | 应用变更与重新分发分开；副本内容基准判断待同步／冲突，外部修改拒绝静默覆盖。Plugin 逐目标返回成功与失败，CLI 部分失败退出码为 4，UI 刷新已成功结果并显示错误。 |
| 自托管 Web / Cloudflare | Skill 整包上传、读写、导出与版本；MCP 定义管理；Plugin 整包备份导入导出、元数据、历史及回滚；复用现有用户快照和同步格式。 |
| 运行时边界 | `/api/runtime` 控制 UI 能力；两种 Web 均无 Agent 分发、服务器扫描、SSH 或原生执行。完整 Git 导入不支持，入口隐藏。 |

Skill 激活记录与目标替换在同一调用范围提交，失败保留旧包；迁移旧名字目录也先核验所有权，
外部修改不会因改名清理而被删除。Plugin 使用逐目标 staging / backup 与所有权收据，
原生卸载不删除 Core 保留的来源目录和恢复备份。外部原生 CLI 的注册命令不是 SQLite
事务的一部分；失败会返回该目标错误，包恢复，重试重新核验原生注册，不宣称跨进程事务原子性。

平台服务的契约独立在 `skills/platform-types`，实现按激活状态、内容检查、目录事务、
原生适配拆分；没有新增通用资源表。Plugin 子 MCP 导入从 Desktop IPC 移到 Core，
Desktop 与 CLI 使用同一受限扫描和 MCP 导入入口，普通 UI 不执行配置命令。

验证状态以实际命令为准。新增与受影响功能已进行 Core、CLI、Desktop component/store、
真实 Web HTTP/SQLite 和本地 Wrangler D1 回归；组件测试替换运输，不等于 GUI 验收。
GUI 由用户查看；真实 GitHub/SSH 凭据及线上 Cloudflare 部署未执行。全仓 Windows 回归
仍包含路径格式、POSIX 专用夹具和存储恢复测试失败，不能将本批次功能验证称为完整发布通过。

### 最终定向验证（2026-10-18，Windows / Node 24）

以下结果不与前序运行重复相加；完整发布验收仍未通过。

| 检查 | 结果与实际边界 |
| --- | --- |
| 根级 quick 的静态子集 | 14 项通过：文档、CI、文件行数、六端类型及相关 app lint；明确排除 unit / integration / security，不代表完整 quick。 |
| Desktop 相关回归 | 20 文件、243 项通过，覆盖三类资源列表、状态 Store、两处分发入口、平台安装与 Plugin 版本/原生注册适配。组件替换运输，原生 CLI 被替换；未启动 GUI。 |
| Core 目标与恢复 | 6 文件、6 项通过，真实包字节及 SQLite 验证部分成功、重试、冲突保护、读取错误；Skill 改名额外验证旧目录外部修改拒绝、激活记录写入失败恢复、重试后清理旧名。激活写入失败使用故障注入。 |
| CLI 对齐 | 三个 parity 文件 8 项通过；其中 Plugin 子 MCP 导入在最终改动后单独复测 1 项通过。Agent 路径矩阵单独运行 6 项通过，包含完整包分发、重开及移除。Git 运输替换为受控输入，不验证公网凭据。 |
| Web / Worker | 自托管 6 文件 8 项通过；Worker 3 文件 5 项通过。实际 HTTP、临时 SQLite / 本地 Wrangler D1 覆盖完整包、版本、重开、租户隔离、并发修订及拒绝越界输入。 |
| 构建与包 | Desktop main/preload/renderer、CLI、Web client/server 构建通过；CLI `verify:package` 用打包后的 bin 和生产依赖实际验证 Agent 路径持久化、MCP 写入和移除。没有构建/签名桌面安装包，也未发布。 |

关键功能重跑入口（仓库根目录）：

```sh
pnpm --dir packages/core exec vitest run tests/plugin-distribution-workflow.test.ts tests/plugin-target-publication.test.ts tests/plugin-distribution-status.test.ts tests/mcp-target-observation.test.ts tests/skill-platform-recovery.test.ts tests/skill-platform-rename.test.ts
pnpm --dir apps/cli exec vitest run tests/skill-git-source-parity.test.ts tests/skill-distribution-parity.test.ts tests/plugin-management-parity.test.ts
pnpm --dir apps/cli exec vitest run tests/agent-root-distribution.test.ts
pnpm --dir apps/cli build
pnpm --dir apps/cli verify:package
pnpm --dir apps/web exec vitest run src/routes/resource-libraries.test.ts src/routes/plugin-package-library.test.ts src/routes/skill-package-files.test.ts src/client/desktop/resource-library.test.ts src/client/desktop/skill-files.test.ts src/client/pages/DesktopWorkspace.test.tsx
pnpm --dir apps/web-cloudflare exec vitest run src/resource-libraries.test.ts src/skill-library.test.ts src/skill-package-files.test.ts
```

Desktop 243 项的准确选集：

```sh
pnpm --dir apps/desktop exec vitest run tests/unit/main/plugin-library-validation-versions.test.ts tests/unit/main/skill-installer-remote-package.test.ts tests/unit/main/cherry-studio-skill-platform.test.ts tests/unit/main/plugin-library-distribution-import.test.ts tests/unit/main/plugin-native-installation.test.ts tests/unit/main/plugin-shared-distribution.test.ts tests/unit/components/plugin-manager-library.test.tsx tests/unit/components/mcp-manager-library.test.tsx tests/unit/stores/plugin.store.test.ts tests/unit/stores/mcp.store.test.ts tests/unit/components/plugin-agent-target-picker.test.tsx tests/unit/main/skill-installer-remote-git-package.test.ts tests/unit/stores/skill-distribution-status.test.ts tests/unit/components/plugin-manager-distribution.test.tsx tests/unit/components/skill-quick-install.test.tsx tests/unit/components/hosted-resource-manager.test.tsx tests/unit/components/mcp-manager-detail-distribution.test.tsx tests/unit/main/skill-installer-platform.test.ts tests/unit/main/plugin-child-mcp-import.test.ts tests/unit/components/skill-i18n-manager.test.tsx
```

扩大检查的限制：Core 全量运行有 1,134 项通过、27 项失败、15 项跳过；失败包含
Windows 路径分隔符、冒号目录、`mkfifo` 不可用及文件替换权限，记录为未通过，
未在干净基线上重跑证明全部属于既有缺陷。CLI 全量有 172 项通过、3 项失败，
并超过 75 秒总时限；其中路径断言及 Windows 子进程入口修正后定向通过，MCP
路径矩阵独立运行 23.6 秒通过。全量 CLI 的并行负载/时限问题仍未验证消除。
本批次未放宽总时限、删除失败用例或执行用户 GUI。

完整运行日志保存在任务临时目录 `prompthub-parity-final-20261018-0236`，其中
`quick-static-final.json`、`desktop-complete-files.json` 与各端日志保留准确命令选集和结果。

历史扫描与前序验证记录保留在本文上方；相关质量背景见
[质量记录](../../issues/active/quality.md)。
