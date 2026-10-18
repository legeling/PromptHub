# PromptHub 验证入口

测试设计、正常流程优先、黑盒输入、mock 边界及验收结论只在 [测试标准](../../rules/testing-standards.md) 维护。本文保存可执行入口、当前工具边界和 fixture 接入方式；任务结果记录在已有计划或交付说明中。

Skill 领域入口为 [缺陷分类](../../knowledge/reference/skill-defect-taxonomy.md) 和 [回归矩阵](../../knowledge/reference/skill-regression-test-matrix.md)。GUI 与委派操作说明见 [Playwright Test Agents 使用指南](../../../docs/testing-playwright-agents.md)。

## 常用命令与实际范围

在仓库根目录执行。先完成实现批次，再按测试标准选择验证范围；表中的命令不是每次修改必须全跑的清单。

| 范围           | 命令                                                | 实际作用                                                      |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| 聚焦 Vitest    | `pnpm --filter <package> exec vitest run <files>`   | 运行使用 Vitest 的所属 package 中指定用例，路径相对该 package |
| 桌面单元/组件  | `pnpm --filter @prompthub/desktop test:unit`        | 选择 unit project 中的 `tests/unit`                           |
| 桌面功能集成   | `pnpm --filter @prompthub/desktop test:integration` | 选择 integration project，单 worker 执行真实边界基线          |
| 桌面 Vitest    | `pnpm test:run`                                     | 依次执行integration、测试类型检查、unit；不执行 Electron E2E  |
| 桌面 E2E smoke | `pnpm test:e2e:smoke`                               | 构建后执行桌面 smoke 清单；GUI 执行需已获授权                 |
| 桌面 E2E       | `pnpm test:e2e`                                     | 构建后执行桌面 Playwright 套件；GUI 执行需已获授权            |
| 根级 changed   | `pnpm verify:changed`                               | 受影响面的诊断，不能代替未选中的功能验证                      |
| 根级 quick     | `pnpm verify:release:quick`                         | 多 package 快速诊断，包含桌面 integration，不含 E2E           |
| 根级 release   | `pnpm verify:release`                               | 发布候选 harness；须审阅实际选择、执行结果和未验收边界        |
| Harness 自测   | `pnpm test:verification-harness`                    | registry/executor/report 回归                                 |
| 静态检查       | 对应 package 的 `lint` / `typecheck`                | 仅证明配置选中的范围                                          |
| 文档治理       | `pnpm spec:test`                                    | 当前 spec 结构、索引与显式启用的 traceability 检查            |

根级 `test`、`test:run`、`typecheck` 和 `build` 默认转发桌面命令，不能称为全仓验证。共享包、自部署 Web、CLI 和 Worker 使用各自命令，由根级 registry 组织；不能用多个重复嵌套的聚合脚本扩大“通过数量”。

### Electron 隐藏运行与原生窗口专项

桌面 E2E 默认使用隔离 profile 和应用已有的 `--hidden` 启动路径；macOS 的 E2E 进程使用 accessory 激活策略，不出现在 Dock。真实 renderer/preload/IPC/持久化仍运行，不等于浏览器的 headless 引擎，也不修改日常应用设置。`hidden-launch.spec.ts` 检查真实窗口 show/focus 事件均为零，并验证设置导航和重载仍可操作。

显隐快捷键、隐藏启动后恢复 WebDAV 同步、可见启动后自动创建远端备份三项用例带 `@native-window` 标签，默认不选中，断言不改写或伪造。启动自动备份按现行合同要求活跃窗口；手动远端备份/恢复仍在隐藏集合中。需要原生可见窗口的验收必须在用户允许后显式执行：

```sh
PROMPTHUB_E2E_HEADED=1 pnpm --dir apps/desktop exec playwright test --grep @native-window
```

`PROMPTHUB_E2E_HEADED=1 pnpm test:e2e` 选择完整套件并允许显示窗口；普通 `pnpm test:e2e` 的通过结果仅覆盖隐藏运行集合，不能作为这三项原生窗口验收证据。Playwright 的浏览器 `--headed` 参数不控制 Electron 启动方式。撤销隐藏执行可使用上述显式环境变量，无数据迁移或偏好回滚。

发布 CI 的既有 Linux `xvfb-run` 步骤显式设置 `PROMPTHUB_E2E_HEADED=1`，在虚拟显示器中保留原生窗口门禁；本地默认隐藏不会缩减该 CI 步骤的选择范围。

发布验证 checkout 保留完整 Git 历史，供历史版本源码 fixture 核对和升级执行使用。Linux runner 安装 GNOME Keyring，并在独立 D-Bus 会话中解锁临时 runner 的密钥环；该服务覆盖仍调用系统凭据接口的集成测试。Quality 的 Shared/Desktop 检查同样保留完整历史，并使用相同的凭据服务；Shared 选择的 Database 检查也包含 Desktop 集成用例。本地根级命令继续保留依赖与资源组约束。发布 CI 从同一 registry 生成 14 个独立 runner 分组（8 个桌面 unit 分片、集成、桌面运行时、Core、CLI、Web/Worker、静态与共享检查），每组 concurrency=1，预算和用例选择不变。unit 与集成可同时收集证据，最终汇总必须同时通过；本地功能基线先行顺序不变。构建产物依赖保留在同一分组，Worker dry-run 与 Web 构建同组。JSON 报告和桌面失败附件作为 Actions artifact 保留。

CLI 测试的进程入口位于 `apps/cli/out/cli-test-*`，因此 CLI 构建与测试共用串行资源组，避免 Vite 清理输出目录时删除运行中的测试入口。Windows 执行器通过 Node 启动 pnpm 的 JavaScript 入口；超时清理限定于当前检查的进程树，避免子进程持有输出管道而阻塞报告生成。

Electron E2E 通过 `-r tests/e2e/helpers/isolated-keyring.cjs` 在产品入口执行前替换操作系统凭据运输，密钥写入隔离 profile。应用重开时必须先恢复同一测试凭据，再执行真实设置解密和启动；不能在 `electron.launch()` 返回后才注入，否则启动读取与后续写入会使用不同存储。该文件只由测试命令预加载，不进入生产启动流程。

隐藏启动恢复 WebDAV 同步与共同基线重开用例共用本地 HTTP WebDAV fixture，保留 GET/PUT、条件写入、目录创建及真实 head 发布；旧 WebDAV IPC mock 不覆盖主进程当前共同基线同步入口，不能用于该启动验收。

`pnpm --filter @prompthub/desktop perf:budget` 使用项目已有的 `tsx` loader 执行 `scripts/check-large-data-budgets.ts`，遵循 Desktop 当前模块格式并解析被测模块的扩展名省略 import；脚本同时进入 `typecheck:tests`。不改变业务模块或预算阈值。它测量本地 Prompt/Skill selector 的固定数据集，不证明真实窗口滚动或大型 SQLite 工作流。

## 功能基线入口与证据边界

以下是现有用例入口和配置范围，不是本文件对其当前通过状态的声明。

| 示例                                                                                     | 真正执行的行为                                                                    | 接入与限制                                                                                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [Skill 公开流程](../../../apps/desktop/tests/integration/skill-public-workflow.test.ts)  | 创建、编辑、版本、包安装/更新、分发、重开、删除与非法输入，使用真实业务和磁盘状态 | 由 `test:integration` 及所有 profile 的 `desktop-integration` 选择；Electron 运输层被替换，不证明真实窗口与进程通信 |
| [Skill Electron 生命周期](../../../apps/desktop/tests/e2e/agent-skill-lifecycle.spec.ts) | 实际界面创建、编辑、版本、分发、重启和删除                                        | 在桌面 `test:e2e:smoke` 清单中；root 的 `desktop-e2e-smoke` 依赖构建后执行，仅有文件或清单不代表已运行              |

测试类型检查通过 `pnpm typecheck:tests` 调用桌面 [tsconfig.test.json](../../../apps/desktop/tsconfig.test.json)，选入源码、所有桌面测试、fixture/helper、E2E 和测试配置。它已接入 `test:run` 及所有根级 profile 的 `desktop-test-typecheck`。类型检查不会运行 Electron，不能替代 GUI 验收；生产源码的 `typecheck` 与测试类型检查分别报告结果。

## 测试结构与审查范围

目录按证据边界组织，功能正常/异常场景按领域放在同一层。根级命令不建立另一套测试框架：

| 所属位置                                 | 职责与执行边界                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/desktop/tests/unit/`               | 纯逻辑、局部服务、store 与组件契约；jsdom/Window/virtualizer mock 只在 unit project 生效     |
| `apps/desktop/tests/integration/`        | 真实模块协作和持久化边界；默认 Node，仅加载隔离 runtime setup，需要 DOM 的用例显式声明 jsdom |
| `apps/desktop/tests/e2e/`                | Playwright 操作真实 Electron，使用隔离 profile；不由 Vitest 选择                             |
| `apps/desktop/tests/{fixtures,helpers}/` | 局部夹具与环境工具，不能代替被测业务；integration helper 放在所属 integration 目录           |
| `packages/{core,shared}/tests/`          | 所属共享包的逻辑与存储工作流；core 使用 Vitest，shared 使用 Node test runner                 |
| `apps/{cli,web,web-cloudflare,mobile}/`  | 保留各自已存在的测试入口；Web 的 `src/**/*.test.*` 仍与对应路由/客户端同属一个包             |
| `scripts/verification/tests/`            | 根级清单选择、依赖执行、超时和报告契约                                                       |

桌面 [workspace](../../../apps/desktop/vitest.workspace.ts) 统一登记 unit/integration，公共路径解析与预算在 [Vitest 配置](../../../apps/desktop/vitest.config.ts)；不保留旧目录转发或第二份测试清单。`test` 是两个 project 的交互运行入口；正式桌面验收使用 `test:run`，保证正常功能基线先于单元回归。package 的原子命令仍可单独执行，根级 harness 直接选择原子检查，避免嵌套重复执行。

2026-09-12 本批起始盘点为 830 个 app/package 测试文件，其中桌面 654 个。盘点覆盖文件与执行入口；逐条行为审查聚焦桌面 integration、共享 setup、配置契约和 Skill 公开流程，不表示已逐条验收全部测试。

已确认并纳入本批整改：

- 6 个依赖 mock store/editor/installer 的组件协作文件从 `integration/components/` 移至 `unit/components/`，去掉误导性的 integration 名称，保留局部断言。
- integration 与 unit 分别加载 setup；全局 DOM/Window/虚拟列表 mock 不再自动进入真实业务集成。
- 已有测试专用 tsconfig 从未接入命令且排除了 E2E；本批接入完整测试类型检查。
- 补充通过公开 update 清空正文、保留包文件和旧版本并重开的正常流程。Skill 的 10 类非法写入和 4 类包更新输入从循环断言拆成独立命名用例；每例独立准备正常数据，检查错误、原记录/历史/文件，以及重开后的结果。
- 配置测试不再绑定 Agent 文档中的偶然措辞；检查真实 TOML 结构、工具启动参数和权威规则入口，并验证合并后的项目匹配范围。
- 修复首轮审查确认的基础用例缺陷：独立执行进度条的两个断言，使用真实 SQLite `readOnly` 选项，修正 HTTP/DNS mock 的重载类型、异常组件返回类型与过期类型导入。

[备份文件系统用例](../../../apps/desktop/tests/integration/services/database-backup-filesystem.integration.test.ts) 验证真实文件字节和快照往返，元数据与媒体 IPC 仍是夹具；它不是完整数据库备份/恢复或真实 Electron IPC 验收。Prompt、Rules、MCP、Plugin、Agent 等全部核心功能的正常基线，以及既有 unit 中的断言质量，仍需按领域继续审查补齐，不能由本批结构整改推断为全覆盖。

首次接入测试类型检查时，130 个桌面测试/辅助文件暴露 410 个错误：包括未按真实签名声明的 mock、缺少协议/状态字段的旧夹具、已删除的组件参数与未更新的方法调用。这是已确认的存量缺口；不得通过排除这些文件、重新声明 `Window.api: any` 或忽略错误解除门禁。后续按领域先修正常数据与公开调用，再补异常输入；每批都需重新执行对应行为，不能只消除类型报错。

全量桌面单元审查首轮实际执行 633 文件、5664 用例：5656 通过，8 失败。失败涉及已移除的自动扫描参数、未开启手动扫描的夹具、旧的 renderer 文件写入职责，以及非法持久化语言回退。已确认的契约漂移集中修正；语言用例保持主进程语言应生效的预期，并分别覆盖现有持久化版本 20 与迁移版本 19。

本批实际验证（2026-09-12）：

| 检查              | 结果与边界                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根级 harness 自测 | 22 通过；覆盖 profile 选择、依赖、超时与报告                                                                                                                                  |
| 集成基线          | 18 通过：Skill 3 个正常流程 + 14 个独立异常输入，备份文件往返 1 个。后续仅复跑备份用例，修正 Node 全局 localStorage 遮蔽 jsdom Storage 的环境问题，并断言不再吞掉存储读取失败 |
| 全量桌面 unit     | 首轮 633 文件、5664 用例，5656 通过、8 失败；已完成一次全量执行                                                                                                               |
| 失败用例定向修复  | 原 8 个失败中的 7 个已修正并复跑通过；补充正常成功反馈、手动扫描前置状态和真实清空正文流程。未重复执行全量套件                                                                |
| 配置回归          | 7 通过；实际读取 workspace、tsconfig、package scripts 和 Agent TOML，检查合并后的匹配范围及正常基线执行顺序                                                                   |
| 测试类型检查      | 仍失败：114 文件、308 个错误，较首次减少 102 个；本批修改/移动的测试与配置文件没有类型诊断                                                                                    |
| GUI / 跨产品      | 未运行 Electron E2E、构建及其他 app/package 全量验证；本次未获 GUI 控制授权                                                                                                   |

已保留的运行失败是 [语言回退用例](../../../apps/desktop/tests/unit/stores/settings-language.test.ts) 的版本 19 非法语言迁移：主进程配置 `zh`、renderer 持久化 `unsupported` 时预期 `zh`，实际 `en`；同样输入在版本 20 通过。不能将预期改成 `en` 或跳过版本 19。正式桌面与发布验证尚未通过。

下一批先处理有效失败的语言迁移路径，再按共享 mock/夹具、AI transport 与模型协议、Agent adapter 参数、组件/Store 数据契约清理类型错误；每个领域同时验收正常公开调用，再补齐异常输入。`tests/helpers/window.ts` 的部分 mock 与实际 preload 类型之间的缺口也必须修正，不能恢复全局 `any` 声明。Prompt、Rules、MCP、Plugin、Agent 等领域的真实基线覆盖仍需逐项审查。

## 2026-09-24 工作区提交验证

本次对待提交的完整工作区执行 quick profile，选择 governance、shared、database、core、cli、desktop、web-self-hosted、web-cloudflare，check 并发为 2。结果为 18 项通过、3 项失败、8 个 Desktop unit 分片因集成前置失败而阻塞；不是发布通过。

- 源码检查：所选范围的 lint/typecheck 均通过；Desktop 测试类型检查仍失败，包含旧 fixture 的协议类型、缺失字段和不完整 bridge mock。
- Web：423 用例通过；Worker：29 用例通过；CLI：124 用例通过；共享测试与治理检查通过。
- Core：710/711 通过。文件系统 inventory 用例在并发执行时触发 5 秒超时；单独执行该文件的 6 项全部通过，不能据此抹去并发运行失败。
- Desktop integration：首轮 18/19 通过。备份文件用例的旧夹具没有实现当前原子恢复入口；补齐 restoreGraph fixture 后，该用例单独复跑通过，恢复数据断言保留。元数据 IPC 仍为夹具，不代表真实 SQLite/IPC 验收。
- Desktop unit：单独执行完整 unit project（2 workers），634 个文件中 590 通过、44 失败；已执行用例 4,849 通过、1 失败。43 个文件因本机 Electron 安装不完整无法加载；版本 19 非法持久化语言仍得到 en，而主进程配置和预期为 zh。未跳过用例或修改预期。
- 根级 harness 自测：22 项通过。
- 未执行 Electron GUI、打包、远端服务或完整历史用户 profile 升级验收。完整数据架构迁移仍未完成；提交全部工作区不代表这些边界已通过。

命令：根级 pnpm exec node --experimental-strip-types scripts/verify-release.mts --profile quick 配合上述 surface；pnpm test:verification-harness；Desktop pnpm exec vitest run --project unit --minWorkers=2 --maxWorkers=2；失败文件分别以单 worker 定向复跑。

## Harness 选择与发布范围

唯一可执行清单是 [checks.mts](../../../scripts/verification/checks.mts)。本地 runner 与 CI workflow 选择其中的 profile、surface 和 risk layer，不维护另一份命令清单。

仅列出 release 中桌面相关检查，不执行测试或启动 GUI：

```bash
pnpm verify:release --surface desktop --list --format json
```

列出 quick 的选择范围：

```bash
pnpm verify:release:quick --list --format json
```

- `changed`、`quick`、`release`、`package` 分别服务受影响面诊断、全仓快速诊断、发布候选准入和单平台非发布打包。桌面 integration 和测试类型检查在所有 profile 中；E2E smoke 仍只在 release/package 中。桌面 unit 依赖 integration 通过后执行，功能基线失败会阻塞这些单元分片。
- `--surface`、`--exclude-layer` 可缩小选择；必须说明被排除的边界，不能把缩小后的成功称为完整 release 通过。`--list` 只证明选择结果，不证明测试执行或通过。
- 默认并发上限为 2，每个 check 有超时；依赖失败阻塞下游，独立 check 仍继续执行。
- `--report <path>` 可选，输出有界、脱敏 JSON；显式报告路径不可写会导致命令失败。保留失败、跳过、阻塞和后续确认结果。
- Pull Request 的 Quality Checks 始终执行 spec 治理、CI 配置契约、显式启用的 traceability 和文件大小门禁。
- Self-Hosted Web workflow 负责 `apps/web` 与 Docker；Cloudflare Worker workflow 通过同一 registry 验证 `apps/web-cloudflare`，Worker-only 变更不触发无关 Docker 构建。
- 跨 package export / workspace 接入变更需要根级构建证据；Web 与 Worker 的长期实现各有独立 typecheck、lint、test 和构建入口，桌面结果不能代替它们。

## Fixture 接入

隔离、真实 I/O、模板适用范围和资源清理遵循 [测试标准](../../rules/testing-standards.md)，以下仅列当前实现入口：

- 桌面领域 builder 位于 `apps/desktop/tests/fixtures/`；局部组件 fixture 与 mock 放在所属测试附近。
- [Skill runtime helper](../../../apps/desktop/tests/integration/helpers/skill-runtime.ts) 使用临时 profile、真实初始化/authority 启动路径、磁盘 SQLite 与隔离平台目录；只替换 Electron 运输和用户目录边界。
- 本地 Git/文件包夹具在临时目录中构建，保留实际分支、目录层级、文件清单和字节。远端在线验收独立记录，不能由本地 fixture 推断。
- CLI 的 [global setup](../../../apps/cli/tests/global-setup.ts) 创建已关闭的 SQLite 模板，由 [CLI harness](../../../apps/cli/tests/helpers/cli-harness.ts) 复制到独立数据目录。初始化、迁移和并发测试须绕过模板。完整 CLI suite 默认预算 75 秒，本地诊断可通过 `PROMPTHUB_CLI_TEST_MAX_MS` 临时调整。
- CLI 独立进程验收在 global setup 中按正式 Vite 配置构建一次临时 CJS 产物，由各子进程启动该产物，避免每条命令重复装载和编译整个 TypeScript 图；构建耗时仍计入同一 75 秒预算。README 的 `pnpm dev` 用例继续验证源码入口，数据库并发 fixture 仍使用独立进程。临时构建目录和环境变量在 teardown 中回收，不复用可能过期的已有产物。
- Self-Hosted Web 的 [global setup](../../../apps/web/tests/global-setup.ts) 创建已迁移并关闭的模板，测试目录复制使用；新库、损坏、锁与恢复场景自行构造前置状态。

## Pull Request 安全扫描

[ThreatCrush workflow](../../../.github/workflows/threatcrush-scan.yml) 扫描完整 checkout，
默认仅报告发现，不因已有或新增漏洞发现阻断构建。工具安装、扫描或报告解析失败
必须失败并显示 NOT RUN；只有报告确认有效的 SARIF 才可更新 Security tab。
PR #206 按已确认的先合并、后修复顺序纳入；这不代表扫描或发布验收通过。

- 保持 `pull_request` 事件、action SHA 固定、checkout 不持久化凭据，以及扫描器
  `0.11.9` 的 tarball SHA-512 校验。使用根 packageManager 指定的 pnpm，关闭安装脚本，
  工具依赖与产物只进入 runner 临时目录，不改项目依赖或全局安装环境。tarball 校验
  不等于传递依赖完整锁定；扫描器依赖仍按其发布 manifest 解析。
- Git 变更文件以 `--name-only -z` 运输，SARIF URI 只在报告边界解码一次；空格、
  Unicode、换行与百分号文件名不能误归到历史 backlog。无文件位置的发现单独报告，
  不声称为历史问题。报告不显示扫描内容片段，文件名和 rule ID 转义 Markdown。
- [Node 报告入口](../../../scripts/threatcrush-report.mjs) 取代内嵌 Python；
  [回归测试](../../../scripts/threatcrush-report.test.mjs) 进入 `pnpm test:ci-config`
  与根级 governance harness，覆盖真实 Git 文件清单、报告 CLI 的退出码/摘要/有效性
  输出、损坏或缺失报告及扫描失败。扫描器本体、GitHub token 权限、Security tab
  上传与 PR 评论不是本地报告测试的验收范围。没有远端 job 成功证据时不能称为已验收。

聚焦命令：`pnpm exec node --test scripts/threatcrush-report.test.mjs`；门禁命令：
`pnpm verify:release:quick --surface governance --concurrency 1`。

验证（2026-10-13）：隔离提交候选的 `pnpm test:ci-config` 35/35 通过，其中报告回归
23 项。首次 quick governance 的 CI 配置检查因无位置用例的否定断言误匹配“not
attributed to the pre-existing backlog”失败；改为核对不存在历史分组后复测通过。
同批 spec 与文件大小检查已通过，未重复运行未受影响的检查。Node 语法、workflow
YAML/action SHA、Shell/评论 JavaScript 解析和相关格式检查通过。

隔离源码变异撤销 URI 解码、将 NUL 分隔改为按空白拆分，并将失败退出码改为成功，
命中 13 项业务断言失败（23 项中 10 通过、13 失败，退出码 1）；未改写工作区源码。
扫描器固定 tarball 的 SHA-512 与当前下载字节一致，未在本机安装或执行该工具；
实际 GitHub scan job、Security tab 和 PR 评论仍待远端运行验收。

## 发布 CI 并行与证据汇总（2026-10-18）

`scripts/verification/ci-plan.mts` 只划分 `checks.mts` 的 release 清单，
不维护第二套测试命令。`ci.mts` 复用现有执行器和脱敏报告；每组串行，
runner 之间隔离。仅 unit 对集成功能基线的先行关系移到最终汇总关卡；
其他跨组依赖报错，防止在缺失构建产物时执行。

五平台打包与验证同时开始，matrix 使用 fail-fast=false。最终 `verify`
拒绝失败、取消、阻塞、跳过、缺失、重复、多余或其他提交/运行的报告；
重跑允许复用同一 run、同一提交已成功分组的证据。`release` 必须同时依赖
`verify` 与全部 `build` 成功，仅下载 `*-build` 产物。签名、公证、
Windows 两次启动、更新清单核验和草稿发布边界不变。

依赖缓存按 lockfile 失效；验证组共同读取，仅一组保存，减少重复上传。
目标为约 10 分钟完整流水线，属于性能目标而非公证/排队时限保证。
回滚 workflow 和 CI 分组入口即可恢复原串行入口，无用户数据迁移。

本地验证：harness 37 项通过（其中 CI 分组/汇总 11 项，包含真实 CLI 读写报告）；
workflow 10 项通过；CI 配置 38 项及其附加 11 项通过；新增入口严格类型检查通过。
静态子集首轮 15 项通过、旧串行命令断言 1 项失败，更新后 governance 3 项通过。
完整远端并行运行和实际耗时仍需以 Actions 运行结果为准。

### 首次并行 CI 实测

[Actions 39097497008](https://github.com/legeling/PromptHub/actions/runs/39097497008)
验证提交 `9a415d4ff95feb0f0646db822eedb21ff64abdd0`（包含资源跨端批次）。
从 04:33:15 到 04:42:30 UTC 共 9 分 15 秒；14 个验证组均启动，
8 个桌面 unit 分片各耗时 1 分 31 秒至 2 分 27 秒，集成组 6 分 37 秒。
此前串行 verify 约 28 分钟，随后 Intel 打包约 10 分钟。此次为不同产品
内容且有失败的观测值，不代表相同提交的成功发布性能对照，也不保证 Apple 延迟。

Core、CLI、静态与共享组通过；Linux、Windows x64/ARM64、macOS Intel
构建通过。macOS ARM 的签名公证校验遇到 Apple CloudKit `-1005` / stapler 68。
桌面单元、集成、E2E 和 Web 有未通过项，完整清单见[质量记录](../../issues/active/quality.md)。
最终 verify 阻止发布，release 未执行。当前 v0.6.0 标签与草稿未变更。
