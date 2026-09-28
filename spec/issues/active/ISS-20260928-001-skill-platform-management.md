# Skill 平台安装、卸载与入口反馈

- ID: `ISS-20260928-001`
- Status: local_done / release_pending（原反馈客户端与原生 Agent 验收待核实）
- 来源：2026-09-18 用户反馈截图，2026-09-28 本地核查；反馈所用版本未知。
- Owner: desktop Skill distribution
- Contract: `spec/knowledge/behavior/skills.md`

## 现象与根因

1. 快捷安装弹窗不能反选已安装平台：当前代码确认。`SkillQuickInstall`
   禁用已安装项，全部安装后隐藏列表和操作按钮；提交仅调用安装流程。
2. 批量安装、卸载难以发现：当前商店已有批量导入，My Skills 已有批量分发及
   撤回。商店入口只有图标；My Skills 入口名为“批量分发”，未表达卸载能力。
   不能据此认定反馈版本已有相同功能。
3. Antigravity 目录：当前默认值已由 `5ee86dcf` 改为 `.gemini/config/skills`，
   与 [官方 Skills 文档](https://antigravity.google/docs/skills) 的 Antigravity 2.0
   和 IDE 全局路径一致。CLI 的独立路径是 `.gemini/antigravity-cli/skills`。
   截图中的 Gemini CLI 勾选绕行不是产品契约；反馈客户端版本、实际覆盖配置及
   原生 Agent 发现结果待核实，不新增路径 fallback 或双写。

## 修复与验收

- 快捷弹窗勾选状态表示期望安装状态。反选已安装平台生成卸载变更，点击应用前
  展示安装/卸载数量；不改动未触及平台，不删除 My Skills 或来源文件。
- 沿用现有批量分发/撤回服务。失败平台保留真实状态与错误；成功项不重复执行。
- 商店批量入口显示文字；My Skills 批量入口明确包含安装/卸载。
- 测试通过真实 preload API、注册的 IPC、SQLite、临时文件系统验证完整包的
  copy/symlink 安装、反选卸载、批量撤回、失败保全以及当前 Antigravity 默认路径。
  Electron 传输由测试桥替代，原生 Agent 消费和真实桌面 GUI 验收单独记录。
- 无 schema 或数据布局变化，无数据迁移。代码回滚不撤销用户已执行的安装或卸载；
  平台副本可从保留的 My Skills 包重新安装。

## 验证记录

- `skill-platform-management.test.tsx`：4 个真实存储场景通过，包括复制、软链接
  撤回、重开状态、批量卸载、真实 `EACCES` 后保留成功结果并重试、Antigravity 默认路径。
- `skill-public-workflow.test.ts`：17 个现有功能及黑盒输入用例通过。
- 快捷弹窗、批量弹窗、平台面板、商店批量操作：25 个组件用例通过。
- Desktop 源码 typecheck、修改范围 ESLint、diff whitespace 检查通过。
- 全局 `typecheck:tests` 未通过：现有 window mock、Agent、AI 配置、Plugin 等
  测试夹具存在类型错误；本次新增测试和修改文件没有被报告。不能宣称全量门禁通过。
- 测试夹具的 home mock 原先没有覆盖命名空间导入，首次路径用例产生了一个本机
  测试包；已核对并清理该测试专用目录。修复 OS 模块 mock，并在初始化和默认路径
  写入前断言隔离成立，隔离失败即终止测试，防止触及真实 Agent 目录。
- 未执行真实 Electron GUI 和原生 Agent 消费验收；未发布版本，未关闭远端 issue。

变更处理为 O(P) 的平台扫描和顺序写入，不增加数据库表、持久化选择状态或并发层。
`applyPlatformChanges` 保留单个较长编排回调，以便明确安装、卸载、状态刷新与失败
保留的顺序；集成用例覆盖这个边界，避免为拆行引入额外状态层。

## 可重跑回归入口（2026-09-28 核对）

- 测试：`apps/desktop/tests/integration/skill-platform-management.test.tsx`。
- 场景与边界：反选卸载、混合操作、失败重试、批量卸载与 Antigravity 默认目录。真实 DOM 操作连接 preload/IPC、SQLite 和文件系统；替换 Electron 传输、UI 偏好及 badge 刷新，不证明原生 Agent 消费。
- 根目录命令：`pnpm --filter @prompthub/desktop exec vitest run tests/integration/skill-platform-management.test.tsx`。
- 接入：所属 package 的常用 Vitest 入口；本文历史通过结果不代表本次已重跑。
