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
- Self-Hosted Web 的 [global setup](../../../apps/web/tests/global-setup.ts) 创建已迁移并关闭的模板，测试目录复制使用；新库、损坏、锁与恢复场景自行构造前置状态。
