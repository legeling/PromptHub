# 桌面体验、Mobile 与发布覆盖：分轮结果

## 2026-10-15 隐藏运行与 AI 界面闭环

- 默认 Electron E2E 使用现有 `--hidden` 路径；macOS 仅在 E2E profile 中使用 accessory 激活策略。未改变日常配置、业务持久化或窗口显隐合同。`hidden-launch.spec.ts` 在真实设置导航、重载之后检查原生窗口不可见且 show/focus 事件均为 0；定向 2/2 通过，同时包含 AI 全流程。
- 三项 `@native-window` 场景必须显式设置 `PROMPTHUB_E2E_HEADED=1`：本地显隐快捷键、隐藏启动后恢复 WebDAV 同步、可见启动后创建 self-hosted 自动备份。当前默认选中 43 项，完整集合为 46 项、31 个 spec；两种模式的收集检查均通过。原生专项本轮未执行，不能声称全部 46 项通过。发布 CI 已在既有 `xvfb-run` 步骤显式启用它们；未实际运行远端 CI。
- 新增 `prompt-ai-lifecycle.spec.ts`：通过界面配置供应商/模型、测试连接、生成并保存文本 Prompt，检查 HTTP 401 和无效 JSON 响应的数据保全与重试，关闭重开后读取结果并复用模型再次生成。模型服务是临时 loopback HTTP fixture，真实 renderer/preload/IPC/SQLite 保持不变；没有调用真实供应商或付费模型。详细证据见 [Prompt 与 AI 记录](prompts-ai-results.md#2026-10-15-隔离-electron-ai-全流程)。
- 启动选项单元 4/4、两种模式收集 integration 2/2、Desktop `typecheck:tests`、触及文件 ESLint、相关格式检查、三段生产构建通过。收集检查首轮误以为文本 `--list` 会输出标签，修正为检查具体用例名称后通过，没有放宽筛选边界。发布 workflow 已解析核对 Xvfb 命令和显式 headed 环境变量。
- 首轮隐藏集合 43 pass / 1 fail：自动备份正确记录 `Skipped because the app window is not active.`，而该旧用例要求可见启动后成功；将其保留为原生专项，不修改产品或业务断言。校正后默认集合最终 43/43 pass，0 fail / 0 skipped / 0 flaky、零重试，31 个 spec，268.562 秒（北京时间 2026-10-15 11:05:49 开始）。测试进程及 AI profile 已释放；未保留服务。
- 验证使用脏工作区的隔离源码副本，复用现有依赖；最终运行前，1,396 个产品源码/共享包/E2E 文件与当时工作区逐一一致，SHA-256 为 `55418f40d5dfde9be4f7a5ca8d971201e40b569c8b5ef1d194a838cee9f3d167`。既有其他改动只作为验证基线，不纳入本批提交；运行期间新出现的 MCP 并行改动未同步到副本，也不属于本轮验证结果。
- 隐藏执行支持独立提交 `096d3770`，AI 界面流程独立提交 `e03fedee`，均未推送。共享 `app.spec.ts` 只提交本次三处窗口标记差异，保留已有持久化测试修改。临时源码副本和日志已移入废纸篓，可恢复；测试 profile 已清理，没有保留窗口、监听服务或测试进程。

重跑默认隐藏集合（隔离源码副本中的 desktop 目录；已完成构建）：

```sh
PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test --workers=1 --retries=0 --global-timeout=900000 --trace=retain-on-failure
```

`PLAYWRIGHT_CHANNEL=chrome` 仅让两个普通浏览器布局测试复用已安装 Chrome 的临时会话，不访问日常浏览器 profile。这里的隐藏集合不覆盖原生可见窗口、真实供应商、跨平台、安装包及根 release harness。

## 2026-10-14 全量 E2E 补充（44/44 通过）

本节优先于下方 2026-10-09 的历史 GUI blocked 矩阵。当前授权仅覆盖隔离测试窗口；不操作日常 profile、Agent 配置、凭据或原有服务。

- 收集回归：6 个 spec 的 Core barrel 导入改为具体子入口；新增正常 integration 门禁执行 Playwright `--list`，核对所有 spec 均进入集合。独立提交 `dc3e9153`。
- 隔离：Electron 与本地 Web 服务只继承启动必需环境，HOME/XDG/APPDATA 指向临时 profile；不继承 Agent root、API key 或开发服务器配置。MCP 仅替换 OS keyring 传输到该 profile，AES-GCM、SQLite、版本文件及目标分发仍使用产品实现。原生钥匙串互操作不属于本次证据。
- 基线：macOS 隔离源码副本、单 worker、零重试，42 项实际执行为 27 pass / 15 fail。布局用例复用已安装 Chrome 的临时会话。初始化失败的前一轮不计业务结果。
- 旧断言校准：MCP 当前定义/绑定/加密凭据读取 SQLite，历史仍检查文件；Plugin 目录名复用规范编码；商店 fixture 写入当前 source 持久化入口，导入和更新经过审阅确认并核对完整包文件；退役 Gemini 不再作为可选 UI 平台，规则创建/历史使用受支持的 Codex，Cursor 保留原生会话投影断言。Kimi/Qwen Provider 按现有 registry 的 `enabled: false` 验证禁用入口，不更改产品能力声明；Codex/OpenCode Provider 保留真实本地 HTTP 探活、模型回复和配置激活流程。
- 新增核心场景：Prompt 通过 UI 创建目录/内容、编辑、历史恢复、重开、取消删除和确认删除；设置通过 UI 导出 ZIP、取消导入、确认恢复并重开核对。测试中的长流程保留线性顺序与一个 `finally`，避免把同一资源生命周期拆散；纯读回及重复操作提取为小 helper。
- 产品修复：主题在主进程设置加载完成后应用；Claude 根目录编辑使用平台已定义的 configured-root MCP 路径，不把默认 home 父级路径作为用户覆盖提交，任意 `../` 覆盖仍被拒绝。无 schema/格式迁移，回滚为对应源码提交；不修改既有用户设置。分别由真实重开场景及 adapter 合同测试/Agent UI 保存重开验证。
- 恢复边界：portable restore 关闭当前数据库后要求重启；E2E 禁用操作系统自动 relaunch，因此测试显式关闭再启动同一隔离 profile 后读回，不能在旧进程继续访问已关闭连接。原生文件选择器仅替换返回路径，ZIP 创建/预览/应用、数据库、媒体与包文件均为真实实现。
- 规模与资源：44 个用例顺序运行，最多一个 Electron 测试实例；fixture 为小型合成包和本地 HTTP 服务，不访问日常数据/凭据，不新增依赖。MCP 凭据 readback 使用项目 DB adapter 且立即关闭；keyring 替身的求值函数保留在同一 Electron 闭包内以避免跨进程捕获，生命周期由测试 profile 管理。

### 功能流程覆盖与缺口

| 领域 | 当前可执行入口 | 本轮验收边界与剩余缺口 |
| --- | --- | --- |
| Prompt / Folder | 新增 `prompt-lifecycle`；已有 table / backup-continuity | 创建、编辑、版本恢复、删除取消/确认、主题与重开；私密文件夹密码、完整关系图/批量操作、全部媒体流程仍缺 UI 闭环 |
| Skills / Store | create-structure、agent-skill-lifecycle、local-store 两组、Qwen Work | 包清单、版本、导入更新、同名变体、分发重开；公网 Git/Gitea/商店账号未验 |
| MCP | lifecycle 两组、Pi、market-return | 输入拒绝、脱敏、SQLite/历史、目标覆盖确认、外部编辑、移除与重开；真实 MCP server 启动与 OS keyring 未验 |
| Plugins | lifecycle、Antigravity | 原生包导入、完整文件树、分发、重开与删除；公网插件市场授权未验 |
| Rules | missing-file/history、conflict-scroll | 显式创建、编辑、恢复草稿不提前写目标、重开、冲突布局；所有平台格式组合未穷举 |
| Agents / Providers / Sessions | workspace、settings、provider-workbench、session-search | 原生隔离配置、Provider 生命周期与加密失败、搜索项目身份；真实账号探活/额度、原生 CLI 更新未验 |
| Backup / Sync | backup-restore、新增 backup-settings-flow、self-hosted-sync | 真实本地 ZIP 与本地 HTTP 服务；WebDAV startup 用替身，S3/WebDAV 真实远端、跨设备冲突恢复未验 |
| Settings / Shell | app、Prompt theme/reopen、topology/layout | 导航、快捷键显隐、隐藏启动、布局；七语言完整路径、OS 登录项/通知/托盘、签名安装升级未验 |
| AI 工作流 | 既有 integration transport/workflow | 本轮尚无从模型配置到生成保存重开的完整 GUI 用例；不得用本地 HTTP 集成称作真实供应商验收 |
| CLI / Web / Mobile / 跨平台 | 各自独立门禁 | 此处“全量”仅指 Desktop `playwright test` 全集合，不代表上述产品或 Windows/Linux 发布验收 |

### 最终验证

- Desktop 全量 Playwright：29 个 spec、44/44 pass，0 fail / 0 skipped / 0 flaky；单 worker、`--retries=0`，耗时 4.4 分钟。包含 2 个新增核心闭环。此前 27/42 和 37/44 为修复过程基线，不与最终计数相加。
- Desktop 三段生产构建通过；标准 `typecheck:tests` 通过；本轮修改文件的 ESLint 通过；adapter 单元 8/8、启动隔离单元 3/3、E2E 收集 integration 1/1 通过。未重新运行整套 unit/integration 或根 release harness；本节不声明安装包和全产品发布验收。
- 执行来源为当前脏工作区的隔离源码副本，复用现有 pnpm 依赖，不重装。最终运行前核对 1,456 个产品源码/共享包/E2E 文件与工作区一致，SHA-256 为 `059af541d93869dd475ebf070eb3d8eafb6007ecf08189fbfbe721f6d7fd511e`。其他既有改动作为当前运行背景保留，不纳入本轮提交，也不将其正确性归属本轮。
- `PLAYWRIGHT_CHANNEL=chrome` 仅让两个布局用例复用本机已安装的 Chrome 二进制和临时会话；Electron 场景仍使用项目 Electron。未下载浏览器、未访问日常 Chrome profile。
- 结束核对：产品源码/E2E 指纹保持不变；无本轮 Electron、浏览器或本地 Web 残留进程。测试 profile 随 fixture 关闭清理，隔离源码副本及原始 JSON/截图/trace 移入废纸篓可恢复；不保留开发服务器，不清理用户原有产物。

独立提交（均未推送）：`dc3e9153` 收集门禁、`610ec012` 隔离与资源生命周期、`eb53287b` Claude 根目录修复、`b3cb3d6c` 主题重开修复与 Prompt 闭环、`62deafbc` 现行合同回归、`ee004c17` 设置 ZIP 恢复闭环。其他既有工作区改动未纳入这些提交。

实际全量入口（隔离副本 `apps/desktop` 为工作目录；JSON 报告写临时目录）：

```sh
pnpm build
PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test --workers=1 --retries=0 --global-timeout=900000 --trace=retain-on-failure --reporter=list,json
```

后续覆盖优先级：先补 AI 从配置到生成/保存/重开的完整 GUI 场景、私密目录与媒体编辑；真实远端同步、OS keyring 和各 OS 安装升级需各自隔离环境/账号，不能用当前全绿结果替代。

当前状态：现有功能测试补充已完成，产品缺陷保留有效红测。2026-10-09 主协调最终合并检查：Desktop 单测八个独立 shard 共 5,799/5,799 通过；集成首次 209 pass/7 fail，两个环境或等待误报复核通过后，216 个不同用例为 211 pass/5 fail。正式 unit 门禁仍按集成依赖 blocked，不能用独立单测诊断改写。标准测试类型、lint 和行数门禁通过；性能预算通过。完整 ZIP 联合恢复新增两个真实失败，原 D5 4/4 仅保留其已测范围。构建、GUI 与原生验收未执行，不能据此批准发布。当前矩阵优先，以下历史结果保留当时状态。

## 当前非 GUI 主证据矩阵

截至 2026-10-09 的报告校准：**16 组 pass，0 fail、0 not-run、0 blocked、0 unsupported**。这里每行只声明已经执行的具体低层边界，未执行层另列；不是全部功能或发布通过率。本组 D1–D3 已修复，首轮红测仅保留为历史证据；此处编号不代表数据组 D2–D4 已完成。所有结果沿用已接受的实际运行，没有因本次编辑新增测试结果。

| ID / 功能 | 实际入口与操作/预期 | 当前证据 | 状态及结果 | 替换或未测边界 |
| --- | --- | --- | --- | --- |
| E01 设置和通用组件 | render→用户事件→store/DOM；导航 lazy、壁纸失败、焦点和 toast | 首轮组件集合；第四轮 shell/settings 修正；close-dialog 最后 11/11 | pass | jsdom 与 mock bridge；真实布局、OS 和完整 GUI 未测 |
| E02 语言恢复 D1 | version 19 无效/缺失语言及 version 20 缺失语言，由 main 有效语言恢复，其他偏好保留 | settings-language 最终 14/14；第四轮显式 legacy 环境后包含于 80/80 | pass，D1 已修复 | main IPC/i18n mock；普通 Electron 启动及原生菜单一致性仍归 G08 |
| E03 托盘逻辑 | 创建命令、显隐、图标资源、语言和 update 菜单生成 | 首轮 tray-* 76 项 | pass | Electron/nativeImage/menu/window 替换；部分图标文件真实只读，原生托盘未测 |
| E04 更新与安装编排 | updater IPC 候选选择、失败与恢复、更新结果；本地 changelog/SemVer；安装安全分支 | updater 21、元数据 7、本地 changelog 7、updater-install 6、NSIS 配置 5；第四轮记录 | pass | HTTPS/native updater/备份 mock；移除无效公网 HEAD 用例，不证明产物下载、签名、实际安装 |
| E05 workspace/startup/外观状态 | 模块显隐/重排、close action、startup folder、宽度、后台策略 | 首轮 stores/hooks 与 main settings-startup；第三轮 53 项及第四轮 80 项中对应回归 | pass | store/DOM 与内存 SQLite 层；不能代替 OS 登录项、布局或真正启动 |
| E06 renderer persistence dirty baseline | 旧缓存仅迁源配置，文件重开；坏 JSON 保留及失败重试 | 首轮既有 renderer-persistence 13 项 | pass，原有脏状态运行记录 | Core 文件持久化 + mock IPC；本组未修改原脏文件，也未在并行候选上重新验收 |
| E07 Mobile 既有逻辑 | SQL CRUD/旧无版本表/未来版本拒绝/坏 metadata、过滤、tab、alerts、初始化 | 第三轮 Mobile 7 文件 36/36 中的原有 20 项 | pass | CRUD 内存 SQLite，Expo/native alerts 部分 mock；实际路由/设备未测 |
| E08 Mobile 类型 | Expo/TS 配置下包含新增持久测试和资源 | 第三轮 Mobile typecheck | pass，exit 0 | 无 Metro、bundle 或 native build |
| E09 Mobile 磁盘重开 | 产品初始化→创建→重开/过滤/更新→删除；重复写/缺记录/真实 SQL 故障保全与重试 | release-acceptance-desktop-release-mobile-storage.test.ts 4/4，包含于 Mobile 36 项；早期独立脚本作历史补充 | pass | app database/schema/repository 真实；仅 Expo native driver 替换为 Node 磁盘 SQLite，设备 driver 未测 |
| E10 Desktop 七语言设置键 | 7 个设置源码的 166 个直接 t() 键在 7 份 JSON 存在 | 首轮 locale-audit 静态抽样 | pass，7×166 无缺失 | 不覆盖动态键、其他业务、翻译质量或布局 |
| E11 Mobile 七语言 D2 | 实际页面字面量/导航键经 app i18next 解析，必须命中选中语言；保存失败文案使用目标语言 | Mobile locale 持久测试最终 12/12，包含于 Mobile 36 项 | pass，D2 已修复 | 7 语言解析 + 5 个错误原文；无屏幕布局、动态键完整性或系统 locale 自动识别证据 |
| E12 Mobile 存储声明 D3 | 实际持久化重开后声明 SQLite | storage 测试 D3 用例先写入重开，再断言 durableStorage=sqlite | pass，D3 已修复 | 与 E09 同一文件，不重复计用例；设置原生画面未测，未扩展 deferred 能力 |
| E13 Desktop 设置磁盘恢复 | preload→注册 settings IPC→canonical 文件/SQLite；重开、非法输入不部分保存、真实 SQL trigger 回滚后重试 | release-acceptance-desktop-release-settings.test.ts 3/3 | pass | 真实存储/业务链；Electron 运输/home/proxy 替换，无整个应用 GUI 重启 |
| E14 快捷键文件生命周期 | setMode 写入独占临时目录，重新加载真实模块读回规范化值 | main/shortcuts.test.ts 4/4，包含于第三轮 53 项 | pass，固定 tmp 隔离缺口已修复 | 真实文件与新模块；快捷键注册/window mock，实际聚焦/失焦热键归 G12 |
| E15 移交的备份/同步测试 | 现行统计/backup result/mock API 合同；真实 DOM File/change；legacy 与 canonical 前提隔离 | 第五轮 11 文件最终 102 个不同用例均有通过结果；首次 101/102，受影响文件最终 21/21 | pass | 组件/renderer 编排及 mock 数据库/远端；不证明真实 portable ZIP、数据 D5 或 P28 |
| E16 Desktop 本组范围静态检查 | 现行 production API 下的 fixture 类型及 lint | 第四轮 shell/settings 和第五轮 11 文件范围类型 0 诊断；对应 lint 通过 | pass | 本行仅各次明确的入口及依赖图；完整标准测试类型现已通过（R03），旧 297/106 失败保留为历史，不代表统一测试通过 |

## 已接受批次与计数规则

| 批次 | 实际接受结果 | 计数边界 |
| --- | --- | --- |
| 第二轮 Desktop 设置持久测试 | 3/3 pass | 单独的磁盘/IPC 链；第二轮 Mobile 红测后来在第三轮修复，不把第二轮 8/14 再加一次 |
| 第三轮 D1–D3、快捷键及安装逻辑 | 最终 96 项：Desktop 53 + changelog 7 + Mobile 36；Mobile typecheck 与 Desktop 定向 lint 通过 | 53 项中的语言文件修正 fixture 后 14/14；Mobile 36 已含旧 20、storage 4、locale 12 |
| 第四轮 shell/settings/updater | 定向 13 文件 136/136；共享 helper 完成后 settings 13 文件 80/80、0 unhandled errors | 两集合有重叠，不相加；sidebar 单例与最后 close-dialog 11/11 是受影响复测，不新增分母 |
| 第五轮移交的备份/同步测试 | 11 文件、102 个不同用例最终均通过；范围类型/lint 通过 | 首次 101 pass/1 fail 后仅受影响文件 21/21；不记为 123，也不与其他批次简单累加 |
| 首轮未被后续替换的低层证据 | 托盘、Desktop 设置静态键等按 E03/E06/E10 保留 | 首轮 358/359 是历史运行总数，不能与后续集合累加或作为当前整体结论 |

## 当前 GUI 与原生矩阵：29 组 blocked

以下为 **GUI/原生层的 29 组必验场景，全部 blocked**（尚无 GUI 控制授权；也未生成固定候选安装包）。“已有证据”只对应 E01–E16 的低层验证；不能改变本表状态。每组中的顺序动作均须完成，不是仅检查页面能打开。所有写操作使用隔离 profile，检查 SQLite/受管文件，再 reload 和退出重开，核对列表/详情/计数/选择一致性。

| ID / 功能平台 | 真实入口与场景、预期结果 | 现有测试或缺口 | 状态 |
| --- | --- | --- | --- |
| G01 Desktop 六模块导航 | `SidebarRail` → Prompt、Agent、Skill、Rules、MCP、Plugin → Settings → 返回；正确激活、标题/二级面板一致，首次 lazy 打开可操作 | `DesktopAppCommandBridge`、settings-page 组件通过；完整 rail 循环缺 GUI 用例 | blocked |
| G02 模块显隐顺序 | 外观 → 模块开关/拖拽；至少一个可见，隐藏当前模块回退，去重未知值，重开保留自定义顺序 | settings-desktop-workspace 16 项；无真实拖拽/reopen | blocked |
| G03 布局与尺寸 | 顶栏收起/展开二级面板，拖动 sidebar/list 分隔线，重置；主内容释放空间，最小/窄窗口可用，重开恢复宽度 | ui-columns 18 项；实际布局未测 | blocked |
| G04 一般启动项 | GeneralSettings → 开机启动、最小化启动；OS 登录项读回，首次/第二次启动显示状态正确 | general-settings、settings-startup（store/main）；原生 OS 未测 | blocked |
| G05 启动文件夹 | 设置 default/last/pinned，选择有效目录；切换/删除目标后重开，恢复一次，失效有提示 | settings-startup-folder、use-startup-folder-restore；mock folder fixture | blocked |
| G06 编辑与行为偏好 | 自动保存、行号、剪贴板快速导入、单/多标签模式、Agent 历史加速；设置后对应消费者行为变化且重开保留 | general-settings 组件仅覆盖部分开关；实际消费者由业务组接续 | blocked |
| G07 通知 | 总开关、复制通知、保存通知；对应成功/失败动作只出现正确反馈，关闭后不显示成功提示 | toast/general-settings 局部；系统通知/焦点未测 | blocked |
| G08 七语言 | en/zh/zh-TW/ja/fr/de/es 各切换；设置、模块、菜单、弹窗、空态/错误无裸键、布局不裁切；重开 renderer 与 main 菜单一致 | 166 设置键齐全；D1 修复后语言回归 14/14；tray 字典通过，原生重开未测 | blocked |
| G09 主题字体动画 | light/dark/system、系统外观切换、预置/自定义颜色、字体大小、normal/reduced/system motion；可读对比度与焦点可见 | appearance、motion-primitives、settings-appearance；无视觉/系统变化证据 | blocked |
| G10 壁纸 | 选择合法图片、取消、替换、开关、透明度/模糊；保存失败保持原图并提示，重开正确 | appearance/background-image/backdrop；原生 picker、实际文件/媒体协议未测 | blocked |
| G11 网络设置 | system/direct/manual，HTTP/HTTPS/SOCKS5、主机端口认证、镜像源；设置读回，用可控本地服务验证消费者遵循选择 | network-settings/store 仅局部；不改变真实系统代理/VPN | blocked |
| G12 快捷键 | showApp/newPrompt/search/settings；配置、清除、global/local，冲突拒绝、保存失败回滚；失焦/聚焦及重开后生效 | shortcuts-settings/store 通过；main shortcuts 4/4 已用独占目录写入/重载，原生注册与触发未测 | blocked |
| G13 Windows 关闭选择 | X → ask，cancel/Esc；minimize/exit 分别记住/不记住；失败不退出、可重试；第二次启动应用已保存值 | close-dialog 11、settings-close-action 4；Windows 原生未测 | blocked |
| G14 macOS/Linux 窗口生命周期 | titlebar 最小化/最大化/fullscreen/恢复，macOS Dock activate，Linux 关闭/退出，菜单显隐与焦点 | title-bar 局部；main index 生命周期未启动 | blocked |
| G15 托盘与启动竞态 | 冷启动时点击 Prompt/Skill/MCP/Plugin 创建、Rule 管理、Quick Add、设置/更新；窗口恢复后命令不丢；退出释放快捷键 | tray-command-dispatcher/controller/menu、DesktopAppCommandBridge；`tests/e2e/app.spec.ts` 对应 lazy workflow（未运行） | blocked |
| G16 托盘图标/额度 | Template 16/32px、深浅模式、update 标记；7 语言原生菜单；loading、部分失败、刷新、额度/重置读数与 Agent 页一致 | tray-icon/menu/controller 纯逻辑及 mock；真实额度归资产组，禁止实际 provider 请求 | blocked |
| G17 后台恢复 | 最小化/隐藏启动暂停后台工作，托盘/快捷键/第二实例显示后恢复一次，无重复定时任务；退出后停止 | app-background 纯策略；`app.spec.ts` hidden WebDAV/showApp 场景未运行 | blocked |
| G18 更新常规与失败 | About 检查：开发禁用/无更新/可用/失败；stable↔preview 确认；发布说明/安全图片；下载指标、取消/换源/重试，无假状态 | updater 21、元数据 7、本地 changelog 7 与相关组件通过；HTTP/native updater/备份为 mock | blocked |
| G19 更新安装与数据 | 备份失败不继续；直接 macOS ZIP 更新并重启，Homebrew 不替换 Caskroom，Windows 升级快照/两次启动；旧数据数量字段不变 | updater-install 6/6 编排测试通过；真实快照/安装/重启仍未测，数据 D5 与原生包分层验收 | blocked |
| G20 数据/恢复设置全子页 | Settings → local/recovery/WebDAV/self-hosted/S3/backup；导航、loading、成功/失败、活动源 badge 与实际设置一致 | settings-page 与第五轮备份/同步组件通过；D5 原四项通过，非空 Provider/Generation 联合恢复有两个真实失败（R02），完整设置 GUI 未执行 | blocked |
| G21 Skill/模型/安全/CLI 设置入口 | 设置 Skill、AI、Security、CLI 各打开、返回、持久选择、错误反馈；创建/配置/鉴权由对应领域组给 fixture 并联验 | 本组未重复业务套件；CLI 安装不得写真实用户 bin | blocked |
| G22 全模块列表详情计数 | 每个模块从领域组 fixture 开始：空→创建/导入→搜索过滤→选中详情→更新→删除→reload/reopen；badge/count/title/内容同时一致；失败保留旧值 | 不以 selector 或 1 个模块代表其他模块；需合并业务组验收 | blocked |
| G23 可访问性 | 键盘 Tab/Shift-Tab/Enter/Esc，模态焦点陷阱/返回，危险确认，图标名称、aria-selected/pressed/progressbar，放大/高对比/屏幕阅读器 | modal/close-dialog/toast/settings 组件局部通过；实际布局、读屏未测 | blocked |
| G24 Mobile 四入口 | Expo Router 四 tab、Prompt stack、not-found，Android back/iOS navigation，横向/窄屏/安全区/键盘，主题跟系统 | tabs 2 项；未启动 Expo/浏览器/模拟器 | blocked |
| G25 Mobile Prompt 完整流 | 新建必填校验→保存→列表搜索/收藏/标签/recent→详情→编辑返回刷新→取消/确认删除→杀进程重开；loading/error/not-found | Mobile 36/36 含公开仓储磁盘重开 4 项；仅替换 native driver，Expo 实机/路由未测 | blocked |
| G26 Mobile 预览页与设置 | Skill 两个预览条目过滤、Store 三个预览源过滤、Settings 能力展示；不能把静态计数当真实安装/云连接 | 源码盘点确认 preview/static；D2 语言解析与 D3 sqlite 声明已修复并通过，原生显示未测 | blocked |
| G27 macOS x64/arm64 | 各自 DMG 首装、ZIP 升级、冷/热启动、正常退出；codesign/stapler/spctl、架构/元数据、旧版升级两次重开 | 配置有 DMG+ZIP 双架构；候选未构建，签名/原生运行均无证据 | blocked |
| G28 Windows x64/arm64 | NSIS 全新/同目录升级/自选目录/卸载；路径空格与 Unicode，数据保留，x64 稳定版 profile 连续两次启动 | windows-installer-config 5 项仅静态；release workflow 仅 x64 native smoke，arm64 需设备 | blocked |
| G29 Linux x64 | AppImage/deb 安装、执行权限/系统依赖、托盘/窗口、退出重开、升级与数据保留 | 有两种 target 配置；无 Linux 主机/候选运行证据 | blocked |

补充范围：Desktop 主导航实际默认顺序以 `settings-desktop-workspace` 合同为准（Agent 第二）；设置页面当前可见 general/appearance/data/network/skill/ai/shortcuts/security/cli/about 共 10 项，language 在 General 内，独立 LanguageSettings 还服务其他入口。CloudAccount 由能力开关隐藏，不把不可见项算已交付。托盘 Agent 管理属于独立导航命令，不从名称推断为新资产类型。

## 当前剩余、未支持与发布门禁

**16 项：2 pass、2 fail、2 not-run、4 blocked、6 unsupported**。与 E01–E16、G01–G29 存在同一能力的不同层，不合并分母或算总体通过率。R03 已执行，集成缺陷使整体 fail；R06 的完整 release profile 未执行，已完成的 quick 检查另列实际失败。blocked 明确授权、候选产物或外部环境条件。

| ID / 项目 | 状态 | 具体入口、缺少的证据与责任 |
| --- | --- | --- |
| R01 网络代理服务低层与启动读取 | pass | 原 network-proxy 4 项与新增 network-proxy-startup 5 项均在最终单测中通过。真实独占 SQLite/renderer 设置覆盖已迁移优先级、未迁移读取、缺行、坏 JSON 保全及重开；Electron session/safeStorage 与 HTTPS request 替换，进程环境恢复。coordinator-startup-proxy-results.json 保留首次 fixture 误用 undefined 与 adapter null 合同修正，coordinator-final-testing-results.json 记录最终八 shard。G11 真实代理连通性与 GUI 未验收 |
| R02 P28 公开 portable ZIP 及全域组合 | fail | 原 D5 四项在最终集成中仍通过，覆盖 Prompt/Folder/历史/关系、Skill/Rule/Plugin、媒体、选中域及 EIO 回滚。新增非空 Provider/Generation 同一 ZIP 恢复的两个正常用例失败：Provider model mapping ID 被重建，Generation bundle revision 从 4 变为 1，manifest hash 改变；业务字段、输出/CAS 字节和两次启动正常消费仍继续核对。失败回滚用例通过。详见 data-recovery-results.md 第六轮和 coordinator-final-testing-results.json；原四项不能扩大成完整全域恢复通过 |
| R03 完整 Desktop 类型/测试候选 | fail | 最终标准 typecheck:tests、Desktop lint 和行数门禁通过。集成首次 209 pass/7 fail；相同断言在规范短 TMPDIR 下复核两个额外失败通过，当前 216 个不同用例为 211 pass/5 fail，保留原批次结果。五个失败为私密存储两项、联合 ZIP 两项、Plugin 子 Skill 正常导入一项。正式八个 unit shard 按集成依赖 blocked；另外独立执行八 shard，5,799/5,799 通过，无 unhandled errors。页面等待复用项目 testTimeout，受影响检查单独记录，不修改业务断言或正式依赖 |
| R04 build 与 bundle budget | not-run | 主协调独占 build/out；固定候选 build 后执行 pnpm --filter @prompthub/desktop bundle:budget，缺当前构建与预算结果；无须 GUI |
| R05 large-data budget | pass | 现有 perf:budget 的 5,000 Prompt、2,000 Skill、20 次 selector 迭代七项预算通过，heap 14.053 MiB、RSS 123.859 MiB；Core 两项现有性能检查通过。仅修复脚本模块格式、类型入口及已安装 tsx loader，没有改产品 selector、依赖或预算。实际结果及初次入口失败保留于 coordinator-performance-results.json |
| R06 root release harness | not-run | quick 的 31 个 registry 检查已分批运行或复用未变范围证据：21 pass/2 fail/8 blocked，完整 release profile 未执行。Web 一项与 Desktop 集成失败保留；独立 unit 诊断不解除正式依赖阻塞。最终来源、候选 hash 和各层结果见 coordinator-final-testing-results.json。build/package/E2E 不属于当前测试批次完成结论 |
| R07 GUI/完整 E2E | blocked | G01–G29 对应界面/原生操作仍未执行，缺明确 GUI 控制授权与隔离候选运行环境；现有组件/selector/mocks 不解除此阻塞 |
| R08 Desktop 包原生验收 | blocked | G27–G29：缺固定候选包、各架构 OS 环境及安装/启动/升级/签名实际结果；本机 macOS arm64 不能代表 macOS x64、Windows 或 Linux |
| R09 Mobile 原生/浏览器运行与文件分享 | blocked | G24–G26：缺允许启动的 Expo/浏览器/设备环境与 GUI 授权；SQLite driver、路由返回/重开、documents/sharing 只有依赖或声明，未原生验收 |
| R10 远端更新产物与真实外部连接 | blocked | 缺固定发布版本/产物和目标环境的实际下载、签名、更新消费证据；此前无效 HEAD 探测已删除。真实 provider/账号/云盘写入还需相应授权，mock 元数据成功不代表外部服务可用 |
| R11 Desktop CloudAccount | unsupported | 当前 runtimeCapabilities.promptHubCloud 隐藏该入口，settings-page 验证不展示；不新增功能补分母 |
| R12 Mobile WebDAV/cloud sync/冲突恢复 | unsupported | mobile.md 明确 deferred；Settings 文案不代表已实现 |
| R13 Mobile Skill 包持久化/导入 | unsupported | mobile.md 明确 future change；现有静态预览操作归 G26 |
| R14 Mobile MCP 管理 | unsupported | mobile.md 明确 future change，当前导航无对应入口 |
| R15 Mobile Store 实际安装/真实缓存计数 | unsupported | 当前已盘点入口仅静态 source/featured 预览，没有实际安装链；静态计数不记为真实缓存/安装成果，预览页面本身仍归 G26 |
| R16 P41 残留内部 API | unsupported | 按主协调已确认结论：无 window.api.io 产品消费者，残留 ioApi 无 main handler，VERSION_DIFF 仅常量且未暴露。参见 prompts-ai-results.md P41；不新增 handler，也不据此免除 P28 公开 ZIP 链验收 |

当前测试补充已完成。R02/R03 的产品缺陷已由实际入口复现，本轮不实施产品修复。R04/R06 的 build 与完整 release profile 未执行；R07–R10 的授权或环境条件未满足，保留 blocked。

性能门槛引用 apps/desktop/bundle-budget.json 与 apps/desktop/scripts/check-large-data-budgets.ts。已通过的是 selector/内存实测预算，jsdom render-all virtualizer 不证明真实滚动流畅度。安装目标仍为 macOS DMG/ZIP x64+arm64、Windows NSIS x64+arm64、Linux AppImage/deb x64；没有 CI 或原生运行通过证据。

### 2026-10-09 协调证据边界

- 主计划与 `coordinator-focused-results.json`：标准 Desktop 源码/测试类型检查、Web 类型和文件行数门禁通过。Desktop 局部 52 项首次 51 pass/1 fail，修正 cache fixture 后仅受影响一项通过；不改写为一次 52/52 全绿运行。
- `coordinator-fixture-results.json`：原 9 文件 138 项首次 136 pass/2 fail；默认平台一项与会话缓存两项分批通过，finalChecks 标准测试类型与文档治理通过。JSON 顶层仍保留首次 failed 状态，最终结论须同时读取 correction/cacheContextCorrection/acceptance/finalChecks，不丢弃历史失败。
- `coordinator-network-recheck-results.json`：四个 Provider 本地 HTTP 文件 38/38，Prompt AI transport 与 WebDAV 集成 12/12，CLI README dev 单例 1 pass/7 skipped，均 exit 0。只补验合成本地服务和 UNIX socket；不证明代理服务器可用、真实账号或 GUI，也不将这些计数并入 R01。
- 最新 D5 4/4 的精确数据边界、源码 hash 与清理记录以数据报告为准；主协调统一门禁将验证后续合并状态。D2 两项正确行为红测、D3 权威转换与 D4 causal sync 不由这些局部结果关闭。

### 现有 E2E 与当前界面操作的映射（仅源码审阅，未运行）

下表入口统一在 `apps/desktop/tests/e2e/`。它定位可复用的既有断言，不改变 G01–G29 的 blocked；源码存在用例不等于已经执行或足以验收整组。

| 对应矩阵 | 精确现有测试 | 业务断言及仍缺的边界 |
| --- | --- | --- |
| G01/G15 局部 lazy 命令 | app.spec.ts:186，`opens lazy asset and quick-add workflows from main-process app commands` | main 命令打开/关闭 New MCP、New Plugin；Quick Add 的 AI Generate aria-pressed=true。不是六模块 rail 循环、实体创建或冷启动托盘竞态 |
| G12 局部快捷键 | app.spec.ts:158，`toggles app visibility from the local showApp shortcut` | local showApp 模式下 Alt+Shift+P 隐藏窗口，再显示窗口；未覆盖 global、冲突、保存失败、退出重开 |
| G17 局部隐藏恢复 | app.spec.ts:79，`delays startup WebDAV sync until a hidden launch becomes visible` | hidden 时 upload/stat=0，显示后 startup-resume history=success 且 upload/ensureDirectory>0；WebDAV 为 E2E 替换，不证明真实远端、只恢复一次或所有退出资源 |
| G03/G09 局部主题布局 | skill-asset-topology.spec.ts:58，`stays readable in light and dark themes at desktop and narrow widths` | light/dark class 及 1280/820 宽度下 topology 无横向溢出；仅 Skill topology，不覆盖系统主题、字体/动画、拖拽或整个 shell |
| G20 self-hosted 子页 | self-hosted-sync.spec.ts:273，`connects, uploads to, and downloads from a live self-hosted PromptHub Web` | Settings→Data & Sync→Self-Hosted，连接反馈、远端 backup summary、恢复后的 Prompt/Folder 及关系；隔离本地 Web 服务，不覆盖其他数据子页或真实账号 |
| R02/G20 的 Electron 局部链 | backup-restore.spec.ts:50，`exports and restores prompts, versions, media, and skill files through the real backup pipeline` | 通过 page.evaluate/E2E backup bridge，断言标题/备注/目录/版本、包文件、媒体字节及磁盘文件；没有点击系统保存/选择器，不是 G20 完整 GUI 或替代 D5 4/4 |
| G21/G22 Agent 局部设置 | agent-settings-dialog.spec.ts:19、73，`edits the selected Agent without navigating away` / `saves the Agent root and persists selection and pinning across restart` | 编辑/取消不离开选中 Agent；保存 root、selection/pinning 经重开保留。不是全部设置入口或全部模块一致性 |
| G22 Skill/Plugin 局部生命周期 | agent-skill-lifecycle.spec.ts:69，`creates, reads, updates, versions, distributes, restarts, and deletes a Skill` / agent-plugin-lifecycle.spec.ts:77，`imports, distributes, restarts, and deletes a local Plugin` | 创建或导入、分发、版本/更新、重开、删除后受管及目标文件清理，无关文件保全；不能代表 Prompt、Rule、MCP 或六模块全部搜索/计数/选择 |

G01 六模块完整导航、G02 显隐拖拽重开、G04 OS 登录项、G08 七语言原生菜单重开、G10 原生图片选择、G11 真实代理、G13–G14 原生关闭/窗口生命周期、G18–G19 安装更新、G23 完整键盘/读屏及 G24–G29 Mobile/跨平台安装仍缺该层已执行证据。已有局部组件用例保持原层级，不下调验收要求。

### 已补充的启动代理非 GUI 用例

`applyStoredNetworkProxySettings` 的启动读取缺口已在 `tests/unit/main/network-proxy-startup.test.ts` 补齐，五项在最终单测中通过。使用隔离根与真实 SQLite/renderer 设置，仅替换 Electron session/safeStorage，恢复进程环境，不启动 GUI 或连接真实代理：

1. canonical 迁移完成且 DB 留有不同代理值：入口应用 canonical 值，参数、环境与 request agent 一致；重开后仍使用 canonical。
2. 尚未完成迁移：真实 settings 表的合法 networkProxy 经启动入口应用；缺行/坏 JSON 采用现有正常默认行为，不能新增另一套 fallback。

以上只补启动编排和存储读取，仍不解除 G11，未改变存储/迁移合同或产品代理策略。startup-folder 的失效提示/一次恢复已有 hook 用例，未另列重复用例。

## 分轮执行历史

以下保留各轮运行时状态；当前状态以 E/G/R 矩阵为准，历史 fail/not-run 不代表修复后的当前结论。

## 第五轮：移交的 11 个备份与同步测试文件（2026-10-04）

Status: 本批修复、最终 diff 自查及定向验证已获主协调接受，ready。

### 范围与修复

主协调移交的 11 个文件在开始前均无 Git diff；本批只修改以下测试，不修改产品、共享 helper/config、4 个 main 恢复测试、原有 renderer-persistence 脏文件或 D5 实现：

- `apps/desktop/tests/unit/components/data-settings-backup-sync.test.tsx`
- `apps/desktop/tests/unit/services/backup-orchestrator.test.ts`
- `apps/desktop/tests/unit/services/database-backup-agent-runtime.test.ts`
- `apps/desktop/tests/unit/services/database-backup-skills.test.ts`
- `apps/desktop/tests/unit/services/database-backup.test.ts`
- `apps/desktop/tests/unit/services/self-hosted-backup.test.ts`
- `apps/desktop/tests/unit/services/self-hosted-skill-sync-reliability.test.ts`
- `apps/desktop/tests/unit/services/settings-snapshot.test.ts`
- `apps/desktop/tests/unit/services/sync-backup-core.test.ts`
- `apps/desktop/tests/unit/services/sync-backup-publication.test.ts`
- `apps/desktop/tests/unit/services/webdav.test.ts`

- 补齐现行 ImportSkippedStats 的关系、输出格式与 Rule 计数，以及 SelfHostedRemoteBackupResult 的身份、时间和版本字段。原有业务断言保持不变。
- 对共享 helper 生成的函数使用 vi.mocked 读取 mock 配置/调用；移除局部 Electron 桥接强制断言，复用 installWindowMocks 的完整当前 API。exportZip 入参直接使用实际函数合同，去掉重复手写类型。
- 文件导入用例捕获真实 HTMLInputElement 的 click，通过真实 File 与 change 事件触发产品处理，保留文件过滤、预览确认、错误提示和 SQLite 恢复候选断言，移除不完整 DOM 对象与 createElement 重载断言。
- settings-snapshot 的旧 LocalStorage 用例显式缺 canonical bridge；当前存储用例沿用完整 bridge 后只替换 get/replaceSettings。所有用例结束恢复原桥接。WebDAV/self-hosted fetch 与 crypto stubs、DOM spies 在结束时回收。
- 初次运行发现 database-backup 的旧 Store 源恢复用例隐式依赖缺 canonical bridge。共享 helper 补全后，产品按现行合同把持久源交给 main，不再复制到 LocalStorage。因此该既有 LocalStorage 场景明确删除 bridge 并在 afterEach 恢复；名称标注无 canonical persistence，保留三个 Store 的字段和数量断言，没有改变现行产品数据权威或新增兼容路径。

### 验证与证据边界

- 首次定向运行 11 文件：101 pass / 1 fail，共 102 项，exit 1。修复上述环境前提后，仅重测受影响 database-backup 文件：21/21 pass、exit 0。最终该集合的 102 项均有通过结果；没有把两次执行累加为独立用例，也没有重跑无关 10 文件。
- ESLint 首次 11 文件通过；最后针对 database-backup 与 WebDAV 格式变动的 2 文件通过，均为 --max-warnings 0。
- 范围类型检查保留 tsconfig.test.json 的原 compilerOptions，入口为 11 文件加 3 个现有 ambient .d.ts：0 诊断、exit 0。最终 database-backup 单文件及依赖图再次 0 诊断、exit 0。没有屏蔽 D5 或其他依赖诊断；本次没有出现边界外类型错误。未重跑完整 Desktop typecheck。
- 精确命令、起止时间、输出与退出码均保存：[测试记录](./desktop-release-handoff-tests.log)、[lint 记录](./desktop-release-handoff-lint.log)、[范围类型记录](./desktop-release-handoff-types.log)。初次失败与最终复测保留在同一日志。
- 这些用例运行真实 renderer 编排、备份转换或组件处理；数据库、Electron、远端 fetch 和部分加密边界采用既有 mock，不等于真实磁盘恢复、云盘、原生 GUI、加密实现或 D5 候选一致性验收。未新增或移除业务用例，未添加 any/as/压制诊断。
- 运行区间 2026-10-04 10:20:13–10:21:39 UTC，复用现有依赖，单 worker，检查串行；首次每命令上限 180 秒、复测 120 秒，输出上限 4 MiB。监督器 11261、11711 已退出，无服务器、监听端口、GUI 或独占临时目录，仅保留上述证据日志；无提交/推送。

## 第四轮：Desktop 测试类型与更新元数据（2026-10-04）

Status: 本组最终 diff 自查完成，ready，等待主协调综合验收；唯一全量检查仍是 297/106 的失败基线，不能据此声称当前全量通过。

### 最终 diff 自查补充

- 复核本组产品、测试、文档与证据边界后，补齐 close-dialog 测试的 settings.set 恢复：afterEach 恢复原桥接函数，避免缺桥接负例或自定义 mock 泄漏到后续用例。未改产品行为。
- 仅复跑受影响文件：`pnpm --dir apps/desktop exec vitest run --project unit tests/unit/components/close-dialog.test.tsx --minWorkers 1 --maxWorkers 1 --reporter verbose`，2026-10-04 18:12（Asia/Shanghai），11/11 pass、exit 0；随后该文件 ESLint `--max-warnings 0`，exit 0。
- 检查使用现有依赖、单 worker、每命令 120 秒上限和 1 MiB 输出上限；监督器 PID 5346 已退出，未创建临时文件、服务、端口或 GUI 会话。没有重复全量类型检查、构建或完整测试。
- 更正本报告 Core 诊断摘要为 TS2322，与原始全量日志及逐文件表保持一致。本组无已知剩余修复项；GUI、原生包与最终综合门禁仍属于未执行边界。

### 全量类型诊断基线

唯一一次全量命令 `pnpm --filter @prompthub/desktop typecheck:tests` 在 2026-10-04 09:56:11–09:57:45 UTC 执行，exit 2，**297 项诊断、106 个文件**。HEAD 为 `108f375bcd2c3e94c20d93dd619d641b6386b352`，共享 checkout 同时存在各组未提交修改；不能将这些诊断未经逐项比对就称为历史基线错误。运行使用已安装 TypeScript、120 秒 deadline 和 8 MiB 输出上限。

完整原始输出（包含诊断续行、命令、开始/结束时间和退出码）：[desktop-release-typecheck.log](./desktop-release-typecheck.log)。本轮不重复全量检查。

| 模块分配 | 诊断数 | 文件数 |
| --- | ---: | ---: |
| 共享测试设施（主协调） | 1 | 1 |
| Agent 与资产 | 157 | 63 |
| Prompt 与 AI | 81 | 13 |
| Desktop shell/settings（本批） | 20 | 11 |
| 数据与恢复 | 38 | 18 |

诊断代码计数：TS2339=71；TS2345=66；TS2322=55；TS2741=22；TS2554=22；TS2352=19；TS2353=14；TS2493=7；TS18048=6；TS2739=6；TS2740=4；TS2367=3；TS2698=1；TS2769=1。

共同根因与所有者：

- `tests/helpers/window.ts:536` 的 MockRecord 泛型使 createWindowApiMock 丢失完整 API 结构；主协调已独占该共享 helper，领域测试不得复制第二套桥接工厂。
- 多个测试用局部 get/set 替换整个 settings API，丢失 rendererPersistence 合同。本组改为在既有 fixture 上只覆盖 get/set；不手写空 rendererPersistence。其他域的 settings-ai-models 与 settings-snapshot 留归属组处理。
- PromptSummary 不含 userPrompt/systemPrompt/variables，时间戳使用 ISO 字符串；通用 Prompt fixture/summary 转换由 Prompt 组维护。Shell 列表仅提供真实使用的 summary 字段，无新增适配层。
- Agent provider/config/usage DTO 与旧 fixture 形状不一致；归 Agent 组按同一共享合同修正，不以断言掩盖。
- 备份 ImportSkippedStats、全量备份记录缺新实体字段，归数据组统一 fixture 真源。
- `packages/core/src/canonical-rule-db.ts` 有一项产品源 TS2322（完整位置见表），已交主协调/Agent 组；不属于本组修复授权。

### 各模块完整文件、位置及代码

模块归属为交主协调分配的建议，不改变已有所有权。以下位置固定为上述全量运行快照；后续编辑可能移动行号。错误消息和完整类型差异见原始输出。

#### 共享测试设施（主协调）

| 文件（绝对路径） | 诊断位置：代码 | 数量 |
| --- | --- | ---: |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/helpers/window.ts` | 536:5 TS2740 | 1 |

#### Agent 与资产

| 文件（绝对路径） | 诊断位置：代码 | 数量 |
| --- | --- | ---: |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/agent-sessions-panel.test.tsx` | 1299:56 TS2493; 1303:20 TS18048 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/agents-workspace.test.tsx` | 416:9 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/mcp-batch-deploy-dialog.test.tsx` | 72:5 TS2353; 82:5 TS2353 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/mcp-manager-store.test.tsx` | 1004:23 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/plugin-install-error.test.ts` | 21:7 TS2345; 35:9 TS2345; 44:77 TS2345; 54:9 TS2345; 60:9 TS2345; 70:7 TS2345; 85:9 TS2345; 97:7 TS2345; 113:9 TS2741 | 9 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/plugin-manager-detail.test.tsx` | 437:3 TS2739; 897:11 TS2353 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/plugin-manager-distribution.test.tsx` | 437:3 TS2739 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/plugin-manager-library.test.tsx` | 437:3 TS2739 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/plugin-manager-store.test.tsx` | 437:3 TS2739 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/sidebar-mcp-shell-tags.test.tsx` | 77:11 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/sidebar-skills.test.tsx` | 78:11 TS2352; 398:28 TS2352; 469:11 TS2352 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-detail-utils.test.ts` | 389:13 TS2367; 451:11 TS2367 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-file-tree.test.tsx` | 53:13 TS2741; 65:26 TS2741; 68:20 TS2741 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-i18n-runtime-export.test.tsx` | 311:13 TS2367 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-projects-view-import.test.tsx` | 125:31 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-projects-view-overview.test.tsx` | 125:31 TS2352; 677:31 TS2352; 827:31 TS2352; 926:31 TS2352 | 4 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-projects-view-targets.test.tsx` | 125:31 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-safety-i18n.test.ts` | 58:34 TS2345; 61:37 TS2345; 66:34 TS2345 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-store-custom-source-forms.test.tsx` | 92:29 TS2353 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-store-empty-source.test.tsx` | 91:9 TS2741 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-store-remote-catalog-actions.test.tsx` | 437:7 TS2698 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/use-agent-session-index.test.tsx` | 181:7 TS2322; 184:55 TS2493; 193:18 TS18048; 207:20 TS18048; 215:18 TS18048; 353:68 TS2493; 357:20 TS18048; 368:7 TS2322 | 8 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-codex-provider-migration-service.test.ts` | 37:3 TS2322; 90:5 TS2322 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-config-ipc.test.ts` | 201:54 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-conversation-db.test.ts` | 293:10 TS2339 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-conversation-ipc.test.ts` | 50:34 TS2740 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-copilot-model-config.test.ts` | 64:5 TS2353; 83:9 TS2353; 295:35 TS2554 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-gemini-provider-adapter.test.ts` | 582:15 TS2554; 597:23 TS2554 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-kimi-provider-adapter-boundaries.test.ts` | 292:7 TS2554; 327:7 TS2554; 343:7 TS2554; 386:7 TS2554 | 4 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-model-config-kiro.test.ts` | 116:7 TS2353; 128:11 TS2353; 139:35 TS2554 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-model-provider-adapter.test.ts` | 248:35 TS2554; 292:35 TS2554; 497:28 TS2554; 518:24 TS2554; 599:35 TS2554; 685:35 TS2554; 746:19 TS2554; 768:33 TS2554; 792:28 TS2554 | 9 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-pi-current-provider-import.test.ts` | 69:7 TS2353 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-provider-activation-ipc.test.ts` | 402:20 TS2339; 403:20 TS2339 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-provider-migration-ipc.test.ts` | 112:20 TS2339; 113:20 TS2339 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-provider-profile-ipc.test.ts` | 168:20 TS2339; 169:20 TS2339 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-provider-source-service.test.ts` | 323:35 TS2493; 388:36 TS2493; 388:49 TS18048 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-qwen-provider-adapter-boundaries.test.ts` | 298:7 TS2554; 345:7 TS2554; 374:7 TS2554; 386:7 TS2554 | 4 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-session-index-ipc.test.ts` | 89:34 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/agent-usage-antigravity-local.test.ts` | 407:41 TS2493; 508:7 TS2322; 562:7 TS2322 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/kimi-oauth-token-service.test.ts` | 399:31 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/plugin-library-marketplace.test.ts` | 703:7 TS2322; 753:19 TS2339; 764:26 TS2339; 896:7 TS2322 | 4 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/skill-canonical-file-ipc.test.ts` | 54:20 TS2345 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/skill-crud-ipc.test.ts` | 82:24 TS2769 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/skill-installer-install-sources.test.ts` | 114:30 TS2345; 162:30 TS2345; 213:30 TS2345; 269:30 TS2345 | 4 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/skill-installer-platform.test.ts` | 530:7 TS2345; 574:56 TS2345; 602:56 TS2345 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/skill-package-lifecycle-canonical.test.ts` | 110:35 TS2339; 110:59 TS2339; 140:52 TS2339; 149:49 TS2339 | 4 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/skill-package-lifecycle.test.ts` | 587:31 TS2554 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/renderer/agent-root-paths.test.ts` | 50:39 TS2345; 68:39 TS2345; 84:39 TS2345; 101:39 TS2345; 123:39 TS2345; 152:39 TS2345; 182:39 TS2345; 210:39 TS2345; 248:39 TS2345; 293:39 TS2345; 328:39 TS2345; 354:39 TS2345; 387:39 TS2345 | 13 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/agent-asset-domain-adapters.test.ts` | 239:11 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/agent-rule-platform-coverage.test.ts` | 20:36 TS2345 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/agent-terminal-launcher.test.ts` | 41:49 TS2493 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/rule-platform-order.test.ts` | 15:5 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/skill-safety-policy.test.ts` | 248:5 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/skill-scan-status.test.ts` | 237:9 TS2353 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/skill-source-resolver.test.ts` | 23:5 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/skill-source-update-reconciliation.test.ts` | 320:59 TS2345; 332:69 TS2345 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/agent-provider.store.test.ts` | 28:7 TS2353; 446:58 TS2345; 505:61 TS2339; 669:7 TS2741; 688:7 TS2741; 719:5 TS2322; 830:54 TS2345; 842:54 TS2345 | 8 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/mcp.store.test.ts` | 129:5 TS2322; 178:5 TS2322; 325:5 TS2322; 393:5 TS2322; 445:5 TS2322; 498:5 TS2322 | 6 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/plugin.store.test.ts` | 157:5 TS2740; 658:11 TS2322 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/skill-library-crud.test.ts` | 28:20 TS2345 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/skill-store-install-baselines.test.ts` | 732:24 TS2322; 737:37 TS2345 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/skill-store-source-update-failures.test.ts` | 722:13 TS2322; 893:7 TS2322 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/packages/core/src/canonical-rule-db.ts` | 130:5 TS2322 | 1 |

#### Prompt 与 AI

| 文件（绝对路径） | 诊断位置：代码 | 数量 |
| --- | --- | ---: |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/ai-settings-prototype.test.tsx` | 201:9 TS2353; 270:9 TS2353; 352:34 TS2339; 844:24 TS2345; 885:14 TS2345 | 5 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/ai-workbench-base-fields.test.tsx` | 156:9 TS2322; 170:9 TS2322; 199:9 TS2322; 232:11 TS2322; 262:9 TS2322; 296:9 TS2322; 315:9 TS2322 | 7 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/available-models-list.test.tsx` | 79:9 TS2322; 103:9 TS2322; 129:9 TS2322 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/folder-modal.test.tsx` | 61:47 TS2345 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/image-prompt-reverse-modal.test.tsx` | 98:11 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/prompt-card-layout.test.tsx` | 32:8 TS2741; 64:8 TS2741 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/prompt-detail-metadata.test.tsx` | 41:9 TS2741 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/prompt-modal-structure.test.tsx` | 282:27 TS2339; 362:27 TS2339; 438:27 TS2339; 497:27 TS2339; 581:27 TS2339 | 5 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/prompt-quick-rewrite-dialog.test.tsx` | 74:27 TS2339; 136:27 TS2339; 200:27 TS2339; 292:27 TS2339; 384:27 TS2339 | 5 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/quick-add-utils.test.ts` | 15:9 TS2741; 23:9 TS2741; 31:9 TS2741; 58:9 TS2741; 86:9 TS2741; 120:9 TS2741; 129:9 TS2741 | 7 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/ai-transport.test.ts` | 23:33 TS2339; 76:27 TS2339; 122:27 TS2339; 156:43 TS2339; 176:27 TS2339; 300:27 TS2339; 342:27 TS2339; 366:43 TS2339; 374:27 TS2339; 398:43 TS2339; 407:27 TS2339; 433:27 TS2339; 535:29 TS2339; 559:27 TS2339; 601:10 TS2339; 706:27 TS2339; 746:43 TS2339; 767:27 TS2339; 805:43 TS2339; 810:27 TS2339; 856:27 TS2339; 881:27 TS2339; 910:43 TS2339 | 23 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/ai.test.ts` | 429:27 TS2339; 477:43 TS2339; 491:27 TS2339; 530:27 TS2339; 571:27 TS2339; 697:7 TS2345; 726:7 TS2345; 754:7 TS2345; 777:7 TS2345; 796:7 TS2345; 815:7 TS2345; 834:7 TS2345; 854:7 TS2345; 905:9 TS2345; 923:9 TS2345; 937:9 TS2345 | 16 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/settings-ai-models.test.ts` | 27:7 TS2741; 78:9 TS2741; 87:9 TS2741; 420:7 TS2741; 491:7 TS2741 | 5 |

#### Desktop shell/settings（本批）

| 文件（绝对路径） | 诊断位置：代码 | 数量 |
| --- | --- | ---: |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/close-dialog.test.tsx` | 185:5 TS2322; 225:5 TS2322; 250:5 TS2322 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/settings-page.test.tsx` | 134:50 TS2345 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/sidebar-modules-rules.test.tsx` | 77:11 TS2352; 351:7 TS2322; 413:7 TS2322; 467:7 TS2322 | 4 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/top-bar.test.tsx` | 104:29 TS2352; 812:11 TS2352; 1093:11 TS2352 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/updater.test.ts` | 288:29 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/settings-close-action.test.ts` | 23:5 TS2322; 40:7 TS2322; 58:5 TS2322 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/settings-github-token.test.ts` | 29:5 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/settings-network-proxy.test.ts` | 17:5 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/settings-skill-safety-policy.test.ts` | 13:5 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/settings-startup.test.ts` | 23:5 TS2322 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/settings-sync-provider.test.ts` | 19:5 TS2322 | 1 |

#### 数据与恢复

| 文件（绝对路径） | 诊断位置：代码 | 数量 |
| --- | --- | ---: |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/data-settings-backup-sync.test.tsx` | 288:9 TS2739; 298:50 TS2345; 325:7 TS2345; 430:7 TS2345; 614:60 TS2345 | 5 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/components/skill-full-detail-async-actions.test.tsx` | 116:3 TS2739 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/canonical-storage-projector.test.ts` | 68:48 TS2345; 175:36 TS2345 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/canonical-storage-self-heal.test.ts` | 158:33 TS2345 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/cloud-ipc.test.ts` | 54:7 TS2322; 109:7 TS2322 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/file-authoritative-prompt-recovery.test.ts` | 65:35 TS2345 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/main/recovery-candidates.test.ts` | 415:28 TS2345; 457:7 TS2322 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/backup-orchestrator.test.ts` | 221:63 TS2345; 244:63 TS2345 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/database-backup-agent-runtime.test.ts` | 162:40 TS2339; 186:40 TS2339 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/database-backup-skills.test.ts` | 40:29 TS2339; 106:53 TS2339 | 2 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/database-backup.test.ts` | 287:29 TS2339; 293:36 TS2339; 300:40 TS2339; 758:29 TS2339; 764:36 TS2339; 765:40 TS2339; 921:31 TS2339; 1276:52 TS2339; 1377:52 TS2339 | 9 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/self-hosted-backup.test.ts` | 85:23 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/self-hosted-skill-sync-reliability.test.ts` | 95:23 TS2352 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/settings-snapshot.test.ts` | 218:7 TS2740 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/sync-backup-core.test.ts` | 587:39 TS2339 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/sync-backup-publication.test.ts` | 183:39 TS2339 | 1 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/services/webdav.test.ts` | 35:29 TS2339; 92:56 TS2339; 115:56 TS2339 | 3 |
| `/Users/lingxiaotian/Programs/personal/PromptHub/apps/desktop/tests/unit/stores/prompt-save-sync.test.ts` | 98:11 TS2353 | 1 |

### 本批最小改动与更新用例有效性

- 本组 11 个既有 shell/settings 文件对应初始 20 项诊断：保留完整 settings fixture，只覆盖所测 get/set；缺桥接、未发布 settings section 等负面用例用 Reflect 注入明确的运行时非法输入，保留拒绝/错误断言，不放宽产品类型。
- TopBar 与 Sidebar fixtures 使用 PromptSummary 和 Set；Plugin/MCP 选择由 appModule 表示，viewMode 使用已有 prompt/skill 合同。
- updater.test 的 direct macOS 下载用例原来把 options 当 IPC event；修正为 event+request 两参数，通过原 handler 运行，并保留下载结果断言。
- updater-real-scenario 仅保留 7 个有效本地 changelog/SemVer 用例，移除两条无效公网 HEAD 探测和误导性的产物可达声明。成功通道/notes已有 updater.test 覆盖，不复制 notes 用例。
- 新增 `main/release-acceptance-desktop-release-updater-metadata.test.ts`：真实 registerUpdaterIPC、元数据 JSON 解析与候选选择、公开 check 结果转换和错误返回；可控 HTTPS 事件与 native updater 响应仅替换外部边界。7 项覆盖 available true/false、HTTP失败后恢复、传输失败、坏 JSON、无预览候选、native manifest拒绝；失败必须 success=false，不被记作无更新/成功。没有公网、监听器或GUI，不证明签名、远端包可下载或原生updater本身。

### 第四轮验证记录

- 全量诊断是修复前的一次基线，297/106 未重跑、未宣称变绿。初始归类：Desktop 20、Agent 157、Prompt/AI 81、数据恢复 38、共享 helper 1。
- 13 个定向测试文件 136/136 pass、exit 0；完整命令与逐条结果见 [desktop-release-fourth-tests.log](./desktop-release-fourth-tests.log)。包含新增更新元数据 7 项和保留本地 changelog 7 项，无公网探测或 skip。
- 保持 tsconfig.test.json 原 compilerOptions，只将入口收窄为这 13 个测试和原 ambient .d.ts 的 TypeScript API 检查：2 诊断，本组 sidebar 的延迟 Promise 缺精确 RuleFileContent 返回类型，以及并行修改中的 Core projectRootPath unknown 类型。初始 20 项本组诊断均不再出现；此检查不是第二次完整 Desktop 门禁。
- sidebar 按共享 RuleFileContent 类型修正 Promise 和 resolver，删除旧类型断言；仅重跑该 stale-read 案例，1 pass，其他 14 项因 -t 未选择。该文件及依赖图最终类型检查 exit 0、0 诊断；Core 的跨域类型问题在所属组后续修改后也不再出现在该依赖图。全部定向类型输出见 [desktop-release-scoped-types.log](./desktop-release-scoped-types.log)。
- 主协调补全共享 window API 后，legacy LocalStorage 用例必须显式缺少 rendererPersistence。10 个对应设置文件在旧存储场景删除该 bridge，并在 beforeEach/afterEach 恢复，正常当前 API 保持完整；未改产品或放宽行为断言。这 10 个文件的定向类型检查 exit 0、0 诊断。
- 受影响 settings 集中执行 13 文件，80 个断言通过但发生 19 个 unhandled errors，**exit 1，不能计通过**。共同原因是共享 helper 的裸 settings.set vi.fn() 不返回 Promise，真实产品 .catch 访问 undefined；已交共享 helper 所有者集中修复，不能在每个领域复制默认桥接返回值。完整结果见 [desktop-release-fourth-settings.log](./desktop-release-fourth-settings.log)。
- 初始 13 文件 ESLint exit 0；后续 10 个 legacy settings 与 sidebar 的定向 ESLint exit 0。整批检查串行执行，每次最多一个检查进程；没有启动 GUI、网络下载、服务器或安装依赖。

- 主协调在共享 helper 修复异步默认返回后，最终受影响 settings 重测 **13 文件 80/80 pass、exit 0、0 unhandled errors**；初始失败输出与最终结果均保留在同一 settings 日志。此轮没有改变原断言。
- 本批 136 项与后续 80 项有重叠，分别报告，不累加为 216 个独立用例。
- 资源已回收：全量 typecheck runner 96175、定向测试 98865/99912/999/2578、定向类型 99101/338/1585、lint 99501/1894 均已退出；只保留报告引用的原始证据日志，独立 sidebar/lint 中间日志已清理。

定向类型检查复现方法：使用 Desktop 已安装 TypeScript 读取并 parseJsonConfigFileContent 当前 tsconfig.test.json；createProgram 的 options 原样使用 parsed.options，rootNames 使用指定测试文件的绝对路径加 parsed.fileNames 中全部 .d.ts；输出 parsed.errors 与 getPreEmitDiagnostics，不屏蔽依赖诊断。三次选择分别为本批 13 文件、修正后的 sidebar 单文件、显式 legacy fixture 的 10 个 settings 文件。旧文件完整诊断仍以全量日志为准，不把定向结果外推为整个工程通过。

## 第三轮：已授权缺陷修复（2026-10-04）

D1–D3 和 shortcuts fixture 按计划独占范围修复；以下结果覆盖前两轮对应的未修复状态，历史红测证据保留。D1–D3 均已修复并通过对应回归；本轮 96 个执行用例最终通过（Desktop 53 + changelog/version 7 + Mobile 36）。

- D1：现有 migrateSettingsState 对缺失/无效的原始语言去除规范化默认值，保留其他偏好；merge 继续使用既有语言有效性判断。无 schema/version 变化，无第二套持久化入口。既有 version 19 红测预期不变，补充 version 19/20 无语言偏好及不得提前回写 en 的断言。
- D2：补齐 zh-TW/ja/fr/de/es 的 32 个已发现界面键，以及同组 filters 资源；同时移除 workflow 对英文/简体中文的展开继承，提供各语言错误、校验、placeholder 文案。新增 5 个保存失败原文断言，防止对象展开掩盖跨语言文案；保留真实 i18next 解析测试。
- D3：durableStorage 实例值改为 sqlite，保持已有类型和其他能力边界；SQLite 文件、schema 和仓储均不变化。
- shortcuts：每个测试使用自身 mkdtemp 目录并在 afterEach 清理；保存 modes 后重新加载真实模块、重读文件，验证规范化值仍在。
- 数据升级/恢复：D1 仍由既有 Zustand version 20 迁移触发，不增加新迁移版本或字段；Main 有效语言保持权威恢复来源，缺失值可由其恢复。回滚源码恢复原行为，不需要数据降级；已被旧缺陷覆盖的 Main 语言无法推断原值，需用户重新选择。
- 成本：D1 只处理单个设置对象、复用原有线性迁移，额外浅复制不随记录数量增长；翻译为静态资源，无新增 I/O/网络/依赖。测试只用一个 worker，无 GUI、服务器或真实原生安装。


修复和验证已主动发送主协调聊天 `01a07058-384c-7f41-9361-a0fff5aff5e4`；当前等待综合复核与余下发布门禁安排。

### 第三轮验证与剩余边界

| 检查 | 实际结果 | 证据边界 |
| --- | --- | --- |
| Desktop 7 个定向文件 | 首次 51 pass / 2 fail；修正新增 fixture 后语言文件 14/14 pass，最终该集合 53/53 pass | 2 fail 为本轮新测试误将字号填写为像素 18，当前合同实际是 small/medium/large；改用 large 后语言和其他偏好均恢复。D1 旧红测原期望未变 |
| Mobile 全套 7 文件 | 36/36 pass | 包括 D2 七语言与五个保存错误原文断言、D3 真实磁盘写入重开；不证明原生 Expo driver 或 UI |
| Mobile typecheck | exit 0 | 包括本轮资源和持久测试 |
| Desktop 触及 3 文件 ESLint | exit 0 | settings-persistence、settings-language、shortcuts；全 Desktop source/test typecheck 按协调范围未执行 |
| updater-real-scenario 本地子集 | 7 pass / 2 filtered | 真实本地 CHANGELOG 读取、区间与 SemVer；-t 仅选择 getChangelogForVersionRange 和 compareVersions |
| diff whitespace | exit 0 | 仅本组触及的已跟踪文件 |

复现命令（仓库根，使用已有依赖；实际均经 Node spawnSync 90/120 秒上限执行；Mobile/ESLint/typecheck 为独立检查并行）：

```sh
pnpm --dir apps/desktop run test:unit tests/unit/stores/settings-language.test.ts tests/unit/main/shortcuts.test.ts tests/unit/stores/settings-appearance.test.ts tests/unit/stores/settings-background-image.test.ts tests/unit/stores/settings-shortcuts.test.ts tests/unit/stores/settings-desktop-workspace.test.ts tests/unit/main/updater-install.test.ts --minWorkers=1 --maxWorkers=1 --reporter=verbose
pnpm --dir apps/desktop run test:unit tests/unit/stores/settings-language.test.ts --minWorkers=1 --maxWorkers=1 --reporter=verbose
pnpm --dir apps/mobile run test --minWorkers=1 --maxWorkers=1 --reporter=verbose
pnpm --dir apps/mobile run typecheck
pnpm --dir apps/desktop exec eslint src/renderer/stores/settings/settings-persistence.ts tests/unit/stores/settings-language.test.ts tests/unit/main/shortcuts.test.ts
pnpm --dir apps/desktop run test:unit tests/unit/main/updater-real-scenario.test.ts --minWorkers=1 --maxWorkers=1 --reporter=verbose -t 'getChangelogForVersionRange|compareVersions'
```

- 原 not-run 的 shortcuts 4 项、updater-install 6 项和本地 changelog/version 7 项已补执行。shortcuts 的 setMode 经实际文件写入和新模块实例读回；窗口和注册 API 为 mock。安装检查的 Electron/updater/backup 均为 mock，不证明真正快照、安装、重启或签名。
- updater-real-scenario 的两条网络用例仍未执行：一条允许网络失败返回 0 而通过，另一条只断言 URL 格式；无法证明发布产物可用。应由总协调结合固定候选发布版本安排有效 artifact/network 验证，不将它们算绿色；文件未修改。
- 第二轮 Desktop settings integration 3/3 的证据继续有效：本次 D1 改动位于旧版 renderer Zustand 迁移，未触及该集成覆盖的 main/preload/core 存储代码，不重复运行同一无关检查。
- G01–G29 GUI、真实原生平台/安装、bundle/perf/full harness 和 Mobile deferred/static Store 范围仍保留给总协调；没有新增产品能力或宣称发布完成。
- 资源回收：本轮 runner PID 92922、93331、93320、93293、93643、93805、94554 均已退出；测试创建的独占目录均由 afterEach 清理。没有创建服务器、浏览器、监听端口、依赖安装或临时脚本文件；既有 renderer-persistence 两个脏文件未修改。无提交/推送。

Status: active

## 第二轮：持久测试交付（2026-10-04）

用户补充要求已替代首轮报告/临时脚本限制。本轮新增文件仅使用 `release-acceptance-desktop-release` 前缀，产品源码、原有测试/helper/config 仍冻结。以下第一轮结果作为历史证据保留，不能替代第二轮实际测试文件。

### 现有关键用例有效性审计

| 现有测试 | 分类与证据 | 缺口及交付 |
| --- | --- | --- |
| Desktop `stores/settings-language.test.ts` | **有效**：正确预期为 main zh，version 19 无效语言实际红测；已能抓出 D1 | 直接复用该文件，不机械复制。普通 canonical Electron 启动适用性仍需 GUI 验收 |
| Desktop `main/settings-renderer-persistence-ipc.test.ts` | **过度 mock（用于证明持久化时）**：`replaceSettings`、read、database 全部为 mock，主要断言路由调用 | 保留其单元路由价值；新增真实 preload → IPC → canonical 文件/SQLite →关闭重开及真实 SQL 写失败测试 |
| Desktop `components/general-settings.test.tsx`、`stores/settings-startup.test.ts` | **断言不足（用于证明重启时）**：DOM/store 或 set mock 调用不能发现写错路径、写空、重启丢失 | 新增 settings integration；组件与真实原生启动继续分层，不把组件删除/判为完全无效 |
| Desktop dirtybaseline `services/renderer-persistence.test.ts` | **有效的局部持久化回归**：大旧缓存经过真实 Core store 后重新创建 store，检查源配置；坏输入保全 | 已有有效用例复用，保持脏文件不修改；它不覆盖 Desktop 设置注册/preload 链 |
| Desktop `main/shortcuts.test.ts` | **隔离不足**：固定 `/tmp/prompthub-test/config` 写入且无独占清理 | 待总协调分配该既有文件，改成 mkdtemp/afterEach；本组不越权修改 |
| Mobile `promptRepository.test.ts` | **有效 SQL 单元 + 缺失磁盘/真实初始化链**：CRUD 可检测字段错写，但 `:memory:` 和手工调用 schema 无法发现 native bridge 或重开丢失 | 新增真实 app database.ts + repository.ts 初始化链；仅替换 Expo native driver 为磁盘 SQLite |
| Mobile `database.test.ts` | **过度 mock（用于证明初始化可用时）**：native open 与 initMobileDatabase 都 mock，不能发现实际 schema 缺失 | 新测试不 mock schema，第一条 create 必须靠真实产品初始化建表；真实 SQL trigger 故障检查失败后内容和重开/重试 |
| Mobile `tabs.test.ts`、既有 i18n | tabs **有效静态契约**但语言覆盖**缺失**；不存在解析全部页面键的实际 i18next 回归 | 新增 7 语言真实 i18next 解析测试，独立预期为所选语言，不接受 D2 fallback；还纳入 tab titleKey |
| Mobile capability 状态 | **缺失**：没有把产品声明与已完成的持久化流程对照的测试 | D3 正确预期 sqlite，新测试先完成真实磁盘写入/重开，再核对声明；不把 pending 当预期 |

新增测试保持现有 Vitest 框架和入口。测试所用较长生命周期用例保留连续创建/变更/关闭重开/核对/删除步骤，避免拆成共享状态的顺序依赖测试；短 fixture 负责运输与资源释放，不复制业务逻辑。GUI 与原生 OS 证据仍 blocked。

### 第二轮交付时结果（历史，后续修复见当前矩阵）

新增 **3 个持久测试文件、14 个用例：8 pass、6 fail**。6 个红测分别为 D2 的 5 个语言、D3 的 1 个存储声明；D1 复用第一轮已有正确红测。没有 skip/todo，没有修产品取绿。测试源码已留在常用 package 入口内；旧临时脚本不再承担交付职责。

| 新增文件 | 用例名 / 核心断言 | 最终状态 |
| --- | --- | --- |
| `apps/desktop/tests/integration/release-acceptance-desktop-release-settings.test.ts` | `keeps shell preferences and remembered close choice after closing and reopening storage`：preload 设置后，raw SQLite closeAction 与 IPC 读回均正确；关闭 DB、重新初始化与注册后 theme/language/module order/startup/closeAction 保留 | pass |
| 同上 | `rejects malformed startup input without saving a valid sibling preference`：invalid startupFolderMode 必须拒绝，同 payload 的 minimizeOnLaunch 不得被部分保存；重开仍保留 true | pass |
| 同上 | `restores the canonical close choice when SQLite rejects a settings write and permits retry`：真实 trigger 在 canonical closeAction 写后中断 SQLite 写，canonical 与 DB 都恢复 ask/false；重开确认，撤销 trigger 后重试并重开为 exit/true | pass |
| `apps/mobile/src/storage/release-acceptance-desktop-release-mobile-storage.test.ts` | `persists create, edit and delete across reopen with matching list, detail and filtered results`：真实 app 初始化→创建 Unicode/多行记录→关库重开→raw SQL/详情/过滤结果→更新重开→删除重开；另一条记录不受影响 | pass |
| 同上 | `retains the original row after duplicate creation and a missing-row update`：两个错误被拒绝，重开后完整原对象和 SQL count=1 | pass |
| 同上 | `preserves content after a real SQLite update failure and persists a successful retry`：真实 SQLite trigger 拒绝 UPDATE 后原对象包括时间戳不变；重开核对，移除 trigger 后 retry 新内容持久化 | pass |
| 同上 | `D3 declares SQLite storage after the public Prompt workflow has persisted and reopened`：前半段真实保存重开已过，正确预期 durableStorage=sqlite | fail，`pending ≠ sqlite`，断言行 185 |
| `apps/mobile/src/i18n/release-acceptance-desktop-release-mobile-locales.test.ts` | `D2 resolves every screen and navigation key in %s without another language fallback` ×7：从页面 t() 字面量及真实 tab titleKey 取键，真实 app i18next.changeLanguage/t(returnDetails) 必须命中所选语言；已知键哨兵防止提取为空 | en/zh pass；zh-TW/ja/fr/de/es fail，每种 32 个 fallback，断言行 70 |

替换边界：

- Desktop 复用现有 `integration/helpers/skill-runtime.ts`，该 helper 替换 Electron 消息运输、home 路径、原生 session.setProxy；本测试执行真实 preload settingsApi、注册的 settings IPC、产品数据库初始化/迁移/canonical 发布与重开。测试不 mock settings 业务或持久化对象；加密适配明确拒绝任何测试凭据。helper 会准备其他资产 fixture，本组不以这些准备动作声称资产验收。
- Mobile 只将 `expo-sqlite.openDatabaseAsync` 的原生驱动换为 node:sqlite 磁盘连接；真实 `database.ts`、`mobileSchema.ts`、`promptRepository.ts`、`promptRepositoryCore.ts`、filters 都参与。参数使用本机 Expo SDK 的数组绑定重载，无测试自建 schema。关库并 resetModules 后重新执行产品初始化。此层不证明 Expo native driver、OS sandbox 或 UI。
- 文案测试读取 AST 仅用于发现页面依赖，判断使用真正 i18next 返回的 usedLng/res；没有硬编码 bug 文案作为正确预期。动态键仍是显式未测项，tab titleKey 已纳入。

### 最小行为变异：删除无操作必须被拦截

为了验证完整流程断言可发现真正的结果缺失，在本组独占临时副本复制 8 个文件，只把 `promptRepositoryCore.ts` 的

```ts
await (await this.getDb()).run("DELETE FROM prompts WHERE id = ?", [id]);
```

替换成 `return;`。共享源码没有变化；测试文件逐字复制，使用同一已安装 Vitest。原始实现该用例 pass；变异执行 exit 1，明确命中 **重开后的记录删除断言**：

```text
AssertionError: expected { id: 'persistent-prompt', …(7) } to be null
Expected: null
Received: { id: "persistent-prompt", title: "Edited title", isFavorite: false, ... }
release-acceptance-desktop-release-mobile-storage.test.ts:125:49
Tests 1 failed | 3 skipped (4)
```

这里的 3 skipped 仅来自 `-t` 筛选另外三条用例，文件中不存在 skip/todo；不是绕过 D3。首次在临时目录直接调用 pnpm 时，本机外层 pnpm 自动尝试依赖检查，因 `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` 退出（downloaded 0 / added 0），未执行测试，**不计变异证据**。随后使用仓库内 pnpm 9.15.0 和 `vitest --root` 成功执行上述业务断言。锁文件、node_modules/.modules.yaml、Mobile .bin/vitest 时间戳未变化，未重复尝试安装。

变异准备的完整复现（从仓库根运行；保存为独占临时目录的 prepare-mutation.mjs）：

```js
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const repo=process.cwd(),target=path.join(import.meta.dirname,'mobile-delete-mutation');
const files=['package.json','src/storage/database.ts','src/storage/mobileSchema.ts','src/storage/release-acceptance-desktop-release-mobile-storage.test.ts','src/features/prompts/data/promptRepository.ts','src/features/prompts/data/promptRepositoryCore.ts','src/features/prompts/promptFilters.ts','src/platform/mobileCapabilities.ts'];
for(const file of files){const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(repo,'apps/mobile',file),destination)}
fs.symlinkSync(path.join(repo,'apps/mobile/node_modules'),path.join(target,'node_modules'),'dir');
const file=path.join(target,'src/features/prompts/data/promptRepositoryCore.ts');
const source=fs.readFileSync(file,'utf8'),statement='await (await this.getDb()).run("DELETE FROM prompts WHERE id = ?", [id]);';
assert.equal(source.split(statement).length,2);
fs.writeFileSync(file,source.replace(statement,'return;'));
console.log(JSON.stringify({target,mutation:'repository.delete returns without deleting',copiedFiles:files.length}));
```

### 常用入口、静态检查和准确重跑命令

常用入口实跑：Desktop `test:integration` 确实选择 1 文件/3 项；Mobile `run test release-acceptance-desktop-release` 确实发现 2 个新文件，locale 7 项实际执行，storage 最初因 Vite 原生模块识别失败；修正本组 fixture 后以同一 `run test` 入口运行 storage 4 项。最终新增集合的 14 项都有实际结果，不以“文件名应匹配”代替证据。

- `vitest.workspace.ts` integration glob 包含新 desktop 文件；root harness 的 `desktop-integration` 调用同一入口。
- Mobile 使用 Vitest 默认发现规则；root harness `mobile-test` 调用同一 package test。
- 实际解析配置确认 Desktop `tsconfig.test.json`、Mobile `tsconfig.json` 包含各新增文件。Mobile **最终 typecheck exit 0**；Desktop **定向 ESLint exit 0**。
- Desktop `typecheck:tests` 属于本轮禁止的全范围静态检查，**未运行**；“配置包含”不等于类型检查通过。Mobile 没有 package lint 脚本/本地 ESLint 配置，root harness 也无 Mobile lint 条目，**未运行 Mobile lint**；不擅建第二套规则，交总协调确认是否补门禁。
- 所有 pnpm 检查依次执行、每次一个进程组；Vitest 单 worker。监督器 deadline 180000 ms、输出上限 2 MiB；无超时。第二轮未重复第一轮已通过的批量套件。

```sh
pnpm --dir apps/desktop test:integration tests/integration/release-acceptance-desktop-release-settings.test.ts --reporter verbose
pnpm --dir apps/mobile run test release-acceptance-desktop-release --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --dir apps/mobile run test src/storage/release-acceptance-desktop-release-mobile-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose
pnpm --dir apps/mobile typecheck
pnpm --dir apps/desktop exec eslint tests/integration/release-acceptance-desktop-release-settings.test.ts --report-unused-disable-directives --max-warnings 0
# 仅对准备好的独占变异副本执行；从仓库 pnpm 启动，避免在临时目录触发依赖初始化。
pnpm --dir apps/mobile exec vitest run --root "$ACCEPTANCE_TMP/mobile-delete-mutation" src/storage/release-acceptance-desktop-release-mobile-storage.test.ts --minWorkers 1 --maxWorkers 1 --reporter verbose -t 'persists create, edit and delete'
```

### 执行记录与清理

第二轮实际执行时间 2026-10-04 17:38:37–17:41:14 Asia/Shanghai；准备和报告不计测试时长。临时根 `/tmp/prompthub-desktop-tests.7d0SJs`。

| 命令标签 | supervisor / pnpm PID | session | 退出码与结果 |
| --- | --- | --- | --- |
| desktop-new | 83046 / 83062 | 63150 | 0，3 pass |
| mobile-new | 83147 / 83163 | 前台 | 1，pnpm test 简写拒绝 minWorkers/maxWorkers，未执行测试；改用 run test |
| mobile-new-selected | 83416 / 83432 | 45834 | 1，D2 5 red/2 pass；storage 加载 node:sqlite 失败（环境/fixture，不计产品失败） |
| mobile-typecheck-new | 83567 / 83583 | 49076 | 0；其后 fixture 修改，已由 final 检查覆盖 |
| mobile-storage-fixed | 83916 / 83932 | 7085 | 1，fixture 最初误用 variadic 参数，4 项 Unknown named parameter 0；按本机 Expo SDK 数组重载集中修正，不计产品失败 |
| mobile-storage-native-params | 84312 / 84328 | 前台 | 1，3 pass / D3 1 red；最终源码状态 |
| mobile-typecheck-final | 84467 / 84483 | 6144 | 0，包含最终两份 Mobile 测试 |
| mobile-delete-mutation | 84872 / 84888 | 前台 | 1，工作区依赖缺失，未跑用例，不计变异证据 |
| desktop-new-lint | 85011 / 85027 | 66983 | 0，单文件 |
| mobile-delete-mutation-root | 85704 / 85720 | 前台 | 1，实际命中删除后重开断言；有效变异证据 |

17:41:59 核对所有上述进程组无存活成员；从 Desktop 日志取得的 3 个精确 fixture 根均不存在，Mobile 专属 fixture 前缀无遗留目录。报告保存后删除本组监督器、日志、变异副本（包括 node_modules 符号链接）；保留 3 个新增持久测试及本报告。未打开端口、GUI、账号、模型或外部服务。完整 Desktop 类型检查、GUI/原生/发布包、动态语言键仍未验证。产品与原有测试的 tracked diff 指纹保持第一轮 `d9072a530542dbb1764e3330f05df7180f1e9a9dc9809ebf53e8e4b048c2bc4d`，并行新增文件不属于本组，均保留。

第二轮最终清理确认：`/tmp/prompthub-desktop-tests.7d0SJs` 已删除并断言不存在，仅移除了变异副本内的依赖符号链接，没有删除 workspace node_modules。3 个测试文件仍在原位，均无 skip/todo；报告及测试 whitespace 检查无诊断。HEAD 与上述 tracked diff 指纹未变。

## 第一轮结论与证据边界（历史记录）

2026-10-04 第一轮非 GUI 验收完成。**不能据此批准版本发布。**

- Desktop 定向 38 个文件、339 项：338 pass、1 fail；Mobile 5 个文件、20 项全部 pass。合计 **43 个测试文件，358/359 项通过，1 项失败**，没有 skip。
- Mobile typecheck pass；独立磁盘 SQLite 复现 pass，覆盖 7 个正常/失败保全/重开场景，最终数据库 20,480 字节。
- 发现 D1 旧版本语言恢复回归、D2 Mobile 五种语言缺文案、D3 Mobile 存储能力显示与真实实现不一致。均未修改源码。
- GUI、原生快捷键/托盘/窗口、真实 Electron 重启、安装包启动升级签名、原生 Mobile 均 blocked；性能与 bundle 门禁 not-run，留给总协调。
- 组件测试、mock 原生 API、Node SQLite、静态资源检查分别记录；它们不代表 Electron 或 Expo 原生全流程通过。

## 第一轮基线与范围（历史）

- HEAD：`108f375bcd2c3e94c20d93dd619d641b6386b352`；版本 `0.6.0-beta.2`；Darwin arm64，Node `v26.7.0`，pnpm `9.15.0`，Vitest `2.1.9`。复用现有 root/desktop/mobile node_modules，没有安装依赖。
- 实际检查窗口：2026-10-04 **17:25:06–17:28:24 Asia/Shanghai**；此前为只读入口/隔离盘点，之后为报告与资源核对。
- 开始时存在计划列出的 8 个脏文件，另有总协调更新的 `spec/changes/index.md` 和本验收目录；全部保留。
- 本组唯一持久写入：本报告。未修改产品、测试、配置、其他报告或 issue，未提交、推送、建分支、构建、发布。
- Desktop 两个 renderer-persistence 脏文件纳入测试，结果标记 **dirtybaseline**。测试后 17:26 与 17:28 两次产品范围 diff 指纹一致：
  `git diff --binary -- apps/desktop apps/mobile packages | shasum -a 256`
  → `d9072a530542dbb1764e3330f05df7180f1e9a9dc9809ebf53e8e4b048c2bc4d`。
  此指纹不等同于计划中的全 tracked diff 指纹。
- 权威：`AGENTS.md`、`README.md`、`spec/rules/testing-standards.md`、`spec/knowledge/behavior/desktop.md`、`spec/knowledge/behavior/mobile.md`、`spec/knowledge/structure/desktop-frontend-performance.md`、`spec/releases/release-rules.md`、本目录 `plan.md`。
- Desktop 业务记录仍按 foundation 的 SQLite/文件包所有权；本组只测 shell/settings 状态及 dirtybaseline 的既有回归。Mobile 使用其独立 schema 的 SQLite，不能和 Desktop 数据库互换。
- 资源成本：一个检查进程组、Vitest 单 worker；局部 fixture 与小磁盘库；资源文案扫描为文件/键数量的线性遍历，无外部网络。没有运行大数据压力或全仓检查，不从测试耗时推断产品性能。

### 首轮非 GUI 证据快照（历史：9 pass、3 fail）

| ID / 功能 | 真实入口与操作/预期 | 测试/复现 | 状态及结果 | 替换或未测边界 |
| --- | --- | --- | --- | --- |
| E01 设置和通用组件 | render→用户事件→store/DOM；导航 lazy、预览更新确认、壁纸失败、模态焦点、toast | 下方 components 文件（具体名称见文件表） | pass | jsdom、内存 storage、mock window.api；无原生布局 |
| E02 语言恢复 | 版本 19 unsupported renderer 语言、main zh→loadSettingsFromMainProcess 应 zh | settings-language: `treats an unsupported persisted renderer language in version 19 as absent` | fail：en ≠ zh，11/12 通过 | main IPC/i18n mock；canonical Electron 启动路径尚未重现 |
| E03 托盘 | 创建命令、显隐、图标资源、语言、update 状态/菜单生成 | tray-* 76 项 | pass | Electron/nativeImage/window/menu 均替换，部分资源文件真实只读 |
| E04 更新/安装配置 | updater 状态、稳定/预览源、换源取消、备份绑定；NSIS 配置固定身份 | updater 21、windows-installer-config 5 | pass | updater/HTTPS/备份 mock；NSIS 是配置文本约束 |
| E05 workspace/startup/外观状态 | 隐藏/重排/归一化、close action、startup folder、宽度、后台执行策略 | stores + app-background + startup hook；main settings-startup 用真实内存 SQLite | pass | state/store 层；内存 SQLite fixture 手工建 schema，不是整个 app bootstrap |
| E06 renderer persistence dirtybaseline | 大旧缓存只迁源配置，真实临时文件保存后重新创建 store；坏 JSON 保留，失败可重试 | renderer-persistence 13 项，`migrates source configuration beside large legacy caches and reopens it` | pass | 真实 Core 文件持久化 + mock IPC；未启动 renderer/SQLite 全链 |
| E07 Mobile 既有测试 | SQL CRUD/旧无版本表/未来版本拒绝/坏 metadata；filters、tab、alerts、DB 初始化 | 5 文件 20 项，见下 | pass | SQL CRUD 用 node:sqlite :memory:；Expo open、native alerts/rollback 故障部分 mock |
| E08 Mobile typecheck | `tsc --noEmit`，现有 Expo base 与 TS 配置 | `pnpm --dir apps/mobile typecheck` | pass，exit 0 | 无 bundle/Metro/native build |
| E09 Mobile 磁盘重开 | 创建/查询→关库→重开→重复写失败保留→更新/重开→删除/重开 | 附录 mobile-disk.mjs，7 场景 | pass，20,480 bytes，最终空表 | 真实产品 schema/repository/filter + Node SQLite；Expo getDatabase 运输边界未使用 |
| E10 Desktop 七语言键 | 7 个设置源码文件的 166 个直接 t() 键，在 7 份 JSON 均有 string | 附录 locale-audit.mjs | pass，7×166 键无缺失 | 静态抽样，动态 key、其他业务文案/翻译质量/布局未覆盖 |
| E11 Mobile 七语言键与实际 fallback | 79 个页面直接 t() 键，逐语言资源查找；i18next 使用同 resources/fallbackLng=zh | 附录 locale-audit/mobile-i18n | fail：zh-TW/ja/fr/de/es 各缺 32；实际 common.discovery 用 zh | 真实 i18next，无屏幕/平台 locale 自动识别证据 |
| E12 Mobile 存储状态 | 实际 Prompt 磁盘保存已成立，设置 capability 应表达 SQLite | 真实导出 mobileCapabilities + SettingsScreen 消费点 | fail：durableStorage 为 pending | 源码/模块值确认，原生画面未操作 |

### 首轮既有测试文件与用例定位（历史）

以下文件表是准确执行集合，不代表同名业务全部验收。首批统一命令 exit 1；38 个桌面文件的合计状态不能被额外 3 文件的绿色结果覆盖。

| 文件 | 状态 | 项数 | 代表用例（其余用例在同文件） |
| --- | --- | ---: | --- |
| `apps/desktop/tests/unit/components/about-settings.test.tsx` | pass | 9 | requires explicit confirmation before enabling the preview update channel |
| `apps/desktop/tests/unit/components/appearance-settings.test.tsx` | pass | 7 | shows an empty-state preview before a background image is selected |
| `apps/desktop/tests/unit/components/background-image-backdrop.test.tsx` | pass | 3 | applies opacity and blur from props |
| `apps/desktop/tests/unit/components/close-dialog.test.tsx` | pass | 11 | does not render when closed |
| `apps/desktop/tests/unit/components/desktop-app-command-bridge.test.tsx` | pass | 12 | navigates to prompt before opening its existing workflow |
| `apps/desktop/tests/unit/components/general-settings.test.tsx` | pass | 7 | renders the four sections (startup / editor / language / notifications) |
| `apps/desktop/tests/unit/components/language-settings.test.tsx` | pass | 3 | renders the seven supported language options when opened |
| `apps/desktop/tests/unit/components/modal.test.tsx` | pass | 15 | does not render content when isOpen is false on first paint |
| `apps/desktop/tests/unit/components/motion-primitives.test.tsx` | pass | 8 | applies the press-in scale and instant duration by default |
| `apps/desktop/tests/unit/components/network-settings.test.tsx` | pass | 1 | shows network proxy and mirror source controls |
| `apps/desktop/tests/unit/components/settings-modal.test.tsx` | pass | 1 | keeps modal controls non-submit with clear selection semantics |
| `apps/desktop/tests/unit/components/settings-page.test.tsx` | pass | 11 | loads only the active settings section on the default route |
| `apps/desktop/tests/unit/components/shortcuts-settings.test.tsx` | pass | 8 | loads saved shortcuts from Electron on mount |
| `apps/desktop/tests/unit/components/title-bar.test.tsx` | pass | 1 | keeps window controls non-submit with decorative icons hidden |
| `apps/desktop/tests/unit/components/toast.test.tsx` | pass | 6 | renders a toast via showToast |
| `apps/desktop/tests/unit/components/update-dialog.test.tsx` | pass | 13 | keeps the real development check result instead of injecting three demo states |
| `apps/desktop/tests/unit/main/settings-startup.test.ts` | pass | 6 | returns false when the setting has never been written |
| `apps/desktop/tests/unit/main/tray-command-dispatcher.test.ts` | pass | 6 | shows, focuses, and immediately sends to an existing window |
| `apps/desktop/tests/unit/main/tray-controller.test.ts` | pass | 18 | installs the native quota menu on macOS without a rendered click surface |
| `apps/desktop/tests/unit/main/tray-icon.test.ts` | pass | 8 | resolves the dedicated Template asset in development |
| `apps/desktop/tests/unit/main/tray-menu-language-setting.test.ts` | pass | 14 | reads supported value "en" |
| `apps/desktop/tests/unit/main/tray-menu.test.ts` | pass | 30 | renders every verified named loading row and quota action inside the native menu |
| `apps/desktop/tests/unit/main/updater.test.ts` | pass | 21 | should configure autoUpdater defaults |
| `apps/desktop/tests/unit/main/windows-installer-config.test.ts` | pass | 5 | pins a stable NSIS guid and custom include |
| `apps/desktop/tests/unit/stores/settings-appearance.test.ts` | pass | 1 | normalizes same-version persisted appearance settings during hydration |
| `apps/desktop/tests/unit/stores/settings-background-image.test.ts` | pass | 11 | trims the background file name and writes the CSS image var |
| `apps/desktop/tests/unit/stores/settings-close-action.test.ts` | pass | 4 | publishes close actions changed from general settings |
| `apps/desktop/tests/unit/stores/settings-desktop-workspace.test.ts` | pass | 16 | places Agents second in the default desktop module order |
| `apps/desktop/tests/unit/stores/settings-language.test.ts` | fail | 12 | normalizes locale variants before updating settings |
| `apps/desktop/tests/unit/stores/settings-network-proxy.test.ts` | pass | 1 | normalizes and syncs manual proxy settings to the main process |
| `apps/desktop/tests/unit/stores/settings-shortcuts.test.ts` | pass | 1 | normalizes same-version persisted shortcut modes during hydration |
| `apps/desktop/tests/unit/stores/settings-startup.test.ts` | pass | 4 | syncs minimizeOnLaunch='true' to the main process when toggled |
| `apps/desktop/tests/unit/services/app-background.test.ts` | pass | 13 | validates required WebDAV configuration |
| `apps/desktop/tests/unit/services/i18n-init.test.ts` | pass | 4 | prefers persisted language over system language |
| `apps/desktop/tests/unit/services/renderer-persistence.test.ts` | pass | 13 | does not duplicate SQLite-owned prompt preferences in renderer settings |
| `apps/desktop/tests/unit/hooks/use-startup-folder-restore.test.ts` | pass | 9 | restores the last active folder once folders are loaded |
| `apps/desktop/tests/unit/stores/settings-startup-folder.test.ts` | pass | 8 | keeps valid values |
| `apps/desktop/tests/unit/stores/ui-columns.test.ts` | pass | 18 | defaults to the legacy Tailwind widths |
| `apps/mobile/src/features/prompts/data/promptRepository.test.ts` | pass | 9 | creates, reads, updates, and deletes Prompt rows in SQLite |
| `apps/mobile/src/features/prompts/promptFilters.test.ts` | pass | 3 | searches title, description, body, and tags case-insensitively |
| `apps/mobile/src/features/navigation/tabs.test.ts` | pass | 2 | exposes the first mobile shell routes in a stable order |
| `apps/mobile/src/components/platformAlerts.test.ts` | pass | 4 | only confirms web actions after browser approval |
| `apps/mobile/src/storage/database.test.ts` | pass | 2 | allows a retry after database opening fails |

测试日志中的 React `act(...)` 警告出现在 startup folder hook；未作为产品缺陷，需后续测试维护。坏 JSON、更新错误等预期故障日志不等于新增失败。

## D1–D3 首轮缺陷复现（历史，均已修复）

### D1 / P2：旧版无效语言被归一化成显式英文，阻止 main 语言恢复

首轮状态：**fail（已有回归实际失败）**；当前 D1 已修复，最新通过边界见 E02；基线见上。影响具有 version 19 且 language 非支持值的 renderer 历史快照；有效语言与 version 20 无效语言用例通过。尚未证明普通新安装或当前 canonical Electron 启动受影响。

复现：在隔离内存 localStorage 写入 `prompthub-settings={"state":{"language":"unsupported"},"version":19}`，mock main settings.get 返回 `{language:"zh"}`，导入 store 后调用 `loadSettingsFromMainProcess()`。期望恢复 zh；实际 en。失败定位：`apps/desktop/tests/unit/stores/settings-language.test.ts:126`。

```text
AssertionError: expected 'en' to be 'zh'
Expected: "zh"
Received: "en"
```

最短回归命令（本轮没有重复执行此筛选命令，失败来自完整首批）：

```sh
pnpm --dir apps/desktop exec vitest run --project unit --minWorkers 1 --maxWorkers 1 tests/unit/stores/settings-language.test.ts -t 'treats an unsupported persisted renderer language in version 19 as absent'
```

候选修复边界：`settings/settings-persistence.ts` 的 `migrateSettingsState/normalizeMigratedCoreState` 提前 normalize language；随后 `settings.store.ts` merge 将迁移后的 en 当作原本显式偏好，`persistedRendererLanguage` 非 null，阻止 main zh。必须保留原始语言有效性，不能放宽断言。先确认当前 canonical migration 和 Web/历史 hydrate 的实际适用性，再修 owner。失败仅涉及测试内存状态，未操作真实设置、未证明 main 落盘是否被回写。

### D2 / P2：Mobile 5 个语言资源缺 32 个已使用页面键，实际回退简体中文

首轮状态：**fail（资源与真实 i18next 复现）**；当前 D2 已修复，最新通过边界见 E11。影响 zh-TW、ja、fr、de、es 的 Prompt 列表、Skill、Store、Settings shell；en/zh 本次 79 直接键无缺失。例：用 ja 初始化当前 resources、fallbackLng zh，`t("common.discovery",{returnDetails:true})` 返回 `res:"发现中心", usedLng:"zh"`。其余四个受影响语言相同。期望相应目标语言，而非跨语言回退。无需启动 GUI 即能确认，真实视觉仍 blocked。

每种受影响语言相同的 32 键：

```text
common.discovery common.distributionCenter common.items common.system common.workspace
filters.all filters.favorite filters.recent filters.tags
prompts.metrics.favorite prompts.metrics.local prompts.metrics.tags prompts.recent prompts.searchPlaceholder
settings.dataCopy settings.dataLayer settings.files settings.metrics.files settings.metrics.share settings.metrics.storage settings.sync
skills.localPackages skills.metrics.packages skills.metrics.sources skills.searchPlaceholder
store.featured store.featuredPromptDescription store.metrics.cached store.metrics.ready store.metrics.sources store.searchPlaceholder store.sources
```

候选修复位置：`apps/mobile/src/i18n/resources.ts`。回归应从真实屏幕使用键/导航键出发检查 7 语言实际解析语言；动态 keys 和插值另补，不只对照 en 的相同缺口。无存储写入。

### D3 / P2：Mobile SQLite 已工作，但 Settings 对外显示 pending

首轮状态：**fail（导出状态与真实持久化矛盾）**；当前 D3 已修复，最新通过边界见 E12。`mobileCapabilities.durableStorage === "pending"`；`SettingsScreen` 的 Storage MetricCard 直接显示该值。当前 storage/database、mobileSchema、promptRepository 已使用 SQLite，本轮磁盘创建/重开通过。期望能力状态为 sqlite 或当前已交付状态，实际 pending。

复现：运行附录 locale-audit（输出真实 capability），对照附录 mobile-disk pass；读取 `SettingsScreen` MetricCard 消费。候选修复：`apps/mobile/src/platform/mobileCapabilities.ts` 及对应 contract test。修复不能顺手把尚未实现的 Skill/云能力声明为可用。无原生显示截图，无用户数据影响。

首轮未执行项的当前状态统一见顶部 R01–R16；已完成的 shortcuts/updater 检查不再列为当前 not-run。

## 第一轮实际命令、退出码与资源记录（历史）

所有命令由本轮临时 `run.mjs` 监督，spawn pnpm detached 进程组，180,000 ms deadline，超时 SIGTERM 后 3 秒 SIGKILL，只针对该进程组；输出写临时 log，工具返回受限。所有实际命令均在 deadline 内自行结束。

| 标签 | 时间（Asia/Shanghai） | supervisor / pnpm PID | tool session | exit / 结果 |
| --- | --- | --- | --- | --- |
| desktop | 17:25:06–17:25:28 | 72579 / 72595 | 71573 | 1；304 项 303 pass/1 fail；20.88s Vitest |
| mobile | 17:25:38–17:25:42 | 73631 / 73647 | 8665 | 0；20 pass |
| mobile-typecheck | 17:26:09–17:26:13 | 74164 / 74180 | 67270 | 0 |
| mobile-disk 初次 | 17:26:18–17:26:19 | 74485 / 74501 | 前台完成 | 1；Node 26 strip-only 拒绝 TS parameter property，尚未执行业务 |
| mobile-disk-transpiled 初次适配 | 17:26:35 | 74943 / 74959 | 前台完成 | 1；tsx/Node 26 import 未转译 interface，尚未执行业务 |
| mobile-disk-final | 17:26:57 | 75489 / 75505 | 前台完成 | 0；改用现有 TypeScript transpileModule，仅转译独立被测纯模块后执行 |
| desktop-startup | 17:27:17–17:27:22 | 75853 / 75869 | 44714 | 0；35 pass |
| locale-audit | 17:27:38–17:27:39 | 76149 / 76166 | 37864 | 0；审计工具成功输出，发现 D2/D3，不能解释为产品全绿 |
| mobile-i18n | 17:28:23–17:28:24 | 76673 / 76689 | 前台完成 | 0；成功重现并断言 5 语言回退 zh，产品状态 fail |

前两次磁盘脚本失败是本组测试启动适配问题，不是产品仓库测试失败；没有库文件写入。使用已有 TypeScript 单模块内存转译后，一次执行真实业务场景；没有构建 app 或触碰共享 out。

精确 pnpm 命令如下（`ACCEPTANCE_TMP` 为本组独占临时目录，实际为 `/tmp/prompthub-desktop-acceptance.bd3a4Y`；只在重现时创建新目录，不复用旧目录）：

```sh
pnpm --dir apps/desktop exec vitest run --project unit --minWorkers 1 --maxWorkers 1 --reporter verbose --reporter json --outputFile.json="$ACCEPTANCE_TMP/desktop.json" \
  tests/unit/components/settings-page.test.tsx \
  tests/unit/components/settings-modal.test.tsx \
  tests/unit/components/general-settings.test.tsx \
  tests/unit/components/appearance-settings.test.tsx \
  tests/unit/components/language-settings.test.tsx \
  tests/unit/components/network-settings.test.tsx \
  tests/unit/components/shortcuts-settings.test.tsx \
  tests/unit/components/about-settings.test.tsx \
  tests/unit/components/close-dialog.test.tsx \
  tests/unit/components/title-bar.test.tsx \
  tests/unit/components/update-dialog.test.tsx \
  tests/unit/components/desktop-app-command-bridge.test.tsx \
  tests/unit/components/modal.test.tsx \
  tests/unit/components/toast.test.tsx \
  tests/unit/components/motion-primitives.test.tsx \
  tests/unit/components/background-image-backdrop.test.tsx \
  tests/unit/stores/settings-desktop-workspace.test.ts \
  tests/unit/stores/settings-appearance.test.ts \
  tests/unit/stores/settings-background-image.test.ts \
  tests/unit/stores/settings-startup.test.ts \
  tests/unit/stores/settings-close-action.test.ts \
  tests/unit/stores/settings-shortcuts.test.ts \
  tests/unit/stores/settings-language.test.ts \
  tests/unit/stores/settings-network-proxy.test.ts \
  tests/unit/main/tray-controller.test.ts \
  tests/unit/main/tray-command-dispatcher.test.ts \
  tests/unit/main/tray-menu.test.ts \
  tests/unit/main/tray-menu-language-setting.test.ts \
  tests/unit/main/tray-icon.test.ts \
  tests/unit/main/settings-startup.test.ts \
  tests/unit/main/updater.test.ts \
  tests/unit/main/windows-installer-config.test.ts \
  tests/unit/services/i18n-init.test.ts \
  tests/unit/services/app-background.test.ts \
  tests/unit/services/renderer-persistence.test.ts
pnpm --dir apps/mobile exec vitest run --minWorkers 1 --maxWorkers 1 --reporter verbose --reporter json --outputFile.json="$ACCEPTANCE_TMP/mobile.json"
pnpm --dir apps/mobile typecheck
pnpm --dir apps/desktop exec vitest run --project unit --minWorkers 1 --maxWorkers 1 tests/unit/hooks/use-startup-folder-restore.test.ts tests/unit/stores/settings-startup-folder.test.ts tests/unit/stores/ui-columns.test.ts
pnpm exec node "$ACCEPTANCE_TMP/mobile-disk.mjs"
pnpm exec node "$ACCEPTANCE_TMP/locale-audit.mjs"
pnpm exec node "$ACCEPTANCE_TMP/mobile-i18n.mjs"
```

## 第一轮独立复现脚本（历史）

下列脚本从仓库根执行，放在新建独占临时目录。依赖均来自当前 workspace；不安装包、不访问账号。Mobile 磁盘脚本保留库以便读回，重现完成后删除自身目录。仅传输层使用 Node SQLite 适配，业务 schema/repository/filter 未复制或 mock。

### mobile-disk.mjs

```js
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const repo=process.cwd();
const require=createRequire(path.join(repo,'apps/desktop/package.json'));
const ts=require('typescript');
const tsImport=async(file)=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {initMobileDatabase,MOBILE_DATABASE_VERSION}=await tsImport(path.join(repo,'apps/mobile/src/storage/mobileSchema.ts'),import.meta.url);
const {createPromptRepository}=await tsImport(path.join(repo,'apps/mobile/src/features/prompts/data/promptRepositoryCore.ts'),import.meta.url);
const {filterPrompts}=await tsImport(path.join(repo,'apps/mobile/src/features/prompts/promptFilters.ts'),import.meta.url);
const file=path.join(import.meta.dirname,'mobile.db');
let db;
const open=async()=>{db=new DatabaseSync(file);const adapter={exec:async s=>db.exec(s),getFirst:async(s,p=[])=>db.prepare(s).get(...p),getAll:async s=>db.prepare(s).all(),run:async(s,p)=>db.prepare(s).run(...p)};await initMobileDatabase(adapter);return createPromptRepository(()=>adapter)};
try {
 let r=await open();
 const sample={id:'disk-case',title:"中文 😀 O'Reilly",description:'<b>text</b>',systemPrompt:'review',userPrompt:"Line 1\nSELECT * FROM prompts;",tags:['中文','audit'],isFavorite:true};
 await r.create(sample);
 assert.deepEqual((await r.list()).map(x=>x.id),['disk-case']);
 db.close();db=undefined;
 assert.ok(fs.statSync(file).size>0);
 r=await open();
 assert.deepEqual(await r.getById(sample.id),{...sample,updatedAt:(await r.getById(sample.id)).updatedAt});
 assert.equal(db.prepare('PRAGMA user_version').get().user_version,MOBILE_DATABASE_VERSION);
 assert.equal(filterPrompts(await r.list(),'中文','favorite').length,1);
 const before=await r.getById(sample.id);
 await assert.rejects(r.create({...sample,title:'duplicate'}),/UNIQUE/);
 await assert.rejects(r.update('missing',{title:'missing'}),/Prompt not found/);
 assert.deepEqual(await r.getById(sample.id),before);
 await r.update(sample.id,{title:'Updated 中文',isFavorite:false});
 db.close();db=undefined;r=await open();
 assert.equal((await r.getById(sample.id)).title,'Updated 中文');
 assert.equal(filterPrompts(await r.list(),'','favorite').length,0);
 await r.delete(sample.id);
 db.close();db=undefined;r=await open();
 assert.deepEqual(await r.list(),[]);
 await r.delete(sample.id);
 console.log(JSON.stringify({status:'pass',cases:['disk create/reopen Unicode fields','schema version','persisted search/favorite','duplicate insert retains original','missing update retains original','update/reopen','delete/reopen and repeat delete'],databaseBytes:fs.statSync(file).size}));
} finally {if(db)db.close()}
```

### locale-audit.mjs

直接键提取不覆盖动态 key，也不证明翻译质量；输出 JSON 包含全部缺项。

```js
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const repo=process.cwd(), require=createRequire(path.join(repo,'apps/desktop/package.json'));
const ts=require('typescript');
async function readTS(file){const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))}
const {resources}=await readTS(path.join(repo,'apps/mobile/src/i18n/resources.ts'));
const {mobileCapabilities}=await readTS(path.join(repo,'apps/mobile/src/platform/mobileCapabilities.ts'));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
function lookup(value,key){return key.split('.').reduce((v,k)=>v?.[k],value)}
const mobileKeys=[...new Set(files(path.join(repo,'apps/mobile/src')).filter(p=>p.endsWith('.tsx')).flatMap(p=>[...fs.readFileSync(p,'utf8').matchAll(/\bt\(["']([^"']+)["']/g)].map(m=>m[1])))].sort();
const desktopFiles=['GeneralSettings','AppearanceSettings','NetworkSettings','ShortcutsSettings','AboutSettings','SettingsPage','LanguageSettings'].map(n=>path.join(repo,'apps/desktop/src/renderer/components/settings/'+n+'.tsx'));
const desktopKeys=[...new Set(desktopFiles.flatMap(p=>[...fs.readFileSync(p,'utf8').matchAll(/\bt\(\s*["']([^"']+)["']/g)].map(m=>m[1])))].sort();
const result={kind:'static-resource-contract',mobileKeys:mobileKeys.length,desktopKeys:desktopKeys.length,mobileCapabilities,mobile:{},desktop:{}};
for(const lang of ['en','zh','zh-TW','ja','fr','de','es']){
result.mobile[lang]=mobileKeys.filter(k=>typeof lookup(resources[lang].translation,k)!=='string');
const resource=JSON.parse(fs.readFileSync(path.join(repo,'apps/desktop/src/renderer/i18n/locales/'+lang+'.json'),'utf8'));
result.desktop[lang]=desktopKeys.filter(k=>typeof lookup(resource,k)!=='string');
}
fs.writeFileSync(path.join(import.meta.dirname,'locale-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,mobile:Object.fromEntries(Object.entries(result.mobile).map(([lang,keys])=>[lang,{missing:keys.length,examples:keys.slice(0,5)}])),desktop:Object.fromEntries(Object.entries(result.desktop).map(([lang,keys])=>[lang,{missing:keys.length,examples:keys.slice(0,5)}]))},null,2));
```

### mobile-i18n.mjs

这里断言“确实回退 zh”是缺陷复现断言，不是正确产品行为的通过条件。

```js
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const repo=process.cwd();
const ts=createRequire(path.join(repo,'apps/desktop/package.json'))('typescript');
const i18next=createRequire(path.join(repo,'apps/mobile/package.json'))('i18next');
const js=ts.transpileModule(fs.readFileSync(path.join(repo,'apps/mobile/src/i18n/resources.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {resources}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
for(const lng of ['en','zh','zh-TW','ja','fr','de','es']){
const engine=i18next.createInstance();
await engine.init({lng,fallbackLng:'zh',resources,interpolation:{escapeValue:false}});
const details=engine.t('common.discovery',{returnDetails:true});
console.log(JSON.stringify({requested:lng,...details}));
if(!['en','zh'].includes(lng))assert.equal(details.usedLng,'zh');
}
```

## 第一轮资源清理与协调事项（历史）

- 本轮只创建 `/tmp/prompthub-desktop-acceptance.bd3a4Y` 的监督器、3 份脚本、logs/JSON 和 1 个临时数据库；测试自己的 runtime/migration mkdtemp 由 setup/afterEach/afterAll 删除。
- 未启动服务、监听端口、Electron、Playwright、浏览器或模拟器，未改 HOME、系统代理、真实 Agent/profile 或云端。只读列出现有进程/端口，没有停止它们。
- 所有记录 PID 已退出；17:28:45 的 `ps -p ...` 仅表头、exit 1 表示没有存活 PID。工具会话均已收尾。
- 报告写入后清理本组临时目录，并再次检查独占报告及产品 diff 指纹；最终清理结果见末尾记录。
- 总协调应先处理 D1 的实际运行边界、D2/D3，补安全的 shortcuts fixture；随后获取 GUI 授权，按 G01–G29 与各业务组联验；固定候选后单独执行 bundle/perf/full harness 和各原生包门禁。Mobile deferred 能力与 Store 静态预览需在发布范围中明确，不增加功能来填本轮分母。

最终核对：报告 whitespace 检查通过；29 个 GUI 行与 12 个非 GUI 证据行数量核对通过。所有本组进程组均无存活成员；本组独占临时目录已删除并断言不存在。产品范围 diff 指纹仍为 `d9072a530542dbb1764e3330f05df7180f1e9a9dc9809ebf53e8e4b048c2bc4d`，HEAD 未变。没有留下服务或端口；报告内脚本和精确命令保留复现能力，临时原始 logs/JSON 已清理。
