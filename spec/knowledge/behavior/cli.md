# Standalone CLI

产品：CLI（`apps/cli`）；共享业务实现由 `packages/core`、`packages/db` 和 `packages/shared` 所有。此文拥有独立 CLI 分发及 Desktop 对 CLI 的安装/检测集成；Agent 子命令见 [CLI Agent Management](cli-agent-management.md)，Prompt 选择与复制见 [Prompt workspace](prompt-workspace.md#21-cli-prompt-selection)。

## Distribution and Desktop integration

- 2026-10-22 补充复现与功能验收：从 `v0.6.1` 提取原始安装器及依赖到 OS 临时目录，运行同一组 shell 回归；zsh/bash × pnpm/npm 四个正常检测用例均失败，实际 `packageManager` 为 null。修复后的同组用例通过。新增页面用例实际执行 `CLISettings → cliApi → registerCliIPC → CliStatusCache → installer`，断言替换按钮可用、点击后显示 Installed、独立命令写入、旧 wrapper 删除，以及重建 handler 后从持久缓存读回 0.6.1；仅替换 Electron 消息运输、诊断日志、临时缓存目录和远程包，页面在 jsdom 中运行。`pnpm --dir apps/desktop run test:unit tests/unit/main/cli-installer-shell.test.ts tests/unit/main/cli-ipc.test.ts --minWorkers=1 --maxWorkers=1` 共 9 项通过，包含新增调用链用例；更新后的测试类型检查和 ESLint 通过。
- 同日无窗口 Electron 33.4.11 验收使用独立 HOME/ZDOTDIR、精简继承 PATH 和实际 pnpm 9.15.0：旧安装器再次返回无包管理器；修复后识别 pnpm，经真实 GitHub 发布查询下载并安装实际 0.6.1 CLI 到临时 PNPM_HOME，旧 wrapper 清理，状态读回 `installed=true, version=0.6.1`。结束该进程后，新 Electron 进程在同样精简 PATH 下仍识别 0.6.1。验收未修改用户 shell、全局 CLI 或正在运行的应用，测试进程和临时安装已清理。此证据覆盖真实主进程和联网安装，不代表已安装桌面包的原生 UI 或其他操作系统已验收；尚未打包发布。

- Desktop 从 Dock/Finder 等图形入口启动时，CLI 检测与安装必须能读取用户交互式登录 shell 中的工具环境。每次检查或安装只读取一次 PATH/PNPM_HOME，使用 NUL 分隔忽略启动提示，后续定位、版本检查、包管理器安装及全局目录探测共用该子进程环境；不修改主进程环境、shell 配置或系统 PATH。Windows 沿用原生命令定位；shell 不可用时仍检测继承环境中已有的工具。旧版检测快照失效并重新探测，用户无需通过终端启动应用。

- 2026-10-22 GUI 环境检测修复验证：`pnpm --dir apps/desktop run test:unit tests/unit/main/cli-installer.test.ts tests/unit/main/cli-installer-shell.test.ts tests/unit/main/cli-install-environment.test.ts tests/unit/main/cli-install-error.test.ts tests/unit/main/cli-install-source.test.ts tests/unit/main/cli-status-cache.test.ts tests/unit/components/cli-settings.test.tsx --minWorkers=1 --maxWorkers=1` 共 59 项通过，`typecheck:tests` 与受影响 TypeScript 文件 ESLint 通过。新增 `cli-installer-shell.test.ts` 使用隔离 HOME、真实 zsh/bash 和 Node shebang 子进程，在精简 PATH 下通过公开状态/安装入口检查安装文件、安装后识别、旧 wrapper 清理与失败保全；Electron、远程发布及包管理器安装行为由 fixture 替代，未执行真实全局安装或 GUI。macOS 本机只读调用环境解析器，从精简 PATH 成功检测实际 Node、pnpm、npm，父进程 PATH 未改变。尚未打包、替换已安装应用或发布；已安装 0.6.1 不会因源码修改自动获得修复。

- 2026-10-17 CLI 持久缓存验证：7 个 CLI 定向测试文件共 54 项通过，覆盖临时文件缓存重开、24 小时过期、环境变化、手动刷新、并发去重、损坏恢复、写入失败与保留成功快照，以及已安装检测不等待远程发布。`typecheck:tests`、受影响模块 ESLint 和差异空白检查通过。未执行真实全局安装，桌面页面交互仍由用户验收。

- CLI 状态属于本机观察结果。renderer 会话缓存负责页面切换和并发去重；主进程在 `getCacheDir()/cli-status.json` 原子保存版本 2 的成功检测结果与检查时间，跨重启最多复用 24 小时，并匹配本机平台、用户目录和 PATH/PNPM_HOME 指纹。页面显示上次检查时间，缓存不是永久安装事实。首次无缓存、缓存过期/损坏/环境变化、手动刷新或安装完成后才重新检测；失败不覆盖成功快照，读取损坏或写入失败记录日志并继续本机检测。文件是可删除重建的派生缓存，不进 SQLite、备份或同步，无数据迁移，回退旧版本可忽略该文件。安装动作从不依据缓存执行，开始安装时清除快照。

- 检查 CLI 必须先解析命令路径，再识别旧 Desktop wrapper 和 Windows `PromptHub.exe`，不得直接执行未解析的 `prompthub --version`；旧 wrapper 即使在迁移前的数据目录也不能执行。包管理器探测和独立 CLI 版本探测继续在隐藏子进程中运行，不关闭主窗口。状态 IPC 在既有 startup.log 中记录开始、完成或失败及耗时/结果标记，不记录原始诊断、完整命令或凭据；异常继续由现有页面捕获，允许重试。

- 桌面应用不再把 Electron 主进程作为 CLI runtime；旧 `PromptHub ... --cli` 调用必须在
  updater、数据库初始化、workspace migration 和窗口创建之前退出，并提示安装独立 CLI。
- CLI 设置页检测到 userData `bin/` 下旧版 Desktop wrapper 时，只能有界读取并识别该
  普通文件，不能执行它做版本探测。只有 pnpm/npm 安装独立 CLI 成功后，才可再次确认并
  删除完全匹配的旧 wrapper；安装失败或文件已被替换时必须保留。

- CLI 安装时保留用户选择的包管理器；pnpm 读取现有 global-bin-dir、PNPM_HOME 与 `pnpm bin -g`，仅在安装/探测子进程环境补齐 PATH，不写系统/用户环境变量，不运行 pnpm setup 或修改包管理器配置。发现 pnpm 全局目录中的命令时使用同一环境探测版本，并提示终端找不到命令时如何配置 PATH。
- 安装失败沿用现有 IPC 返回，并新增可选 errorCode 分类环境、权限、超时、下载与其他错误；保留有界 stdout/stderr 详情。页面显示本地化简短提示与可展开诊断，重试时清空旧错误；不会在失败时删除旧 wrapper，不自动改用其他包管理器。无数据库或持久化设置变更；旧客户端仍可读取原 error 字段。后端探测/安装异常均进入结构化失败结果。
- CLI 版本独立于桌面应用，开发和生产环境默认安装最新已发布的稳定 CLI。已安装 CLI 的状态检测只执行本地探测，不查询远程发布；未安装时为生成手动安装命令查询发布，实际安装始终重新查询。发布解析通过 Electron 网络栈查询 GitHub Releases，按由新到旧的发布顺序选择实际包含 CLI tgz 的正式发布，跳过草稿、预发布及不含 CLI 的发布；有界查询最多三页，每页 100 条、每请求 10 秒。安装和手动命令共用该次解析出的下载地址，校验下载域名和路径；不拼接桌面版本，不自动构建本地 CLI。查询失败保留本地安装状态、展示诊断并允许刷新，不生成猜测的安装命令。发布结果随成功观察快照缓存，仅供显示手动命令；实际安装重新解析。既有 CLI_STATUS IPC 增加可选 boolean force 参数，旧调用兼容；本地观察增加 checkedAt/fromCache 元数据，无新增通道或数据库 schema。命令定位及 npm 配置探测使用 3 秒超时，避免沿用安装的 120 秒上限。

- 2026-10-17 安装回归：`pnpm --dir apps/desktop run test:unit tests/unit/main/cli-installer.test.ts tests/unit/main/cli-install-environment.test.ts tests/unit/main/cli-install-error.test.ts tests/unit/components/cli-settings.test.tsx --minWorkers=1 --maxWorkers=1` 共 28 项通过。覆盖子进程 PATH/Path 合并、配置目录与 PNPM_HOME/bin、安装后目录探测、失败保留 wrapper、stderr/超时分类、页面诊断/重试/IPC 拒绝。安装编排保留原探测→执行→清理的完整函数，允许超过 50 行；环境构造和错误分类独立，测试替换包管理器进程与 Electron 运输层，未证明联网安装。
- 本机真实只读验证：原环境 `pnpm bin -g` 复现 global bin directory not in PATH；调用实际 `preparePnpmEnvironment` 后同一探测成功且父进程 PATH 未改变。未全局安装软件、未修改包管理器配置或系统环境，未执行 GUI。受影响模块 ESLint 与七语言 49 条文案校验通过。最终 `typecheck:tests` 被同期 Prompt 测试历史（响应判别、DB 查询类型与 window fixture）及 Skill catalogComplete 字段错误阻塞；未更改这些模块，CLI 修改未出现在错误列表中。

- 2026-10-17 CLI 独立版本安装验证：`cli-installer`、`cli-install-source`、`cli-install-environment`、`cli-install-error` 与 `cli-settings` 五个定向测试文件共 39 项通过，源码类型检查、受影响模块 ESLint 和差异空白检查通过。覆盖桌面 0.6.0 使用已发布 CLI 0.5.9、pnpm/npm 共用解析地址、跳过无 CLI 的发布、分页、查询失败保留状态并禁止安装、非预期下载地址拒绝。实际只读调用解析器得到 v0.5.9，下载地址 HEAD 返回 200；未执行真实全局安装或桌面 GUI 操作。

- 同批 `typecheck:tests` 未通过：`tests/e2e/prompt-test-streaming.spec.ts:80` 的既有调用缺少参数（TS2554），本次 CLI 文件无类型报错，未修改该 E2E 文件。

- 2026-10-17 CLI 检查退出排查：六个 CLI 单元/组件测试文件共 44 项通过，`typecheck:tests`、受影响模块 ESLint 与差异空白检查通过。无窗口 Electron 33 实测连续两次状态检查，并在查询超时周期之后确认进程仍存活；以临时 PATH 放置旧 Desktop wrapper 和独立 CLI stub，验证旧 wrapper 未执行、独立版本 0.5.9 被识别，GitHub 发布查询正常。另验证 Electron 网络请求超时可捕获。测试未操作用户桌面窗口或全局安装；用户报告的整个应用退出尚未复现，开发启动日志存在短时间多次启动记录，不能据此确定闪退原因。新增 IPC 诊断用于区分检查中断、检查失败及正常完成。

- 2026-10-17 CLI 会话缓存验证：`cli-settings.test.tsx` 10 项通过，使用真实会话 store 和 IPC 替身，覆盖返回页面保留安装结果、StrictMode/未完成请求重挂载去重、失败不自动重试及手动恢复、安装成功后更新缓存；`typecheck:tests`、受影响模块 ESLint 和差异空白检查通过。未操作桌面 GUI，不改变主进程检测或联网安装策略。


## Shared module boundaries

资源来源、版本、完整包和分发语义引用 [公共资源架构](../structure/resource-library-architecture.md)；Skill、MCP、Plugin、Rules 的持久化和恢复由各共享领域负责。CLI 不另建存储或能力判定规则。活动工作从 [CLI](../../changes/index.md#cli) 或 [Shared](../../changes/index.md#shared) 分类进入；没有独立 CLI 计划不代表跨端工作已完成。
