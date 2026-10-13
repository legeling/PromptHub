# Skill 核心操作审查与验收

日期：2026-10-13。结论：本轮复现的三个缺陷已修复并完成相关自动化和隔离 Electron 验收；未执行的跨平台、远端和发布门禁不计为通过。
初次审查只新增回归测试和本记录。后续修复分别关联 #227（首启）、#228（扫描导入）、#229（文件显示）；下面保留原失败基线，修复验收结果单列。

## 测试基线

基线 HEAD 为 `ac0e188cbadce75f465759c589af44717ed80efe`，包含当时未提交的工作区源码。
隔离副本的 2,247 个 Desktop/CLI/Web/package 源码、测试和配置文件摘要为
`8cf9eb6898b15af31068a585f25c39c9a37129383f0e8e56a5eb0c3e24b55352`。
新增测试另列，不混入基线摘要。复用现有 pnpm 9.15.0、Node 26.11.1 和依赖；
未覆盖共享工作区的构建产物、用户 profile、平台目录或其他对话改动。
最终新增测试 SHA-256：`d0a12d56fa498c8535d296b9f68b567e7c779f417795db098db99ce71328157a`。

## 已复现问题

### P1 首次启动不能手工创建 Skill

全新隔离 profile 启动后，通过 New → Create Manually → Create Skill 提交合法输入，
得到 `Skill library requires completed canonical storage migration`，库中没有新增记录。
主进程日志为 `startup:canonical_storage_authority / waiting-renderer-migration`。
renderer 完成 `renderer-persistence-v1` 后，Skill 库仍未初始化；重开同一 profile 后
启动结果为 `published`，相同手工创建流程成功。

原因边界：`apps/desktop/src/main/services/canonical-storage-startup.ts` 在 renderer
迁移标记缺失时返回等待状态；`settings.ipc.ts` 完成迁移后没有继续发布 authority。
`packages/core/src/skills/library-commands.ts` 正确拒绝未准备好的写入。
`tests/integration/helpers/skill-runtime.ts` 在注册前先完成迁移，不能证明真实首启可用。
现有真实 E2E `agent-skill-lifecycle.spec.ts` 已包含新 profile 创建断言；本轮没有
运行该 Playwright Test 文件，失败证据来自实际 Electron GUI，不冒充自动化红测。

### P1 扫描结果不能导入 My Skills

通过原生目录选择器选择隔离目录，扫描发现合法完整 `gui-package`。
Copy 和 Link 导入均显示 `Imported 0 / 1 ... failed 1`，原因是
`Package imports must use the package lifecycle`。外部源文件保留，没有产生库记录。
既有 Plugin 子 Skill 正常导入集成也失败：预期 `importedCount=1`，实际为 0。

`skill-library-actions.ts / importScannedSkill` 仍携带 `local_repo_path` 调用
`window.api.skill.create`，而当前 Core 已要求包导入使用 package lifecycle。
本地、Project、Agent、Plugin 扫描导入均复用此函数；本轮 GUI 实际执行的是
本地 copy/link，Plugin 通过真实 renderer/store/preload/IPC/SQLite 集成执行。
没有把未点击的 Project/Agent 入口记为 GUI 通过。

既有回归：`apps/desktop/tests/integration/release-acceptance-agents-assets-skill-combinations.test.tsx`，
`imports Plugin child Skills through the real renderer action into an independent library and preserves nested package bytes after reopen`。
这是此前已有的未修复缺陷，本轮确认其影响不止 Plugin。

### P2 文件保存成功后查看器显示空白和错误大小

实际 GUI 创建嵌套文件并保存文本，磁盘与公开读取接口都返回正确内容；
编辑器却变为空白、显示 0 B。IPC 的 canonical 写入分支返回 `true`，
`SkillFileEditor.tsx / saveCurrentFile` 把该值当成文件对象，缓存丢失 `content`。
这次没有观察到磁盘内容丢失，不能描述成已经发生数据丢失。

新增持久回归：`apps/desktop/tests/integration/skill-file-save-display.test.tsx`。
真实 preload → IPC → SQLite/完整包发布；等待保存完成通知后退出编辑态，
断言查看器文字和 18 B，并关闭重开核对磁盘文本仍在。
最终非零退出码 1：预期 `Saved nested text`，实际空白，大小文本缺失；重开读回通过。
只替换编辑器输入机械、Toast 和无关自动同步，不替换保存、读取或存储业务。
初版只有编辑态 textarea 值的断言不足，已经改成查看态、大小及重开断言；
不把初版通过或中间超时计入最终结果。

## 操作覆盖与证据层

| 操作 | 本轮证据 |
| --- | --- |
| 创建、读取、元数据/标签编辑 | 真实 IPC/SQLite 与 CLI/Web；GUI 首启失败，重开后创建和编辑成功 |
| 完整目录导入、嵌套/二进制保全、同名不同源 | Desktop/Core/CLI 实际文件与重开；扫描导入失败，Git/商店包生命周期基线通过 |
| 文件新增、编辑、改名、删除 | Core/IPC 包字节和恢复；GUI 嵌套文件写入成功但显示错误 |
| 快照、历史、差异、回滚 | Desktop/Core/CLI/Web；GUI 创建快照、恢复 v1，重启后旧描述、入口文件与 v3 历史保留 |
| 来源检查、更新、冲突、失败保全 | 真实本地包及临时 Git 仓库；远程网络运输替身，#218 深层路径与附件变化通过 |
| Agent/Project copy、symlink、卸载、删除 | IPC/CLI/真实目录；GUI Codex symlink 安装/卸载、Claude copy 安装及完整辅助文件读回；删除同时清理所选 copy、库内包/版本，保留外部源 |
| 批量管理、收藏、标签/来源筛选、各视图状态 | 组件/store 契约；GUI 收藏、库列表与计数；部分平台批量管理连接真实存储，不等于全部批量 GUI 验收 |
| ZIP/JSON 导出、快照和二进制恢复 | Desktop/CLI/Web 实际清单、字节、重开及非法快照拒绝；未点击原生导出保存器 |
| 安全扫描、翻译、个人笔记 | 独立扫描与业务分离、sidecar/cache 契约；AI 网络替身，未使用真实模型/账号 |
| Agent/Project 扫描、内置保护、共享目标、迁移 | 组件/真实目录及 CLI；Antigravity 迁移、冲突/中断恢复和卸载通过 |

SR-022 至 SR-024 回归矩阵仍描述旧审批/信任流程，与稳定 Skill 文档中“独立内容扫描
不阻止业务操作”的现行要求不一致；后续应更新旧矩阵，不应恢复旧业务门槛。

## 最终结果与复跑

| 检查 | 结果 |
| --- | --- |
| Desktop 7 文件功能集成 | 41 pass / 1 fail |
| Desktop Skill 单元/组件 156 文件 | 1,552 pass |
| Core Skill 16 文件 | 127 pass |
| CLI Skill 6 文件 | 30 pass |
| Web Skill 与 desktop bridge 7 文件 | 55 pass |
| 新增文件显示回归 | 1 fail，两项可见结果断言失败，存储与重开断言通过 |

合计 1,805 pass / 2 fail，1,807 个不同自动化用例；另有 GUI 首启失败。
Desktop 源码/测试、CLI、Web 类型检查，以及新增测试 ESLint、Prettier 通过。
隔离 Desktop main/preload/renderer 构建通过。新测试由常用 integration project
自动选入；没有调整门禁、skip、降低正确预期或为通过修改产品。

从仓库根目录复跑（均使用隔离 fixture）：

```sh
pnpm --dir apps/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1 skill-public-workflow skill-nested-git-source-update skill-platform-management antigravity-skill-migration release-acceptance-agents-assets-packages release-acceptance-agents-assets-git release-acceptance-agents-assets-skill-combinations
pnpm --dir apps/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1 skill-file-save-display
pnpm --dir apps/desktop exec vitest run --project unit --minWorkers=1 --maxWorkers=2 skill
pnpm --dir packages/core exec vitest run --minWorkers=1 --maxWorkers=1 skill
pnpm --dir apps/cli exec vitest run --minWorkers=1 --maxWorkers=1 skill
pnpm --dir apps/web exec vitest run --config vitest.config.ts --minWorkers=1 --maxWorkers=1 skill src/client/desktop/install-bridge.test.ts
pnpm --dir apps/desktop typecheck:tests
pnpm --dir apps/cli typecheck
pnpm --dir apps/web typecheck
```

测试验证的是上述基线及入口，不是所有文件系统/平台组合的穷尽测试。
真实 GitHub/Gitea/Cloud 账号、AI 服务、Windows/Linux 设备、Web GUI、跨设备恢复和
完整 release harness 未执行。Web 的本机扫描和平台安装按产品合同不支持，不计为缺陷。
用户日常实例和个人数据未纳入测试。三次 Electron 实例 PID 1204、4885、25100
以及最终检查进程均已退出，19482 端口无监听；专用 Playwright 会话和 native 控制
会话已释放。唯一任务临时目录已移至系统废纸篓（可恢复），包含隔离构建、测试
profile、测试 home、源包、日志和截图；保留的交付只有本记录及新增失败回归测试。

## 三项修复验收（#227 / #228 / #229）

后续基线 HEAD 为 `45f70a81`，隔离源码副本摘要为
`35799ba9a7f9c724a12d2ec8b376bc00e235d4bf4522271eb522851ec05bb1f7`。
此副本包含原有并行未提交源码，不把整体副本冒充三个提交的纯净树。
Link 元数据修复后的隔离构建源码摘要为
`8407c91f73839f4e57878c0e2da291a7935e07c9f30990eff6d951e0db6188ab`；
随后仅调整回归 inventory 标记断言、无用参数/常量类型声明和验收文档。
另从各独立暂存树导出只包含 HEAD 与本批修复的源码，首启 2 条、扫描 4 条、
文件显示 1 条及 Desktop 源码/测试类型检查均通过，不依赖并行未提交改动。

- #227：迁移 IPC 等待现有 canonical 发布完成，关闭旧数据库并重绑全部业务 IPC。
  `skill-first-launch.test.ts` 的 2 条回归通过：全新 profile 同进程创建、重复迁移、
  发布失败后保留可用连接、显式重试和关闭重开。实际 Electron 全新 profile 首次
  手工创建成功，无重启或 fixture 预先发布 authority。
- #228：扫描结果改用唯一 package lifecycle，删除 renderer 的 create/copy/update
  和第二套补偿链。来源标签、用户标签与 baseline 在提交时建立；Link 外部目录由
  设备绑定恢复，不转换为托管副本。`skill-scanned-import.test.ts` 4 条通过，包括
  Copy/Link 完整字节、重开、文件/元数据编辑、删除保全和来源入口消失；Plugin 子 Skill
  组合 4 条通过，保持 content-only create 拒绝断言。workspace inventory 只排除
  已声明的 hydration 标记，不豁免实际 package 文件。
  Link 元数据编辑新增断言先复现路径被转为托管副本；修复从外部完整包暂存，
  原子替换入口并发布。在 finalize 注入失败时，入口完整字节与库记录保持原状，
  重开后可成功重试；`skill-public-workflow.test.ts` 的 hydration 标记改为直接读文件
  验证 64 位摘要，未移除缓存完整性断言。相关 Core 4 文件 31 条和公共工作流
  17 条复跑通过。
- #229：本机写入 IPC 与 preload 统一 `Promise<void>`；保存完成后查看态缓存使用
  写入内容，不把布尔值当成文件对象。原失败回归现通过，磁盘、查看器 18 B 和
  关闭重开均有断言。

本批运行并通过的不同自动化用例：Desktop 功能集成 11 文件 52 条、单元/组件 159 文件
1,583 条、Core 16 文件 127 条、CLI 6 文件 30 条、Web 7 文件 55 条，合计
1,847 条通过。首次聚焦命令暴露新增测试初始化/类型问题和 workspace 缓存标记
差异，已集中修正；随后只重跑受影响文件，没有重复计数或删除业务正确预期。
Desktop（含测试）、Core、CLI、Web 类型检查和相关 Desktop/Core ESLint 通过，
隔离 Desktop main/preload/renderer 构建通过。

实际 macOS Electron GUI：原生目录选择器扫描 2 个完整包，分别 Copy 与 Link 导入，
My Skills 计数从 1 到 3，完整二进制 SHA-256 相等。Copy 的嵌套文件经 Edit → Save
→ Cancel 返回查看态，文字为 `Saved GUI text`、大小 14 B。退出真实进程后重启，
列表保留 3 项、Link 路径仍是外部目录、查看器与磁盘文字/大小正确；通过确认弹窗
删除 Link 记录后，库计数变为 2，外部入口、嵌套文本和二进制均保留。
上述 GUI 只用 API 做窗口显示和后置读回，不代替被测创建、扫描、导入、保存或删除。
补充 Link 元数据流程使用 API 准备新 Link 夹具，然后通过 Edit Skill → Description
→ Save（键盘 Enter）保存 `Metadata GUI acceptance`。UI 版本变为 v2，外部入口和
库记录描述一致，路径仍为外部目录；退出进程重启后列表描述与路径仍正确。
鼠标稳定性等待及 native 控制通道超时，因此该补充流程不声称截图视觉验收；
不把夹具 API 导入重复记为 GUI 导入通过。

新增复跑：

```sh
pnpm --dir apps/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1 skill-first-launch skill-scanned-import skill-file-save-display
pnpm --dir apps/desktop exec vitest run --project unit --minWorkers=1 --maxWorkers=1 settings-renderer-persistence-ipc
pnpm --dir packages/core typecheck
```

CLI/Web 使用各自初始化、CRUD、完整包/版本/文件接口回归；Web bridge 的本机扫描和
平台安装仍明确 unsupported，不增加另一套本机能力。未执行 Web GUI、真实远端
账号、AI 服务、Windows/Linux 实机及完整发布 harness；本地验收不等于发布完成。
修复使用三个独立提交和相应 `Closes`，未推送，远端 issue 仍 open。
本次四个 Electron 进程 PID 43456、51033、59882、66018 均已退出，专属浏览器会话
与 native 控制已释放；19483 端口无监听。任务临时资源在交付前移至系统废纸篓，
可恢复；用户原有环境不变。
