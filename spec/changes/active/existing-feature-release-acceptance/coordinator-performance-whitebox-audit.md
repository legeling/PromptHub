# 现有功能性能与冗余操作白盒审计

日期：2026-10-10。范围：Desktop、Core、DB、CLI、self-hosted Web、Worker、Mobile。

## 结论与证据边界

确认 15 项操作成本或交互缺口，其中 8 项有隔离运行证据，7 项依据实际消费者与实现调用链确认。主要成本来自普通操作处理全量数据、批量拆成多个独立发布、列表读取附带写入、元数据修改复制包文件、局部修改触发整页加载，以及重复持久化。此前 Prompt 删除修复解决了重复提交和不变 bundle 的重复发布，但全图读取与校验仍在；不能把该修复视为全应用性能问题已解决。

本轮是审计交付，未修改产品源码、数据库布局或公共接口。审计完成不表示下列问题已经修复，也不表示发布、GUI 或原生平台验收通过。

机器扫描覆盖 `apps/*/src`、`packages/*/src` 中 1,131 个运行时 JS/TS 文件，排除测试、fixture 与发布验收辅助文件：Desktop 853、Core 137、DB 20、Web 87、Worker 9、Mobile 24、CLI 入口 1；CLI 实际工作流在 Core。扫描提取同步 I/O、全量读取/刷新、循环内调用、生命周期与完整 store 订阅候选，再人工追踪下表调用链。该数量不是逐行人工审阅数量，也不是缺陷数量。源码散列复核未发现扫描后的文件变化。

证据与探针源码保存在 [coordinator-performance-whitebox-results.json](coordinator-performance-whitebox-results.json)。测量使用临时 SQLite 和合成文件；renderer 探针使用真实 Zustand store 与真实差异计算函数，替换 IPC 边界。没有操作真实界面、删除真实记录、访问远端商店、调用付费模型或读取真实 Agent 凭据。

单次耗时样本用于显示执行成本与阻塞，不代表 p95、持续负载或用户当前机器窗口的端到端延迟。同步文件次数是探针捕获的对应方法调用，不是系统级完整 I/O 统计；SQL 计数是 `prepare` 次数，不等同于执行计划或实际写入行数。

## 确认问题

优先级：P1 表示直接放大常用操作成本或阻塞；P2 表示局部交互、较低频操作或其他发行面的改进。运行证据列中的“局部”不能替代真实远端、HTTP、Electron 或设备验收。

| ID | 优先级 | 问题与触发 | 证据 |
| --- | --- | --- | --- |
| WB-01 | P1 | 修改一个 Prompt 仍收集全部 Prompt/版本、读取旧图、全量散列与发布后校验 | Core 实测 |
| WB-02 | P1 | 批量收藏/移动/删除拆成逐项发布；目录移动再单独写所有排序，放大 WB-01 | Core 连续 8 次实测；renderer 调用链 |
| WB-03 | P1 | Rules 的缓存列表仍扫描、读正文/版本并写元数据和 DB 索引；工厂再次初始化 DB | Core Rules 实测；Desktop 调用链 |
| WB-04 | P1 | Skill 仅收藏也发布完整包并重建工作目录，复制所有包文件 | Core 实测 |
| WB-05 | P1 | Plugins 的 `load` 无论当前 tab，都会同时加载所有未缓存商店源，并等待全部完成 | renderer store 局部探针 |
| WB-06 | P1 | MCP 普通增删改重载整个库、商店配置、全部本地健康检查与目标配置 | 源码调用链 |
| WB-07 | P1 | Settings 一个动作经过多条写入路径；分开的输入事件各写完整设置快照 | renderer store 局部探针 |
| WB-08 | P2 | Skill 删除确认没有提交中保护，且忽略 store 返回的删除失败结果 | 源码调用链 |
| WB-09 | P1 | Web Prompt/Folder 普通修改重写整个 Prompt workspace，并重复查询版本 | Web 导出 helper 实测；服务调用链 |
| WB-10 | P2 | Web Skill 普通修改重写全库文件，还逐 Skill 过滤全部版本 | 源码调用链 |
| WB-11 | P2 | Skills/Rules 文本差异使用完整 LCS 矩阵，时间、空间均为平方级 | 实际差异函数实测 |
| WB-12 | P2 | 备份同时读取两遍 Prompt 列表，再按 Prompt 串行传输版本 | 源码调用链 |
| WB-13 | P2 | 目录后代遍历反复扫描全数组；排序和恢复匹配存在嵌套线性查找 | 源码调用链 |
| WB-14 | P2 | Worker 在线 CRUD 读取、解析并重写整个账户快照 | 源码调用链；既有 Foundation 合同 |
| WB-15 | P2 | Mobile 列表每次获得焦点查询全部正文，ScrollView 挂载全部行 | 源码调用链 |

### WB-01 / WB-02：Prompt 与目录操作

所有者：Core 命令与 Desktop 调用方。SQLite / filesystem 的目标权威合同由 `FR-FOUNDATION-003` 负责；当前 canonical-files 实现是既有迁移缺口。

- `packages/core/src/canonical-prompt-graph-db.ts:251` 的发布先收集图，再读取旧图、计算散列与对比，最后校验完整新图。已经跳过未改变 bundle 的重新发布，但仍需全图读取。
- `packages/core/src/prompt-canonical-export.ts:357` 对每个 Prompt 调用 `getVersions`，一次修改仍产生 N 个版本查询。
- `apps/desktop/src/renderer/components/layout/usePromptWorkspaceTreeActions.ts:181` 的批量操作逐 ID 调用单项命令；`apps/desktop/src/renderer/services/database.ts:93` 的批量移动以 `Promise.all` 发出单项 IPC，不能使主进程同步发布真正并行。
- `apps/desktop/src/renderer/stores/folder.store.ts:175` 先写移动目录 parent，再发送全部兄弟排序，包含移动项第二次更新及可能未改变的排序。

单次成本随全部记录、版本和正文增长，约 `O(N + V + B)`，规范排序还可能包含 `O(N log N)`；K 项批量约重复 K 次。应在命令所有者形成一次批量事务和一次发布，跳过未变化排序；后续按已确认 SQLite 权威合同收敛到受影响集合。不能直接删掉一致性校验或恢复日志。

验收：通过实际批量入口核对最终记录、版本和目录顺序；记录发布次数与读取量；覆盖部分失败、重开与恢复。单条和批量行为需要共同保持数据完整性。

### WB-03：Rules 缓存列表包含扫描与写入

- `packages/core/src/rules-workspace.ts:952` 的 `listCachedRuleDescriptors` 直接调用 `scanRuleDescriptors`。
- `materializeGlobalRule` 在已存在元数据时仍执行 `writeMeta` 与 `syncRuleIndex`（同文件 `:921`、`:839`），读取正文和历史，并 upsert 规则/替换版本索引。
- Core 与 Desktop 的 Rules 工厂分别在 `packages/core/src/rules-workspace-default.ts:16`、`apps/desktop/src/main/services/rules-workspace.ts:19` 调用 `initDatabase`。
- Core `database.ts:32` 会再次校验整个 Prompt catalog。Desktop 初始化包装没有这项 Prompt 全图校验；Skill/Rule 工作目录重建有 WeakSet 保护，不能声称每次初始化都完整重建所有包。

即使不存在任何平台目标文件，两次缓存列表读取各捕获到 21 次元数据文件写入。下表的耗时及 Prompt 查询计数只属于 Core 工厂，不是 Desktop GUI 时间。

改进边界：列表读取已有摘要；显式 scan 承担扫描、导入与索引更新。普通查询复用已初始化的 DB，不重进启动/迁移流程。需保留外部文件变动后的显式刷新、身份与历史一致性，并用真实 Rule 存储核对读取不写入。

### WB-04：Skill 注释修改复制完整包

`packages/core/src/canonical-skill-db.ts:61` 的所有普通更新均调用 `publishCanonicalSkill`，再调用 `hydrateCanonicalSkillWorkspace`。`canonical-skill-library.ts:85` 收集完整包，`:257` 重建工作目录并逐文件复制。仅修改 `is_favorite` 也走这条路径，成本随包文件数、文件字节及历史增长，而不是随修改字段增长。

实测单个含 128 个合成文件的 Skill，仅收藏一次，捕获 128 次工作目录 `copyFileSync`，耗时约 688 ms。不能用只剩 `SKILL.md` 的内容保存代替完整包；应区分结构化注释提交与包内容变更，沿用 Foundation 的数据所有权，保全 scripts/assets/历史和部署身份。验收需比较收藏前后的包清单、内容散列、工作目录和重开结果。

### WB-05 / WB-06：本地页面与整页刷新耦合

Plugins：`apps/desktop/src/renderer/components/plugin/usePluginManagerLifecycle.ts:30` 挂载时调用 `load`；`stores/plugin.store.ts:347` 加载本地库和目标清单，同时遍历全部未缓存商店源并等待它们。默认 tab 是 `market`，但设置为 `library` 后行为相同。探针中本地库已经返回，3 个商店调用尚未完成时全局 `isLoading` 仍为 true。

应按当前页面与选中商店源加载。已有远端缓存可复用，本地库就绪状态由本地读取拥有。需验证当前 tab 的调用范围、商店失败/未完成时本地可用性；实际网络和页面交互尚未测量。

MCP：`stores/mcp.store.ts:249` 的 workspace snapshot 同时调用 library、market、sources、全部健康检查；`:412` 再强制加载目标清单，并调用 `replaceMarketSources`。创建、修改、删除等普通动作（`:591` 起）均再次 `load`。Core `mcp-library.ts:577` 的健康检查是本地配置诊断，不是联网握手或启动 MCP 进程；读取同一库及遍历目标配置仍形成重复 I/O。

应使用已返回的变更实体更新列表，并按部署影响失效目标状态；显式刷新仍读取 filesystem 部署事实。不能删掉实际部署状态核对。验收覆盖单条修改后的列表、详情、健康状态、目标状态与刷新/重开。

### WB-07：Settings 重复持久化与高频快照

`renderer/services/renderer-persistence.ts:107` 在设置 store 变化时抽取完整状态、序列化并提交 `replaceSettings`，microtask 只合并同一个同步回合。`stores/settings.store.ts:155` 的 Zustand persist 仍写 `prompthub-settings`；`skipHydration` 控制启动读取，不关闭写入。部分 action 同时直接调用主进程设置写入，例如 `settings/settings-general-actions.ts:365` 附近的 minimize-on-launch。

隔离探针的一次 minimize-on-launch 修改产生：1 次 `settings.set`、1 次完整 canonical snapshot、1 次旧 localStorage 写入。5 次分开的有效 opacity 输入产生 5 次完整 snapshot、5 次 localStorage 写入；并未证明这就是某个窗口的具体卡顿时间。Prompt 工作区偏好及 Agent 专属设置有排除规则，不能把所有 action 都归为同样三写。

机器还找到 17 处完整 store 订阅候选，主要为 Settings/MCP/Plugins；其真实重绘成本需要 profiler，不按候选数宣称新增缺陷。

改进边界：迁移完成后保留单一持久化所有者，明确局部设置的更新合同；连续 UI 预览与持久化提交分离，保存结果可观察。不能通过延迟后直接丢弃变更、额外计时缓存或多层队列解决。

### WB-08：Skill 删除缺少提交生命周期保护

`components/skill/SkillManager.tsx:1073` 的确认函数逐个 await 删除，在完成前未设置操作级 pending；`SkillDeleteConfirmDialog.tsx:125` 未传 loading/disabled。`stores/skill/skill-library-actions.ts:192` 返回 boolean，确认函数没有检查 false，随后关闭对话框并清除选择。

同一对话框在操作未完成时可能再次提交；失败反馈还可能被提前关闭遮蔽。本轮没有执行 GUI 删除，也没有证明 Skill 出现过双 toast。应沿用 Prompt 删除已经验证的 pending、结果判定与可重试生命周期，验收延迟响应下双提交、返回 false、抛错与失败后正常重试。

### WB-09 / WB-10：Web 全量 workspace 投影

Prompt：`apps/web/src/services/prompt-workspace.ts:680` 每次收集全部目录、Prompt、版本，先验证路径，再通过 `:367` 写全部正文和历史文件并替换整个目录。版本在验证和写入阶段各查询一次；`:593` 的列表先查 ID，再逐条 `getById`。Prompt/Folder 普通写入调用这一 helper。128 个 Prompt、各 2 版本，捕获到 256 个版本查询和 384 次文件写入。测量调用真实导出 helper，不含 HTTP、鉴权和路由总耗时。

Skill：`skill.service.ts:95` 的 workspace sync 被普通修改调用；`skill-workspace.ts:449` 重写全库，`:304` 逐 ID 查询，`:483` 对每个 Skill 过滤全部版本，形成 `O(S × V)` 匹配，再复制附加文件。未做 Web Skill 性能运行。

应先复用已收集的版本和按 ID 分组，消除双读/嵌套扫描；完整导入导出保留原子替换，普通操作按已确认所有权处理受影响集合。验收 HTTP 真实写入、所有者隔离、版本、附件、失败后的旧目录及重开。

### WB-11：差异计算为平方级矩阵

`components/skill/detail-utils.ts:621` 分配 `(旧行数 + 1) × (新行数 + 1)` 的 LCS 数组并完整填充。真实消费者包括 Skill 历史/更新审查、Rules 历史与冲突预览；`RulesManager.tsx:127` 的编辑差异也使用它。`useMemo` 不能减少一次计算的时间或矩阵内存。

2,000 × 2,000 行输入分配 4,004,001 个矩阵单元，单次实测约 94 ms；10,000 × 10,000 将需要 100,020,001 个单元，仅为算法推导，本轮未分配这么大的矩阵。应采用适合编辑差异的算法和简单的相等前后缀裁剪，保留空文本、重复行、增加/删除的结果语义。不能通过人为限制正常文件长度掩盖算法成本。

### WB-12 / WB-13：备份与嵌套查找

备份：`renderer/services/database-backup.ts:488` 的版本导出先调用 `getAllPrompts`，再逐条 await 版本 IPC；`:524` 同时再次获取 Prompt 列表。完整备份读取全部数据是必要行为，重复列表和 N 次串行跨进程传输才是可消除成本。应由已有备份/graph 所有者一次收集并传输；保留完整版本、导入前安全点、媒体与失败恢复。

目录：`stores/folder.store.ts:320`、`:345` 对每个后代递归扫描全部目录，最坏 `O(F × D)`；根目录有大量直接子目录时，即使深度有限仍可接近平方级。`:167` 对每个目录 `find` 排序更新，成本 `O(F × K)`。`services/self-hosted-sync.ts:506` 的凭据合并按每个 remote item 查找 local item，为 `O(R × L)`。这些可用现有 ID/parent Map 在一次扫描中解决，不改变循环防护、排序或本地凭据保全合同；尚未对真实大目录或恢复数据测量。

### WB-14 / WB-15：Worker 与 Mobile

Worker：`apps/web-cloudflare/src/web-data.ts:28` 的在线业务加载整个账户快照；`sync.ts:589` 解析整份 JSON，`:608` 规范化并全量序列化写回。列表分页发生在全量加载之后，CRUD 的字节成本随整个账户增长。现有 UPDATE 使用旧 payload 条件 CAS，不能声称无并发保护。该问题已经由 `FR-FOUNDATION-006` 要求在线 CRUD 不替换整个可变账户快照；应在原 Foundation 主题推进实体/并发合同，不能在本次审计中另造兼容存储。没有执行真实 D1 性能测试。

Mobile：`features/prompts/data/promptRepositoryCore.ts:71` 每次查询全部列和正文；`features/prompts/screens/PromptListScreen.tsx:42` 在 focus 重新加载，`:105` 全量 map；`components/AppScreen.tsx:26` 使用 ScrollView。数据传输与挂载随全库增长。需要摘要/分页与原生虚拟列表共同保持搜索、数量、选择和刷新行为；没有设备或原生帧率证据。

## 隔离测量

Prompt fixture：32/128/256 个 Prompt，各 2 个版本，合成正文。一次修改标题；另在 128 条数据上连续执行 8 次收藏单项命令。均使用实际 Core canonical 发布和磁盘 SQLite。

| 操作 | Prompt 数 | SQL prepare | 版本查询 prepare | 同步文件读取 | rename | 耗时 ms | 0 ms timer 延迟 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 单次更新 | 32 | 38 | 32 | 322 | 18 | 254.4 | 255.2 |
| 单次更新 | 128 | 134 | 128 | 1,282 | 18 | 233.0 | 236.1 |
| 连续 8 次更新 | 128 | 1,072 | 1,024 | 10,256 | 144 | 1,869.7 | 1,870.3 |
| 单次更新 | 256 | 262 | 256 | 2,562 | 18 | 332.0 | 332.5 |

32 与 128 条的时间存在冷/热缓存噪声，不能宣称时间严格线性；版本查询与文件调用数量的增长确定。8 次命令是 Core 级成本复现，未执行 renderer 批量按钮或 IPC 运输。

| 操作 | 关键捕获次数 | 耗时 ms | 边界 |
| --- | --- | ---: | --- |
| Core Rules 第一次缓存列表 | 128 个 Prompt 版本查询；513 同步读取；63 异步读取；21 异步写文件；65 个写 SQL prepare | 322.8 | descriptor 返回 0；所有平台目标均在临时目录 |
| Core Rules 第二次缓存列表 | 同上；仍再次 initDatabase | 330.0 | timer 延迟 64.8 ms；异步等待期间可让出事件循环 |
| Web Prompt 全量导出 | 386 SQL prepare；256 版本查询；384 writeFileSync | 67.3 | 128 Prompt × 2 版本；timer 延迟 67.5 ms |
| Skill 收藏，32 文件 | 32 copyFileSync；6 renameSync | 241.3 | 单个包；检查收藏值已持久化 |
| Skill 收藏，128 文件 | 128 copyFileSync；6 renameSync | 687.9 | 单个包；不是 Desktop IPC 或 GUI 延迟 |
| 文本差异，500 × 500 行 | 251,001 个矩阵单元 | 6.0 | 真实 renderer 函数；结果行数检查 |
| 文本差异，1,000 × 1,000 行 | 1,002,001 个矩阵单元 | 21.9 | 同上 |
| 文本差异，2,000 × 2,000 行 | 4,004,001 个矩阵单元 | 94.3 | 同上 |

renderer 局部探针共 3 个不同检查通过：Plugins tab 加载范围、Settings 持久化次数、文本差异。Settings 初次场景错误使用了超出 0–1 范围的 opacity 值，按现行规范改为 0.12–0.60 后仅复验该检查通过；前两项已通过的独立检查没有无理由重跑。探针验证协作和算法成本，不证明被替换的 IPC/远端功能。

## 未归为缺陷与待进一步证据

- 原子发布、路径验证、manifest 校验、CAS、迁移、安全备份和恢复日志有数据完整性目的，不能把所有同步 I/O 或全量快照都当冗余删除。
- Desktop Prompt/Skill 长列表已有虚拟化；互斥重量级视图、图谱模拟预算、按需加载及 Skill 导航隔离已有既定策略，不能从本轮扫描推断它们仍全部失效。
- 保存同步已有事件合并、in-flight/rerun 与卸载清理，不应再叠加第二套重试/并发策略。
- `hooks/useSmoothStream.ts` 虽有字符队列复制与逐帧循环，但未找到运行时消费者，不列为当前卡顿的有效调用链。
- Agent usage 的 main 缓存没有共用 in-flight promise，tray/面板可能并发查询同一 Agent。消费者存在，但未观察到实际重复远端请求，作为待复现候选，不计入 15 项确认问题；没有访问真实凭据或 quota 服务。
- 函数长度统计包含 React 组件、工厂和嵌套函数，不能单凭长度认定性能缺陷。本轮未开展无关拆分或新增依赖。

## 修复顺序与验收要求

1. **常用命令与读取。** WB-02 批量单命令、未变化排序消除；WB-03 缓存列表与显式扫描分离；WB-08 删除 pending/结果判定。先形成回归，再一批完成源码、测试与对应主题记录，统一检查。
2. **局部加载与持久化。** WB-05/06 当前页面与受影响状态读取；WB-07 按已确定持久化权威收敛。验证本地就绪、失败反馈、列表/详情/数量一致性及 reload/reopen，避免仅检查 mock 次数。
3. **共享存储投影。** WB-01/04/09/10 在既有 Foundation 合同下处理受影响集合。涉及布局/权威变化时先记录版本迁移、历史用户数据保全和恢复，不能用删除 projection/历史直接取得性能数字。
4. **算法及跨端。** WB-11/12/13 最短局部修复；Worker 与 Mobile 沿各自当前实体/分页/同步合同推进。每项使用代表性输入量、实际入口、耗时/调用数及适用失败恢复验收。

GUI 仍需在授权范围内单独测量点击至稳定帧、重复 toast、事件循环与 IPC 耗时；商店网络、Cloudflare D1、Mobile 设备及安装包验证尚未执行。上述静态与隔离数据证据不能覆盖这些边界。

## 检查与资源

本轮复用现有 pnpm/Node/Vitest/tsx 与依赖，无安装、新服务或额外端口。Core/Web/Skill 探针均关闭数据库并恢复 runtime/方法替换；renderer 使用测试内存 localStorage、临时 runtime 与 mock IPC。所有审计临时进程有记录，补充探针设置 60 秒父进程 deadline，均正常退出；初始有限探针正常退出，未保留后台任务。临时 fixture、探针与链接在证据保存后清理。

先前供用户试用的唯一 Desktop 开发实例继续保留，监听 `http://127.0.0.1:5173`，监督进程 PID 59664，停止命令 `kill -TERM 59664`；其已有 12 小时期限。本轮没有另启动或关闭该实例。
