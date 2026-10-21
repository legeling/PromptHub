# 现有功能发布验收

## Product

Delivery

## 当前私密目录合同（取代下文历史 D2 加密提案）

2026-10-14 已确认：私密目录仅提供应用内入口及内容隐藏，本地数据不加密。主密码用于解锁查看及敏感操作确认，不承诺抵御本地文件读取。D2 的落盘加密方案不实施；原加密断言按此明确需求改为明文数据、私密标记、锁定状态、错误密码及两次重开的保全验收。七种语言的创建/删除提示、安全设置和 README 同步去除加密承诺。模型、MCP 等凭据的既有加密合同不变。

Status: active

## 2026-10-14 提交候选检查

本次检查覆盖提交整理开始时的 Agent、Plugin、Rules、生图工作台、快捷键及图库布局改动，使用隔离源码副本并复用现有依赖；不覆盖检查期间另行出现的 Web Agent 路由与数据恢复测试修改。

- Desktop 定向单测累计 953 个不同用例通过。首次两个 Plugin 子 MCP 测试文件因缺少 SQLite 初始化出现 4 个失败，补齐既有真实 SQLite 测试夹具与清理后，受影响的 13 个用例全部通过；未修改产品逻辑或放宽断言。
- 注册 preload/IPC、文件持久化与 SQLite 重开的 6 个集成用例、CLI MCP root 用例及 shared 测试套件通过。
- 两项隔离 headless 浏览器布局测试通过；图库检查六种宽度，Agent 卡片检查三种宽度及明暗主题。该结果不等同于完整 Electron GUI 验收。
- `pnpm typecheck:tests`、作用域 ESLint、`pnpm build`、`pnpm spec:test` 通过。初次 ESLint 调用因临时目录别名与配置基准目录错误跳过文件，已改用规范路径和仓库根显式配置完整执行。
- `pnpm lint:file-size` 未通过：`agent-session-service.ts` 为 1502 行，`agent-usage-service.ts` 为 1525 行，超过现行 1500 行门槛。未提高门槛或修改基线。
- 未重新执行真实供应商 CLI opt-in、付费模型、Windows、原生发行包和完整 release harness。已有历史验收结果按各自日期保留，不能据本次提交检查更新为完整发布通过。

## 目标与依据

2026-10-04 确认：对现有功能进行完整验收，为新版本发布提供证据；不增加新功能。本计划负责跨对话排期和结果汇总，功能定义仍由各领域现行主题负责，验收规则引用 [testing-standards](../../../rules/testing-standards.md)，发布要求引用 [release-rules](../../../releases/release-rules.md)，可执行检查引用 [verification](../../../workflow/04-verification/README.md) 和 `scripts/verification/checks.mts`。

范围含 Desktop、CLI、self-hosted Web、Worker、Mobile 及 shared/core/db。实验功能、未支持能力和当前不可执行的跨平台检查必须列明，不能通过省略形成“全部通过”。发布版本号、提交、推送、tag、部署和远端 issue 关闭不在本轮执行范围。

2026-10-09 当前范围：用户要求聚焦完善现有功能测试。继续补正常操作、失败后的数据保全、持久化重开和现有入口组合，修正失效 fixture，运行现有测试。私密加密范围、SQLite 权威转换及 causal sync 的产品设计与实现不作为本轮测试工作的前置任务；相关真实缺陷保留测试和报告，不放宽预期或标记通过。此前加密范围问题不再需要用户为本轮作答。网络权限已恢复，可复核先前仅受本地监听限制的用例；GUI、真实账号、付费服务及原生发行包仍分别记录边界。

当日测试批次分工：Prompt 组补当前实际 App 剪贴板导入→EditPromptModal→保存/重开，P28 复用已接受的 Data D5 证据；不存在的网络取消入口不新增实现。Agent 组补其六项本地组合覆盖缺口。数据组补同一完整 ZIP 中非空 Agent Provider/Generation 的往返，并按既有入口核实近期升级功能。跨端组补其本地 CLI、Web、Worker 缺口，独占 Worker storage 测试及新增 runtime fixture 的职责拆分，原八项断言保留。各组只改所属测试和结果报告，旧文件变更先列路径，产品源码及共享配置保持本轮范围外。主协调复核先前受权限影响的 HTTP/CLI 用例、审查实际测试，再在批次稳定后执行统一检查。

定时检查状态（2026-10-09）：`automation_update(mode=delete, id=prompthub)` 返回 `not_found`，工具确认该定时任务已不存在；本轮依靠明确派发和完成消息协调，不再定时唤醒。

测试批次补充：App 剪贴板导入已有 5/5 公开入口与磁盘重开证据；此前受监听权限阻挡的 Provider 38 项、WebDAV/Prompt AI transport 12 项及 CLI README dev 一项均通过（`coordinator-network-recheck-results.json`）。性能预算入口改用既有 tsx loader 和当前 Desktop 模块格式，脚本进入测试类型检查；5,000 Prompt、2,000 Skill、20 次 selector 迭代的原七项预算通过，Core 两项现有性能检查通过（`coordinator-performance-results.json`）。新增启动代理测试覆盖已迁移设置优先、未迁移 SQLite 读取、缺省值、坏 JSON 保全与重开；5 个不同用例分批通过，原代理 4 项同时通过（`coordinator-startup-proxy-results.json`）。初次 missing-row 预期误用 undefined，已按实际 adapter 的 null 合同修正，没有修改产品读取逻辑。

本轮正确失败边界：完整 ZIP 恢复应保全 SQLite 身份及引用文件（FR-FOUNDATION-003），不能用独立逻辑 Provider 配置导入的 Create 结构代替完整恢复语义；两个联合恢复用例保留 mapping ID 与 Generation wrapper 差异，同时继续核对输出/CAS、业务字段和第二次启动。主协调在已释放的 portable 测试中补充原/恢复 wrapper 字段对照，具体 revision 变化由最终候选检查记录。Plugin 子 Skill 的真实 renderer 导入入口仍调用被包生命周期校验拒绝的 create，正常导入红测保留。Web Provider 陈旧更新按 FR-FOUNDATION-006 的 conflict 合同预期 409，当前实际 500；拒绝后的 profile/映射/secret 保全不等于错误分类通过。本轮只完善测试与报告，不实施上述产品修复。

最终现有功能测试结果（2026-10-09）：各领域测试文件与实际入口已审查，新增正常操作、组合入口、失败保全和两次重开断言，修正失效 fixture 与性能脚本入口。CLI 139/139、Worker 41/41、Core 751/751、Mobile 36/36 通过；Desktop 八个独立 unit shard 共 5,799/5,799 通过，无 unhandled errors。Web 456 pass/1 fail。Desktop 集成首次 209 pass/7 fail（216 项），两个额外失败在不改断言的规范短 TMPDIR 下复核通过，216 个不同用例最终为 211 pass/5 fail。Plugin MCP 的首次误报来自协调执行器把 `/tmp` 别名与规范 `/private/tmp` 混用；Skill 页面一秒等待误报复核通过，并让同类真实存储加载等待复用项目 testTimeout。最后仅重测受影响文件及类型/lint，不重跑未变全套。

保留的六个真实失败用例对应四类问题：私密内容仍明文落盘及密码校验材料可用作 helper 内容 key；完整 ZIP 恢复重建 Provider model mapping ID，Generation bundle revision 从 4 重置到 1；Plugin 子 Skill 正常 renderer 导入得到 0 项；Web Provider 陈旧更新返回 500 而非 conflict 409。输出/CAS 字节、普通业务字段、失败回滚等独立通过断言仍记录，不覆盖这些缺陷。没有 skip 红测或降低业务预期。

证据汇总为 `coordinator-final-testing-results.json`：quick 的 31 个正式检查按分批执行和未变范围复用记录为 21 pass/2 fail/8 blocked；正式 Desktop unit 仍依赖失败集成，独立单测通过另列。完整 release profile、build、GUI、原生包和真实账号未执行。本轮测试范围完成，原发布验收计划保留 active。Desktop 批次固定 2,394 个源码/测试/配置文件，前后无并行变化；最后将同值 testTimeout 提取到纯测试配置常量，页面等待复用它。三个受影响文件另列最终 2,395 文件 hash、类型/lint、页面四项与既有配置三项检查；未改其他测试或运行时策略。所有本轮进程、临时 profile 与服务端口均在结果中记录清理，不保留开发服务。

## 最左侧模块菜单卡顿修复（2026-10-09）

新增请求确认卡顿发生在 Prompts / Agents / Skills / MCP / Plugins / Rules 切换，授权范围为该问题的局部修复。桌面图标栏从完整分类控制器中分离，保留原菜单、选中状态、窗口布局和设置页的未保存确认；资产统计、平台探测和分类对话框只由可见分类栏加载。117 Skill × 37 平台的真实 SQLite 路径遍历原有 34,636 次设置查询；根路径和相对路径现复用已有五秒 override 缓存，降至 4 次。保存设置、缓存到期和存储连接重开分别使快照失效。

相关单测 128 个不同用例通过（最终受影响两文件 86 项，加未再改动的三个侧栏文件 42 项），真实平台安装 / 卸载 / 失败重试 / Agent 设置 / 路径开销集成 11/11 通过。最终同条件路径遍历约 37 ms，原约 186 ms；该数值是路径读取基准，不是实际菜单点击延迟。源码和测试类型检查、作用域 lint、隔离 Electron main/preload/renderer 构建通过。构建前后的本次文件 hash 一致。18 项 bundle 预算中仅 DataSettings 仍超标：修改前基线与修复版均为 15,668 gzip bytes，预算 15,360 bytes；未调整阈值或修改该页面。

证据记录于 `coordinator-sidebar-navigation-results.json`。当时的开发实例已加载修复，`startup:window_ready` 与 renderer HTTP 可用；该实例随后按十二小时生命周期退出。本轮未提交、推送或发布，也不改变此前完整发布门禁的失败状态。

后续反馈仍有“进入 Skills 后切换其他模块卡死”。2026-10-09 已明确授权仅操作当前 PromptHub 的六个模块菜单及采集性能和错误日志。当前实例完成 21 次逐项状态读回和 12 次连续快速菜单点击后的终态读回，其中包含实际鼠标坐标点击 Skills → MCP；本次未复现持续卡死。2026-10-09T08:13:19Z 至 08:16:20Z 的原生进程采样覆盖 08:14:13Z 至 08:14:22Z 的实际切换，未捕获持续占用主线程的调用。UI 工具的点击至读回耗时包含自动等待与工具开销，不作为产品响应时间基准，也不能证明间歇性故障已消除。

补充 `skill-navigation-lifecycle.test.tsx`，通过真实 MainContent、Sidebar 和 store 验证 117 条缓存 Skill 的列表 / 平台读取尚未完成时仍可离开页面、迟到结果不会切回 Skills，以及安装状态检查未完成时重复离开和返回；IPC Promise 仅控制读取完成顺序，不替换导航或 Skill 组件。两个用例、测试类型检查及作用域 lint 通过；初次 fixture 类型错误和错误 lint 工作目录的失败及修正均保留在 `coordinator-skill-navigation-results.json`。该用例证明组件导航生命周期，不证明真实文件探测速度或原卡死已经修复。

2026-10-10 在确认旧实例及端口已退出后，新启动一个使用现有用户 profile 的开发实例。此前八个修复 / 回归 / 性能文档文件的 SHA-256 与已验证版本一致。首次进入 Skills 后，完成六个模块的 11 次点击与逐项读回，再用实际鼠标验证 Skills → Prompts 两次点击，仍未复现持续卡死。03:06:20Z 至 03:06:51Z 的 main / renderer 原生采样覆盖 03:06:31Z 至 03:06:42Z 的十次切换，主线程样本以等待为主；更早的冷启动空闲采样没有覆盖首次 Skills 点击，不能用于该点击的结论。当前开发 main 日志未出现 error / warn / unresponsive 行；没有采集 renderer console，不能推断全部错误均不存在。

GUI 会话已释放，保留单一开发实例供用户试用：renderer `http://127.0.0.1:5173`，监督 PID `59664`、进程组 `59665`，停止命令 `kill -TERM 59664`；十二小时到期或停止时清理所属进程与启动目录。采样与验证进程已退出，原始采样仅保留有界摘要和 hash 后清理。完整记录为 `coordinator-skill-navigation-results.json`。2026-10-10 用户在该新启动实例中实际试用后明确确认“现在切换正常”；本地桌面菜单切换验收通过。本轮未追加运行时代码改动，不扩大此前完整发布验收的结论。

## Prompt 删除卡顿与重复提示修复（2026-10-10）

2026-10-10 新增删除 Prompt 卡顿及重复成功 Toast 反馈。当前用户 profile 的
authority marker 为 `canonical-files`。普通 Core 写入已在事务中发布文件 graph，
原 IPC 仍再次完整发布并按所有 Prompt / 历史版本导出旧缓存，属于 Prompt 增删改、
版本 / 关系 / 输出格式及文件夹写入的共同重复工作。单个删除确认未使用现有 loading
且无进行中提交保护；renderer 服务还忽略删除返回的 `false`，可能误报成功。

局部修复通过 `syncPromptWorkspaceAfterMutation` 复用 Core 的事务发布结果，导入、
恢复、直接写入和显式同步仍明确发布。旧 database-catalog 同步路径保留；不修改
schema、文件格式或发布 / 回滚协议。127 条、每条两版本的初次测量中，必要的
Core 删除约 937 ms，被移除的重复导出约 125 ms；进一步确认普通发布仍复制全部
未变 Prompt bundle。Core 改为保留未变 bundle，使用既有 journal 提交本次变化的
bundle 与完整 catalog；初次发布、独立导出及完整校验保留，失败回滚与重试另验。
该变更减少文件写入与复制，不宣称完整清单读取已达到 `O(K)`。
删除确认加入进行中状态、一次提交与失败重试，
失败文案覆盖七个语言。回归先覆盖真实 MainContent / store / Toast 的延迟、重复提交、
失败重试及 `false` 结果；IPC 回归使用临时 SQLite / 文件系统，验证删除及关闭重开、
其余资源保全、普通写入无需二次导出、恢复仍发布。性能测量分开记录必要的 Core
删除和已移除的全量导出，不把合成 fixture 数值当作用户点击时间。

最终 288 个相关用例通过：本次删除 / IPC 回归 8 项、桌面相关回归 182 项、Core
持久化 / 完整导出 / journal 回归 98 项。包含未变 Prompt 的字节及 mtime 保全、
关闭重开、catalog 发布失败后的 SQLite / 文件回滚和成功重试。桌面源码 / 测试
及 Core 类型检查、作用域 lint、文档治理与隔离 main / preload / renderer 构建通过。
首轮测试类型错误已修正；隔离构建的 HTML symlink 路径错误改为复制 HTML 后通过，
没有覆盖正在试用的构建目录。最终同类 127 条合成样本中必要 Core 删除约 363 ms，
另测旧重复导出约 143 ms；这些单次样本不证明 GUI 延迟或整体性能预算达标。
证据、命令、时间及源码 hash 记录于 `coordinator-prompt-deletion-results.json`。
本轮未执行 GUI 删除，未通过界面删除用户实际数据；保留原单一开发实例供试用，
不提交、推送或扩大此前完整发布验收结论。

## 性能与冗余操作白盒审计（2026-10-10）

用户要求扩展 Prompt 删除问题的调查，检查现有功能中的冗余读取、复杂操作与性能成本。本轮完成 1,131 个运行时源码文件的机器候选扫描，并追踪 Desktop/Core/DB/CLI/Web/Worker/Mobile 的相关消费者；确认 15 项操作成本或交互缺口，8 项有隔离运行证据。详细调用链、复杂度、优先级、修复边界及验收要求见 [性能白盒审计](coordinator-performance-whitebox-audit.md)，源码散列与原始计数见 `coordinator-performance-whitebox-results.json`。

128 个 Prompt 上连续执行 8 个单项修改约 1.87 秒，显示批量独立发布的放大成本；Rules 缓存列表两次仍各写 21 个元数据文件；Skill 仅收藏 128 文件包仍复制整个工作目录，约 688 ms。Settings 多路径持久化、Plugin 本地 tab 加载所有未缓存商店源及文本差异平方级矩阵也取得局部运行证据。此前 selector/bundle 预算不覆盖这些主进程写入、文件投影和跨进程加载成本。

本轮未修改产品源码或布局，修复尚待实施；先处理批量命令、缓存列表读写分离、提交生命周期，再处理局部加载与唯一持久化路径。共享投影、Worker 在线快照和 Mobile 列表沿既有 Foundation / 跨端合同推进，不另建权威或兼容模式。本轮没有 GUI 操作、真实账号/网络/付费服务调用或部署，不改变原有发布门禁状态。

## Prompt 卡片多选交互修复（2026-10-10）

普通打开详情写入 `selectedIds`，原卡片路由以集合非空作为批量栏条件，造成单项
浏览也常驻批量栏；卡片未提供复选框。新增 renderer store 瞬时批量状态和既有
Checkbox 控件，普通浏览与明确批量选择分开，保留 Cmd/Ctrl、Shift 和拖拽选择。
清除、目录切换及最后一项消失后退出；剩余批量项阻止旧详情自动恢复覆盖。
真实 store 回归另暴露初始化重置覆盖详情恢复的问题，调整现有 effect 顺序。
没有新增持久化字段、schema、IPC 或依赖，行为合同更新于 Prompt workspace topic。

8 个新增组件回归及既有相关回归共 86 个不同用例通过，覆盖普通浏览、恢复、
复选框、键盘、快捷键、取消、清除和刷新。初次恢复用例失败及修复后复验保留
在 `coordinator-prompt-selection-results.json`；源码 / 测试类型检查和作用域 lint
通过。隔离 main / preload / renderer 构建成功，没有覆盖试用实例的 `out/`。
体积预算仅 DataSettings 超限：本次候选 gzip 15,669 字节，移除本次 9 个源码
改动的同工作区对照为 15,675 字节，上限 15,360 字节；归一化 chunk 文件名后的
DataSettings 内容完全相同。该既有预算失败保留，不上调阈值或扩大本轮 UI 修复。
没有执行原生 GUI 操作，不把组件回归或构建成功视为完整发布验收。

## 看板文字闪烁与卡片间距修复（2026-10-10）

原看板订阅整个详情缓存，并在每次缓存更新时预取全部缺失正文；116 条清单
超过 store 的 100 条缓存容量，会在淘汰与重新读取之间循环。正文读取改由已
挂载卡片复用 `usePromptDetail`，缓存更新不再使看板全量重绘或重新预取清单。
复用 hook 同步缓存时补齐 loading 结束，局部缓存淘汰时保留已显示正文；失败
明确提示且可重试。卡片预览 / 动作从看板协调器抽出，变量去重使用 Set。

虚拟行的实际测量加入行间距，卡片高度通过同一几何常量的 CSS 变量传入；
滚动范围包含顶部留白。最小卡片宽度调整为 240 px，832 px 的内容面板可按
偏好显示三列。预览标签复用七语言文案，加载错误补齐七语言；普通卡片取消
内嵌滚动条，展开卡片保留完整正文。列表复选框与正文分列对齐，移除普通
卡片虚拟化重新挂载时的淡入及尺寸过渡。行为合同见 Prompt workspace topic。

6 个新增稳定性回归及相关回归共 62 个不同用例通过；最后的收藏按钮焦点修复
复验看板 11 项。受控两行视口、三列、116 条清单中，只挂载 6 张卡片并读取
6 次正文；20 条无关缓存写入没有额外读取或 React commit。回归还覆盖缓存
淘汰期间正文保留、失败重试、中文标签、三列适配、行间距、loading 结束及
收藏状态变化后键盘焦点保留。
使用真实 UI / store，替换 IPC 数据和 virtualizer 视口；该计数证明局部读写与
渲染边界，不证明原生帧率或像素布局。没有操作 GUI 或用户数据。

源码 / 测试类型检查、作用域 lint、隔离 main / preload / renderer 分析构建
通过，编译 CSS 包含共享高度规则。初次 CSS 变量的类型错误已修正，未新增
类型断言。体积门禁仍只有既有 DataSettings 失败：15,669 字节 gzip / 上限
15,360；分析中的 24 个模块及各模块 renderedLength 与上轮相同，没有引入
看板模块。原始输出、计数、源码 hash 和资源清理见
`coordinator-kanban-ui-results.json`，不扩大完整发布或原生 GUI 验收结论。

## 业务确认弹窗统一（2026-10-10）

扫描 Desktop renderer、Web client、Mobile 与 main-process 对话框入口。Desktop
共 12 处浏览器确认调用：Prompt 批量删除 / 版本恢复 / 标签删除，Agent 外观删除
/ MCP 覆盖，MCP 分发覆盖，AI 模型删除，云账户删除请求，数据目录迁移 / 覆盖
/ 重启，以及 Skill 未保存离开。全部接入既有 ConfirmDialog 的异步 UI host；
Web 复用的 App 同时挂载该 host。原有 Skill / MCP / Plugin 批量对话框维持
现有自定义组件。原生系统集成及 Mobile 边界见 Desktop topic 2.3。

回归将原先直接 mock 浏览器确认的流程改为点击自定义确认 / 取消；批量删除
覆盖真实临时 SQLite 读回、关闭重开和失败保全。新增静态策略扫描防止 Desktop
/Web 页面再次出现浏览器原生弹窗调用；静态扫描不替代功能回归。画廊批量删除
取消 / 失败后保留选择，成功移除的记录由既有选择裁剪机制清除。

23 个相关测试文件共 224 个不同用例通过（含 5 个临时 SQLite 集成用例）；
源码与测试类型检查、作用域 lint、隔离 main / preload / renderer 分析构建、
文档门禁通过。初次失败来自旧测试未等待异步导航、缺少语言资源，以及选择框
选中后的名称断言，均在所属测试修正后复验。体积门禁仅既有 DataSettings
超限：15,630 字节 gzip / 上限 15,360，比前一轮 15,669 字节减少 39 字节；
App coordinator / workspace shell 均在原预算内。原始检查摘要、源码 hash、
遗留平台边界和资源清理见 `coordinator-dialog-results.json`。GUI 未自动操作，
未改用户数据或数据库结构。

## 基线与共享工作区

- 起始 HEAD：`108f375bcd2c3e94c20d93dd619d641b6386b352`；本地 main，清单版本 `0.6.0-beta.2`。未刷新远端，不以本地 tracking 状态推断远端最新版本。
- 起始 tracked diff SHA-256：`d7b262f104c184f98efee65f729429bbe80b5c49db8c5a17452b1e7c589b83fd`（`git diff --binary | shasum -a 256`）。每批验证另记录实际 HEAD、涉及源码差异和执行时间；变动影响到的结果须在最终候选上复测。
- 既有脏文件：`apps/desktop/src/renderer/services/renderer-persistence.ts`、对应 `tests/unit/services/renderer-persistence.test.ts`、foundation `storage-inventory.md`，以及 `spec/issues/README.md`、`active/ISS-20260809-001-remaining-open-issues-roadmap.md`、`active/github-open.md`、`active/local-github-status.md`、`archive/github-closed.md`。保留这些差异。
- 2026-10-04 最新授权：各领域会话负责自己发现的问题，完成修复、持久回归和报告；替代此前产品源码冻结和只交测试的限制。源码所有权按下方修复表分配，共享配置仍由主协调统一处理。测试按 [用例有效性审计](../../../rules/testing-standards.md#现有用例有效性审计与脚本交付) 执行。
- 主对话拥有本计划、索引、全局门禁、缺陷去重、修复范围和最终发布判断。新对话不能更改其他对话的报告，也不能改写既有业务契约。

## 分工与覆盖清单

以下是起始清单。各负责人必须从导航、菜单、IPC/路由/命令注册和现有主题补齐具体操作、设置项和适用平台，不以此表或现有测试名称充当完整覆盖证明。

| 对话 / 结果文件 | 必须核对的现有功能 | 主要真实边界 |
| --- | --- | --- |
| Prompt 与 AI / `prompts-ai-results.md` | Prompt 新建/读写/删除/批量；文件夹层级/移动/排序；标签/收藏/搜索/过滤；模板变量/复制/分发；Markdown/附件/图片/导入导出；版本比较/回滚；编辑未保存状态；模型供应商、文本测试/多模型对比/图片生成、取消和错误反馈 | 注册 IPC、真实 SQLite/文件、renderer 状态读回；外部供应商 mock 与真实供应商验证分开 |
| Agent 与资产 / `agents-assets-results.md` | Agent 发现/安装状态/配置/模型/provider/会话/用量；所有平台注册能力；Skill 创建/商店/自定义源/Git/Gitea/本地目录/扫描/更新/完整包/版本/导出/部署/卸载；MCP/Rules/Plugins；项目/工作区、全局与项目作用域、复制和符号链接、原生配置读回 | 平台能力 registry、公开服务或 IPC、临时 Agent homes/仓库/真实包目录；每个支持平台逐项区分 contract 与原生客户端证据 |
| 数据与恢复 / `data-recovery-results.md` | 旧版本升级/迁移/数据布局；跨实体关系/FTS/约束；重开持久化；完整备份/导入/恢复/安全快照；WebDAV/S3/自托管同步、冲突/删除/失败恢复；隐私锁/私密目录/加密数据完整性；大数据与资源释放 | 真实 SQLite、临时文件系统、代表性旧数据、数量/字段/文件清单/hash；本地可控远端故障注入，不访问真实云盘 |
| CLI / Web / Worker / `cross-surface-results.md` | CLI 全命令与退出码/JSON/路径/并发；Web 鉴权和隔离、Prompt/目录/资产/AI/附件/备份/设备/同步/导入导出；Worker 鉴权/媒体/同步/快照恢复和部署合同 | CLI 子进程、真实路由请求/SQLite、临时服务；Worker 本地运行时与真实部署证据分开 |
| 桌面体验与发布 / `desktop-release-results.md` | 全导航/设置项/快捷键/窗口/托盘/启动退出/更新；7 语言/主题/可访问性/空态/错误反馈；列表-详情-计数一致性、reload/reopen；移动端既有功能；安装包/升级/签名/各系统启动；性能与 bundle 预算 | 第一轮组件及非 GUI 检查；后续专用 Electron/浏览器窗口、打包产物和原生平台；与领域对话对应场景合并验收 |

## 执行阶段

测试文件所有权：在所属 app/package 已有且被常用入口发现的测试目录新增下列前缀文件，可按行为拆分；不新增测试框架。已有有效测试直接复用。需要修改已有测试或共享 helper/config 时先在报告列出确切路径，由总协调统一分配，不覆盖并行改动。

| 对话 | 独占新增测试文件前缀 |
| --- | --- |
| Prompt 与 AI | `release-acceptance-prompts-ai*.test.ts(x)` |
| Agent 与资产 | `release-acceptance-agents-assets*.test.ts(x)` |
| 数据与恢复 | `release-acceptance-data-recovery*.test.ts(x)` |
| CLI / Web / Worker | `release-acceptance-cross-surface*.test.ts(x)` |
| 桌面体验与发布 | `release-acceptance-desktop-release*.test.ts(x)` |

补充交付：各组审计现有用例、落地发现缺口的测试脚本、保存缺陷红测或适用的隔离故障验证，并核实实际被测试入口选中。仅提交盘点报告或既有套件通过数量，不满足该阶段完成条件。主协调审阅关键测试的真实调用链和业务断言，不能只采信组内结论。

1. **盘点与正常流程基线。** 各对话读取相关现行契约、入口和测试，建立逐项清单并实际运行可安全执行的公开入口正常流程。首轮每组选择最短有效检查，补充黑盒复现，不运行全仓门禁或构建。
2. **失败路径和数据保全。** 正常路径后检查非法输入、缺文件、权限/认证失败、部分写入失败、取消、重复执行、重开和恢复；必须核对失败后的实际数据与资源状态。仅适用于现有产品合同，不新增防御机制或兼容层。
3. **缺陷集中处理。** 总协调区分产品缺陷、测试缺陷、环境阻塞和文档冲突；确认缺陷先形成有效回归，再按独占范围批量修复，集中运行受影响检查。不以放宽断言或增加 fallback 得到绿色。
4. **GUI 与真实服务。** GUI 自动化须用户明确授权，只用隔离测试窗口和数据。GUI 未授权时继续非 GUI 工作，将界面验收列为 blocked。真实账号、付费模型、云端写入或生产迁移不默认获授权；mock 结果不替代真实服务验收。macOS/Windows/Linux 和 Mobile 原生环境缺失须显式记录。
5. **固定候选和统一门禁。** 影响行为的改动完成后记录候选 HEAD 与实际源码状态，由总协调运行 root release harness；GUI 未授权前不能运行包含 Electron E2E 的 full profile。完整 E2E 按领域场景补足 smoke 之外的覆盖。最终候选上的 full harness、真实业务流程、原生安装包验收分别记录。

## 资源与执行约束

- 本机 16 GiB；复用现有 pnpm/node_modules，不安装工具链。主对话独占全局 build、release harness、共享 `out/` 和打包目录；禁止各组并行构建。
- 首轮每个对话最多一个检查进程，Vitest 使用 `--minWorkers 1 --maxWorkers 1`；检查前核对进程/端口。命令使用项目既有测试超时或可追踪父进程 deadline，禁止无界后台进程、持续 watch 和自动重试。
- 使用唯一临时目录/测试 profile/动态端口，只清理本对话创建的资源。运行前核对测试不会读写真实 HOME 下的 PromptHub/Agent 配置。不得擅改 HOME、VPN、代理或真实数据。
- 不修改测试基础设施以绕过授权。第一轮不启动 Electron、Playwright、浏览器、模拟器或用户应用，不连接真实 provider/云盘；需要这些边界时报告阻塞。
- 分组检查避免重复：桌面组只负责 shell/settings/UI 状态，业务资产由相应组负责；数据组只负责持久化/迁移/恢复，不重复业务 CRUD。完整门禁允许在最终候选上统一复测，并明确其目的。
- 所有权冲突、共享源码变化、需要新产品/安全/兼容决策时停止相关写入，立即报告主协调并继续独立工作；主协调负责决策和重新分配。各组不再委派或新建对话。用户已明确授权各组向主对话 `01a07058-384c-7f41-9361-a0fff5aff5e4` 主动发送阶段完成、阻塞和最终完成消息；主协调可回复和安排后续任务。接收通知后必须复核实际 diff/证据，未验收通过则继续派发，不以报告提交代替完成。

## 修复责任与持续协调

| 负责人 | 已分配产品修复与测试范围 | 方案和边界 |
| --- | --- | --- |
| Prompt 与 AI | PA-01–04；Prompt canonical graph/workspace 及其专属读取模块、`packages/db/src/prompt.ts`、Prompt IPC、批量移动 action/service、原有对应测试 | 修正内部 trash 被当有效记录、null byte 静默截断、根目录移动参数、替换字符串字面值；保留删除恢复数据及存储布局，不借机实施全域权威迁移。发现涉及其他领域共享文件则先报告 |
| Agent 与资产 | A1/A2；`packages/core/src/rules-workspace.ts`、`canonical-rule-db.ts`、对应 Rule 测试；报告中三个 Agent 检测/配置用例的初始化 fixture | 统一受管路径身份，删除时只清理已验证属于目标 rule 的记录/缓存，保留外部 AGENTS.md；测试使用真实 DB 初始化，不增加业务 fallback |
| 数据与恢复 | D1 的 `apps/desktop/src/main/webdav.ts` 及对应回归；D2–D4 的合同核实和最小迁移/恢复方案 | D1 使用 Node 流式 UTF-8 解码保全跨块字符；D2 加密语义、D3 权威迁移、D4 同步合同由主协调审定设计后进一步拆分，不能自行降级安全承诺或扩散架构 |
| CLI / Web / Worker | D01 `packages/core/src/cli/doctor-command.ts`/help 与 CLI 回归；D02 CLI README 对应调用示例；自己发现的 app 内局部问题 | 帮助在业务动作/DB初始化前按既有 CLI 帮助机制处理；实跑源码命令后修正文档。不得改 Prompt DB/Rule/Security 等其他组文件 |
| 桌面体验与发布 | D1 `settings/settings-persistence.ts`/`settings.store.ts` 与语言回归；D2 Mobile i18n resources；D3 mobileCapabilities 及测试；shortcuts 测试 fixture | 保留原始语言有效性并沿用单一迁移入口；补齐现有界面翻译；只更新已实现的存储能力声明；临时目录独占清理。不得修改既有 renderer-persistence 脏文件 |

主协调保留 testing standards、本计划、共享静态/构建门禁、跨领域安全/数据决策及最终验收。报告中约 297 项既有测试类型诊断须集中去重并按归属分批分配，不由各组重复运行完整 typecheck。各组先处理所属文件诊断并报告范围外明细。

持续循环：领域修复和定向回归 → 主动消息附报告/文件/命令/遗留项 → 主协调审查与必要复验 → 分配遗漏/失败 → 通过后汇总最终候选。定时检查作为消息遗漏的补充，无变化不重复执行或通知；完成全部验收或只剩需用户处理的明确阻塞时给出结论并停用对应检查，不无限重试。

历史协调配置（2026-10-04）：`PromptHub 全功能验收协调`（automation ID `prompthub`）曾每 15 分钟补查，绑定主对话。2026-10-09 工具确认该任务已不存在，当前不再定时唤醒。

阶段复核：数据 D1 的 `webdav.ts` 流式 UTF-8 解码修复及对应 7 项测试已完成主协调代码/断言审查。复用数据组 2026-10-04 09:49 UTC 的 7/7 通过和定向 ESLint 证据，无同状态重复运行；仅接受本地 HTTP、preload/handler 和文件完整性边界，真实云盘/TLS/GUI 仍未验收。D2 经源码确认密码校验记录保存了内容加密所用的派生 key，不能直接连接该 helper 宣称离线私密加密成立；数据组继续核对消费者及旧数据，主协调审定迁移方案。

后续分配：

- Agent A1 路径统一包含 `packages/core/src/rules-workspace-import.ts` 的受管目录派生/失败清理；沿用唯一路径真源，补导入失败与外部文件保全回归。
- CLI D01/D02 的代码与真实进程断言已完成主协调审查，复用组内 14/14 结果；定向 lint 回报后关闭该修复批次。Web 视频 clear 验证单独保留其覆盖边界。
- 跨端 D03：Web Rule AI rewrite 当前只追加注释、未调用模型，源码已确认。跨端组独占 Web rewrite 路由/相关服务及必要的 Core `rules-rewrite.ts`、`ai-client.ts`，Prompt 组已通知避让。复用 Core rewrite 业务与协议，通过最小显式传输边界接入 Web 既有安全 HTTP 运输，保持单一超时所有者、既有响应合同和 draft 不自动保存语义；禁止复制业务或绕过 Web SSRF 校验。
- Worker 真实本地存储测试由跨端组使用已有 Wrangler `getPlatformProxy`，临时 config、空 envFiles、禁用 remoteBindings、独占 persist 路径和 finally dispose；不新增依赖，不接远端账户。D1/R2 实际绑定测试与真实部署 Worker 验收分层记录。
- 数据恢复实测的 POSIX chmod/EACCES 与 SIGKILL 场景按真实平台能力运行；允许明确的条件执行，Windows/root 等未执行部分记录 unsupported/not-run，不算通过。跨平台可控 I/O 失败与 journal 恢复测试仍须执行，不能用平台条件跳过产品缺陷。数据组继续核对三个已发布源版本的现有 fixture 来源和全域恢复清单，为已确认 foundation 升级批次提供依据。
- D2 的新增 key 保管红测证明数据库校验材料可解开 helper 测试密文；当前及核对的已发布源码没有该 helper 的正式内容写入消费者，因此不得按 `ENC::` 前缀擅自解码用户正文。主协调负责审定 verifier/内容 key、私密字段、FTS、版本、附件、导出和升级的单一合同；此问题仍是发布阻断，尚未授权分散修改各持久副本。
- 桌面组 D1–D3 与 shortcuts 隔离/重载回归已完成主协调 diff 和断言审查，复用该组最终 96 项分层结果、Mobile typecheck 和定向 lint；不扩大为 GUI/原生验收。下一批由桌面组独占一次 Desktop `typecheck:tests` 全量诊断归类，直接修复仅限其已有文件所有权，其他域诊断交主协调分配。该组同时审计修正 updater-real-scenario 的无效网络用例，不将网络失败或 URL 格式断言计为产物通过。
- 跨端 D01/D02 定向 lint 已补齐，该修复批次接受。D03 已从原 10 项业务红测修复为新旧 Web 22 项与 Core 协议 10 项通过，主协调审查实际路由、传输注入和 SSRF/错误断言后未发现阻断实现问题；仍要求补充真实版本清单不变的后置断言，因为仅 GET 正文不能证明历史未被修改。最终 Core/Web 类型门禁及真实供应商边界尚未验收。
- 数据组恢复批次的真实非空 SQLite/文件保全、局部发布 EIO、POSIX 权限失败及强杀后 journal 恢复已完成主协调断言审查；复用所报 macOS 实跑结果，不扩展为 Windows/ENOSPC 通过。三版本源码来源清单已保存，缺失真实旧 runtime 产物仍保留。下一批由数据组编写公开数据非空全域导出 ZIP→独立根恢复→两次启动/消费基线，真实导出/恢复链不替换，为后续权威转换提供防丢失回归；该基线不证明目标迁移已实现。
- 297 项类型诊断集中日志由桌面组交付。主协调独占 `tests/helpers/window.ts` 及其回归：移除 `Record<string, any>` 泛型推断，显式列出并用生产 API 类型检查默认 bridge，嵌套覆盖不能丢失兄弟方法；保留独立 mock 实例。大对象工厂仅是声明式测试方法清单，继续集中在同一测试边界，不视为真实业务或持久化实现。各领域单测须自行配置其被替换边界的结果；禁止把默认 mock 当作功能验收。
- Worker 的 Node 代理遇到实际 Headers 序列化限制，跨端组获准使用已有 Wrangler 做测试专用本地 Worker 打包/运行，全部输出放独占临时目录并清理，不占共享产品 build/out/dist；保留原 R2 raw 字节断言，不以替换正式媒体实现掩盖环境限制。
- Prompt PA-01–04 的产品 diff 与持久回归已完成主协调审查：trash 保全、根目录 null 合同、直接文本拒绝 null byte、变量字面替换均有真实结果证据。复用组内 24 项 integration、18 项 Core、117 项定向测试；仍收紧初次探索的 null-byte 多分支预期为当前明确的拒绝合同，随后仅复测受影响用例。
- Agent A1/A2 的 Rule ID 路径、全部已验证绑定删除、外部目标保全、局部失败恢复和 custom Agent 公开入口回归已完成主协调审查。复用 87 项不同用例及定向类型/lint 证据，不扩展为真实 Agent/GUI 消费通过。
- 共享 window helper 的生产 API 形状定向类型检查为 0 诊断；3 项夹具回归与定向 ESLint 通过。补齐 bridge 后暴露的 legacy hydration 用例须逐用例声明和恢复桥接缺失前提；settings get/set 使用 Promise 默认，避免把夹具同步返回误报为产品异常。第一次受影响 settings 集合出现 19 项未处理错误，不计通过，桌面组负责修复前置并集中重测。

### 测试类型诊断修复分工

以下均仅修复现行合同下的测试 fixture/mock 类型及环境前提；不得压制错误、删除行为断言、放宽生产接口或重复全量类型检查。各组完成整批改动后运行相关测试、lint 和临时 scoped tsconfig，最终完整门禁仍由主协调统一执行。基线是 `desktop-release-typecheck.log`，297 项是修复前历史数量。

| 所有者 | 新分配测试范围 |
| --- | --- |
| Prompt 与 AI | components 的 AI/model、Prompt、folder-modal、image-prompt-reverse-modal、quick-add-utils；services/ai、ai-transport；stores/prompt-save-sync、settings-ai-models |
| Agent 与资产 | 日志中 agent/agents/use-agent、skill、mcp、plugin、rule、kimi-oauth 域；sidebar-skills/sidebar-mcp；settings-agent-roots 历史存储前提。既有 Copilot/Kiro/platform detection 所有权不变；sidebar-modules-rules 仍归桌面组 |
| 数据恢复 | data-settings-backup-sync；canonical-storage-projector/self-heal、file-authoritative-prompt-recovery、recovery-candidates；backup-orchestrator、database-backup 及两个子域、self-hosted-backup/skill-sync-reliability、settings-snapshot、sync-backup-core/publication、webdav |
| 跨端 | main/cloud-ipc；已有 Web/Core/Worker 修复所有权不变 |
| 桌面体验 | 已分配 shell/settings/updater 文件及其 legacy bridge 隔离前提 |
| 主协调 | 共享 helper/config、完整门禁、跨域冲突和最终验收 |

排期调整：D5 优先后，数据域的 `data-settings-backup-sync` 及上表十个 services 测试文件转交桌面组做纯 fixture 类型修复；四个 main 恢复/投影测试仍归数据组。Prompt/AI 的 14 文件类型批与 PA-02 严格拒绝回归已复核接受，完整门禁尚未执行。跨端 CLI 本地 Plugin 生命周期及 Worker 非空 Skill/Rule snapshot、版本回滚/删除、复制与租户保全批次已审查接受；真实部署与界面仍未验。

类型批次复核：Agent 60 文件的 692 项、桌面移交 11 文件的 102 项均有最终通过结果，定向类型和 lint 通过；重跑不重复计数。测试 fixtures 的当前合同修正不证明 GUI 或旧持久化格式迁移。Agent 后续新增 Provider Profile、session metadata/index/cancel、Plugin child MCP 真实入口集成；其独占 `helpers/skill-runtime.ts` 的事件运输与禁用 safeStorage mock 扩展，保留真实启动、DB 和文件服务，验证共享 helper 的受影响旧集成。

跨端 D04：真实 Worker `render-copy` 将变量值中的 `$&`、`$$` 等解释为替换指令，正确回归已失败；跨端组负责 `web-data.ts` 的回调字面值替换与文档及定向验证。Core CLI 同名 helper 有相同表达式，先确认真实 CLI 入口并增加回归，再决定产品改动，禁止扩大到无关 API。Worker 其余新增七项已通过；Web capability 组件已验证隐藏清空入口，仍不计为 GUI 验收。

D04 最小回调修复已审查，Worker 当前八项全部通过。CLI D05 已由独立进程 `prompt copy` 复现：美元文本被展开，含点/方括号的 key 被当成正则；模板、使用次数与版本后置仍通过。跨端组追加独占 `packages/core/src/cli/prompt-utils.ts` 的字面占位符替换及既有 CLI 文档，不新增工具层或改变逐变量顺序，修复后验证对应真实入口。

Worker 清空能力核对：bridge 存在媒体清空方法，但 `clearDatabase` 的唯一界面消费者由 `DangerPanel` 的 `!webRuntime` 条件排除，Web/Worker 不展示清空入口。缺少底层清空路由不能据此定为可见功能失败；此项按未支持记录，跨端组验证现有界面能力选择，不新增路由。

### D5 非空 portable 恢复后的启动失败

真实 renderer→preload→注册导出→checkpoint ZIP→独立根恢复返回成功，但首次启动报 `invalid-canonical-prompt-graph`；`legacy-versions` 不在现有 catalog，Rule `.versions` 缓存也不满足 canonical bundle 读取合同。源数据与 ZIP 字节保全已通过，恢复后消费尚未通过，属于发布阻断。

当前 restore candidate 复制目标 authority/catalog 后合并文件与 SQLite，只运行数据库 quick_check，未保证发布目录与当前启动合同一致。修复由数据组负责 `portable-snapshot-restore.ts`、必要的同域候选辅助文件与测试；checkpoint/authority 共享函数改动需先交主协调审定。候选应先按选中 scope 合并，再复用既有 checkpoint/projector 形成一致目录/catalog，在同一 journal 发布前后完整校验。目标本地秘密、未选域和历史/媒体必须保全；禁止增加 reader ignore、跳过启动断言或叠加第二次非原子发布。最终 SQLite 权威转换 D3 仍单独待实施，本修复不得据此宣称该架构迁移完成。

D5 复用点已审定：数据组可在 `canonical-storage-projector.ts` 增加可选 `skills: readonly CanonicalSkillShadowInput[]` 输入并优先消费；显式空集合不得回退读取活动目录。其余域使用现有注入点，候选源路径与最终发布引用分别确定，禁止切换全局 runtime 路径。checkpoint/authority 其余修改仍须先明确共享边界。

MCP 已有 bundle 含历史和秘密引用，不能经当前态 `McpLibraryFile.servers` 重新投影而折叠历史。数据组额外独占 Core `canonical-storage-shadow.ts` 的最小 `mcpResourceBundles` 输入及测试、Desktop projector 透传；与 `mcpLibrary` 互斥。既有 reader 验证身份/完整性和重复 ID 后，在 additional-domains 阶段复制完整 bundle，随后正常生成 graph manifest 与 catalog；禁止生成 manifest 后追加文件或手工修 count。秘密不解密、不重新写入，目标设备配置和秘密文件在恢复边界保留。

设置恢复沿用显式 scope：选中 settings 时通过 `importAgentSettingsV1` 恢复四个 `AGENT_SETTING_KEYS`，目标已有配置不构成忽略备份的条件；未选中时保留目标值。本机保全指非 portable 的设备配置、秘密文件及未选域。选中 MCP 时仅移除指向恢复后不存在 server ID 的设备绑定，未选中时保留全部绑定；设备身份和 secrets 字节保留，不向外部 Agent 文件自动写入。回归须覆盖非空目标的选中/未选设置、绑定筛选及同一 journal 的失败回滚。

D5 首批 Core shadow 26 项已通过，包括四项 MCP bundle 历史/秘密引用用例；完整 ZIP 已通过候选验证和两次 startup，但正常 Plugin consumer 暴露路径合同冲突，故仍未通过：projector 使用 `encodeCanonicalResourceDirectory`，canonical Plugin reader/writer 使用原始 ID。规范路径选用现有编码真源。数据组独占 `canonical-plugin-library.ts` 及其 Core 测试的调查/回归，先明确既有 raw ID 目录的版本化迁移、碰撞与原子回滚边界再实施；禁止双读兜底或读取时静默迁移。Agent 新集成遇到相同问题复用本缺陷，不另行修复共享文件。

本地 beta.1/beta.2 tag 包含原始 ID writer，不能按未发布数据省略升级。迁移由数据组在 Core 新增 `migrations/plugin-resource-paths-v1.ts` 及对应测试，接入 `canonical-catalog-reconciliation.ts` 既有维护锁内、journal recovery 后且 catalog 重建前。先验证全部源身份、唯一性和目标碰撞，再用同一 entry publication 发布编码目录、旧源恢复备份、删除旧目录及版本 marker。当前 reader/writer 只消费编码路径；失败保全双方，升级后包与历史字节一致，二次启动/幂等/故障恢复均须验证。当前 graph manifest 不声明 additional Plugin 域；旧样本若存在相关路径声明，须先明确迁移合同，不得跳过 manifest 校验。

## 报告格式与发布判断

每个结果文件记录：基线与起止时间、覆盖盘点、实际运行命令及退出码、最小复现、缺陷、阻塞、资源清理。

逐项记录 `功能/平台 | 真实入口 | 操作与预期结果 | 测试路径和用例名 | 实际结果与状态 | mock/未测边界`。状态只能为 `pass`、`fail`、`blocked`、`not-run` 或有契约依据的 `unsupported`。已存在测试但未执行只能记 not-run；仅静态/组件/mock 的通过不得覆盖未运行的业务或 GUI 层。

缺陷记录影响、严重度、基线、最少复现步骤、期望/实际结果、测试文件与命令、失败后数据状态和候选修复位置。发布阻断包括数据丢失/越权/破坏恢复、核心正常流程失败，以及没有证据的必需发布门禁。环境阻塞不能当作产品失败，也不能算通过。

发布结论必须列出覆盖分母、各状态数量、未解决缺陷、未测环境和完整门禁结果；“没有发现问题”与“全部验收通过”不可互换。当前状态：**尚未完成验收，不可据此发布**。

## 当前进度与待办

2026-10-09 恢复协调：Agent、数据、跨端和桌面会话已由用户恢复，继续沿用原文件所有权；主协调负责候选审查和统一门禁。向 Agent 派发 D5 后续的工具调用仍被审批策略拒绝，该消息未送达；现有活动会话的文件不得由主协调并行接管。用户已要求关闭定时检查，但删除操作同样被拒绝，工具未成功执行停用；当日状态读取也被相同策略拒绝，不能核实 `prompthub` 当前状态。

当日统一静态门禁：正式 quick harness 排除 unit/integration/security，单并发执行 16 项，13 pass、3 fail；完整结果见 `coordinator-static-results.json`（03:53:38.150–03:54:26.712 UTC，exit 1）。剩余为文件行数门禁的 main index 1506 行与 AgentSessionsPanel 测试 1552 行、Desktop 测试 9 个类型错误、Web 测试 1 个 Promise 返回类型错误。主协调独占 main index 的网络代理启动职责提取、已交付跨端 Web rewrite 测试的 async 包装，以及 `agent-conversation-service.ts` 的去敏字段名修复。Agent 新增会话/MCP 测试和 Rule 文件继续由 Agent 组负责；现有 store mock 和会话组件测试须在该组批次释放后修正，不降低类型或断言要求。

数据组 D5 最终完整集成 4/4 pass（03:53:46.131–03:54:08.145 UTC）：真实完整 ZIP、独立根恢复、两次正常启动、公开消费、选中/未选设置、秘密文件字节和 EIO journal 回滚通过；541 个源码文件在检查前后一致。历史来源样本 3/3 pass，跨端组已释放生成器/来源测试所有权。上述结果分别关闭 D5 当前恢复缺陷和 D3 来源样本前置工作，不证明当前权威转换、连续升级、D2/D4 或 GUI/发行包通过。

Agent 会话导出新增正确红测：JSON/Markdown 两种精确文件断言发现 `token` 字段名变为字面 `$1`，因为去敏正则使用非捕获组却引用 `$1`。主协调修复为捕获现有字段名；保留既有去敏范围、源 transcript 和 metadata。新测试的其他六项 handoff 拒绝、失败持久化与重开已通过；MCP invalid-url fixture 在规范 create 校验处被拒绝，应验证拒绝与零残留，不能降低写入校验来进入 health 诊断。

统一测试门禁剩余文件由主协调独占处理：`tests/unit/stores/{mcp,plugin,rules}.store.test.ts` 的完整 bridge mock/当前字段/Promise 结果类型，以及 `agent-sessions-panel.test.tsx` 按搜索职责拆分和共享合成 fixture。这些文件不在 Agent 当前 Rule/新增集成批次修改范围；Agent 组继续独占 Rule 规范绑定优先修复与新增会话/MCP集成回归。主协调不修改其当前活动文件，也不重复执行其受影响用例。

统一局部修正结果（04:04:56.389–04:07:26.091 UTC，`coordinator-focused-results.json`）：main 的代理设置读取原样移入 `network-proxy-startup.ts`；Agent 会话搜索两项移入独立测试文件，合成 Agent/session fixture 集中共享，全部原业务断言保留。原 Desktop 9 项类型诊断清除，源码类型、测试类型、Web 类型和全仓行数门禁通过；9 个主协调源码/测试文件定向 lint 通过。Desktop 52 项首次 51 pass/1 fail，剩余失败为 cache 预期仍含规范类型不存在的 `checkedAt`，同步该纯 fixture 后仅受影响一项通过；Web rewrite 16/16 pass。首次拆分遗漏 `ManagedAgentSummary` 类型 import 引起 4 项诊断，补回后标准 Desktop 测试类型检查通过；首次 Web 命令将 pnpm `test` 当 `run test` 透传参数，被 pnpm 拒绝，未运行用例，正式 `run test` 后通过。没有把两次结果相加称为一次全绿运行。

Agent 最终批次已释放：Core Rule 12/12、会话 8/8 通过；MCP 27 preset 与 1 health 分批通过。规范目录优先的最小隔离 transform 变异使 `aaa-stale` 保全断言实失败，非编译/fixture 错误。最终 Rule 源码 `366a315bbfdc1b0bdc94fabaf578ced27e0367aace6d2091f245c09aa9c98a48` 与数据 D5 较早源码不同；差异限于 metadata 读取优先级，主协调统一功能门禁将实际运行最终合并状态。各领域完整矩阵和 native/GUI 缺口继续以所属报告为准。

最终合并状态非 GUI 功能门禁（04:10:22.326–04:17:11.431 UTC，409.105 秒）：正式 registry/executor 的 quick 中 unit/integration/security 15 项保持既有依赖，结果为 4 pass、3 fail、8 blocked，见 `coordinator-functional-results.json`。Shared、Core 751 项、Web 452 项和 Mobile 36 项通过。CLI 133 pass/1 fail：README dev 用例的 tsx UNIX socket 超过本轮 TMPDIR 路径容量，报 EINVAL，另用短任务目录复核。Desktop 集成 180 pass/9 fail/5 skipped：两项为 D2 正确行为红测，七项 WebDAV 及 Prompt AI transport suite 受本地监听 EPERM 阻止；Worker 30 pass/8 skipped，同样因本地运行时监听 EPERM 失败。Desktop 八个 unit shard 按原依赖全部 blocked；独立单测诊断另列结果，不改写正式门禁。候选 2,219 个源码/测试/配置文件聚合 hash 为 `ffc8069f3b775bc3d97e6cf1423d4b767aed2ac7cd6182577ac9f620ff08890f`，检查前后逐文件一致。没有运行 GUI、构建或发行包，不删依赖、skip 缺陷或将环境受阻记为通过。

独立诊断（04:19:48.481–04:25:47.443 UTC，358.962 秒）：短目录重跑 README dev 仍因 UNIX socket EPERM 受阻，原 EINVAL 路径问题已排除。Desktop 八个 shard 实际执行 5,742 pass/52 fail；32 个失败来自四组 Provider 本地 HTTP 监听权限，20 个为当前 fixture 漂移，另有三个恢复路径 Promise 未处理错误。完整结果见 `coordinator-unit-diagnostic-results.json`；该结果不能把正式 blocked 的 unit 门禁改成通过。源码/测试/配置 hash 前后一致。

本批 fixture 修正由主协调独占：`tests/unit/main/{skill-installer-export-remote,skill-installer-local-resilience,agent-provider-runtime,ipc-index}.test.ts`、`tests/unit/services/doubao-work-platform.test.ts`、`tests/unit/components/{skill-i18n-manager,skill-ui,data-settings-paths-recovery,agent-session-index-cache}.test.tsx`，以及必要的同目录测试 helper。使用真实独占 SQLite 设置库和临时 Agent 根补齐初始化，保留正常扫描、重绑和行/文件断言；UI 对齐现有批量安装/卸载名称；异步 mock 始终返回当前 Promise 合同。只修当前失败范围，不改产品逻辑、全球 mock 默认值或本地 HTTP 用例的权限断言。

该批修正完成：9 文件的 138 个不同用例已分批通过，详见 `coordinator-fixture-results.json`。首轮 136 pass/2 fail；默认平台用例须清空本用例不适用的临时路径覆盖，会话缓存用例须补当前 metadata Promise 和 ToastProvider，原列表保留及刷新时序断言不变。修正后默认平台一项、缓存两项分别通过；没有宣称一次九文件全绿运行。真实临时设置库使用 runtime path 真源，scanLocal 的数据库归入所属临时根，重复 close/cleanup 合并为一次并传播清理失败。测试类型、定向 lint、全仓行数及文档治理通过；临时根和全部检查进程已释放。正式 unit 门禁仍按原集成依赖 blocked，Provider 本地监听 EPERM 与 D2 两个产品红测仍未解决。

此前存储调查记录：曾询问私密目录加密字段范围，随后用户明确本轮仅完善现有功能测试，该问题不再是当前工作前置条件。D3/D4 仍为未实施的既有 foundation 要求；本轮没有切换 authority 标记或删除旧资产。现行 `canonical-metadata-migration.ts` 仍可在 canonical 非空时未比对旧库就删除旧 metadata，BC01 的数据保全问题保持未解决，不能视为安全的升级入口。

D5 第二次启动的 Rule 修复边界：`hydrateWorkspace` 为未部署项目保存的 `targetPath: ""` 与 `projectRootPath: null` 是明确的 detached 状态，`readProjectPlacement` 应返回该状态，保留项目 metadata 的列表/删除身份，并终止旧绑定扫描；不得恢复以前的部署路径。A1/A2 已有同 ID 多绑定样本，当前规范受管目录的绑定必须优先于旧目录，不能由 `readdir` 顺序决定部署状态；回归同时覆盖排在规范目录前后的旧绑定。非字符串、null byte、空目标配非空项目根仍为非法输入。由 Agent 组负责该最小修复与真实 SQLite/文件的两次重开回归；数据组负责完整 ZIP、正常消费及 portable 恢复单测。该修复不变更 bundle schema，不完成 D3 权威转换。

历史来源样本仍限定为三个精确发布 commit 的 CLI/Core 默认初始化、正式 writer 和再次重开结果；不手写 Desktop authority/renderer 迁移 marker，也不把当前 schema 标记为旧版本。生成器、归档与来源校验由跨端组负责，历史样本仅是 D3 的输入证据。主协调在这些改动稳定后统一运行允许范围的静态和非 GUI 门禁，完整发布、GUI/发行包、D2 私密内容保护及 D3/D4 契约缺口继续分别验收。

2026-10-05 恢复中断后的排期：

- Prompt/AI 当前 42 项为 36 pass、1 not-run、3 blocked、2 unsupported；唯一非 GUI 待合并项 P28 依赖数据 D5，不能用内部残留 IO API 代替真实 ZIP 恢复。
- 数据组继续 D5 最终恢复断言。Plugin 路径迁移 7 项、正常 Plugin 14 项和 reconciliation 受影响单测已有通过证据；完整恢复仍须核对目标秘密文件字节、选中设置及 Rule 文件名，未判定通过。所有修复在候选内完成，同一 journal 发布，不允许事后补写。
- Agent 组当前 45 项为 31 pass、9 not-run、4 blocked、1 unsupported。下一批补真实会话分页导出、handoff 确认/失败后的 SQLite 状态及重开；系统选择器、剪贴板和 native launch 保留边界。MCP `checkServer/checkAllServers` 的当前实现是配置与本地环境诊断，不启动进程或执行协议握手；测试当前诊断合同，不能新增握手功能来填验收表。
- 跨端组准备 D3 历史样本，独占 `packages/core/tests/fixtures/historical-runtime/` 与 `historical-runtime-fixtures.test.ts`。使用本地已核实的 v0.5.9、beta.1、beta.2 精确源码运行初始化及领域 writer，生成隔离、非空、非秘密 profile，记录实际 schema、迁移、完整字段/版本/包字节和源码来源。旧 workspace imports 必须解析到同一历史源码，不能串用当前 schema；只复用兼容的现有第三方依赖。先验证三个旧版本全新 profile 的正常写入和重开；连续升级链及当前目标迁移另行验收。旧 runtime 若不能原样运行，保留具体阻塞，不改历史源码伪造来源。
- D3 仍按 foundation 既定领域转换与统一启动方案推进；样本生成不代表权威切换完成。D4 已再次确认自动同步依赖时间戳、尚无共同基线及条件 HEAD，不以当前不可变对象上传测试替代 causal sync 验收。D2 私密字段范围、GUI 授权及外部环境仍待明确；不影响上述本地非 GUI 批次继续。

当日补验：桌面 R01 由主协调执行现有 `apps/desktop/tests/unit/main/network-proxy.test.ts`，4/4 通过（22:26:08 Asia/Shanghai，619 ms，PID 87264 已退出）。命令为 `pnpm --filter @prompthub/desktop exec vitest run --project unit --minWorkers=1 --maxWorkers=1 tests/unit/main/network-proxy.test.ts`；使用已安装的 pnpm 9.15.0 入口。Electron setProxy 与 HTTPS request 被替换，断言进程内代理变量、request agent 和响应正文，不连接真实 7890、不修改系统代理。此证据覆盖报告 R01 的局部边界，GUI/真实网络仍未验收。

文档验证：`spec-governance.test.mjs` 5/5、`generate-spec-change-index.mjs --check`、`validate-change-traceability.mjs`（16 changes）及 `git diff --check` 通过。默认 pnpm 11 的版本切换因离线签名获取失败，最初 `pnpm spec:test` 未执行；随后直接使用现有 pnpm 9.15.0，分别通过 `pnpm exec node` 执行上述三个正式子命令，没有安装依赖或禁用校验。当前权限策略拒绝向桌面会话发送 R01 后续消息，该次派发未成功；不据此扩大其他会话授权。

历史样本范围复核：两个 beta 的空根 Core initializer 默认产生 `database-catalog`；Desktop 的 canonical startup 还要求真实 renderer 迁移完成及 checkpoint publication。因此本批三个样本限定为精确旧版本 CLI/Core 默认初始化来源，不手写 authority/迁移 marker。beta MCP library 无 bundle history 属于本样本未覆盖，不能推断整个产品不支持。Desktop canonical 来源样本另批经正式启动服务生成。此决定已记录，但向跨端会话发送该决定的工具调用同样被当前审批策略拒绝，尚未送达；该会话已停下 beta 部分等待边界明确。

D5 补充：数据组已报告选中/未选设置、本机 vault 字节及 EIO 回滚 3/3 通过；完整 ZIP 随后在 detached Rule 的空 `targetPath` 转换处失败。主协调独占修正 `packages/core/src/rule-resource-schema.ts` 的 `portableRule`：当前 DB 空路径在这个输入边界收敛为缺省 placement，不回退到旧源路径；非空路径校验不变。新增两个 detached 往返用例和控制字符拒绝/无产物用例，原五项保持。第一次 6 pass / 2 fail 是新用例错误期待缺省 `projectRootPath` 为 null；核对既有 document writer 仅在部署目标存在时输出 placement 后，改为明确 undefined。仅重跑受影响两个用例通过（22:30:22），其余六项沿用先前结果，不合称一次 8/8。两文件定向类型和 lint 通过；最初临时 tsconfig 位于系统 tmp 导致 Node types 解析失败，改用 Core 内独占临时 config 后通过，文件已删除。该修复不改变 schema 版本或历史读取，不需要持久格式迁移；撤销会重新暴露 detached 恢复失败。完整 D5 四项及现有 restore 单测由数据组继续验证，尚未判定完整通过。

22:34 后续阻塞：完整 ZIP 首次恢复与正常消费通过后，第二次 startup 在 `canonical-rule-db.ts` 的 `readProjectPlacement` 拒绝由 `hydrateWorkspace` 写入的未部署项目绑定（空 targetPath、null projectRootPath）。此项仍为 D5 红测，未修改对应源码。修复应保持项目 metadata 的列表/删除身份，明确区分无部署目标与非法路径，不得删除 metadata 来跳过校验。Agent、数据、跨端三个会话均已中断；继续派发 Rule 修复的消息再次被工具审批策略拒绝。停用 `prompthub` 定时检查的请求也被同一策略拒绝，故定时检查未停用。恢复协作需解决工具权限；尚未执行完整候选门禁，不具备发布结论。

- [x] 确认只验收现有功能，记录工作区基线与独占分工。
- [x] 列出 root release harness：8 个产品 surface；quick 检查已分批执行或复用未变范围证据，完整 release profile 未执行。
- [x] 创建 5 个领域对话并启动第一轮非 GUI 验收。
- [x] 计划文档检查：`pnpm spec:test` 通过（5 项治理回归、索引一致性、16 个显式追踪 change）；`git diff --check` 通过。这些结果不代表产品功能通过。
- [x] 汇总各组实际入口清单；明确本地已测、GUI/原生/账号未测和不支持范围。
- [x] 审查各组用例有效性、实际测试文件、门禁发现情况与关键断言的失败证据。
- [x] 完成当前现有功能测试补充与最终结果汇总；真实产品失败保留回归，本轮不实施产品修复。
- [ ] 明确 GUI 授权和可用原生平台，完成隔离窗口及安装包验收。
- [ ] 固定最终候选，统一执行发布门禁并给出发布判断。

已知文档冲突：`spec/releases/0.6.0.md` 的历史 file-first 描述与 foundation 当前 SQLite 结构化数据所有权不一致。数据组须按现行 foundation 契约核对实现并记录具体冲突；不能由测试报告发明第二种存储模式。版本提升计划仍负责版本号对齐，本计划不替代它。

测试对话（local，同一 checkout）：

| 对话 | ID |
| --- | --- |
| 现有功能验收：Prompt 与 AI | `01a10637-aac5-7da2-acf8-4c8d57de1ce8` |
| 现有功能验收：Agent 与资产管理 | `01a10637-e444-7b72-a191-02437734a3af` |
| 现有功能验收：数据迁移与备份恢复 | `01a10637-e7be-70d3-8adc-6a73b99438bd` |
| 现有功能验收：CLI、Web 与 Worker | `01a10638-287c-78c3-82bc-62276ec09a69` |
| 现有功能验收：桌面体验与发布覆盖 | `01a10638-2b3c-79d2-ae61-03377dd0cd6c` |
