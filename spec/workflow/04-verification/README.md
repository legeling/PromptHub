# PromptHub Workflow Verification

`spec/workflow/04-verification/README.md` 是 PromptHub 当前项目级 verification 主入口，对齐最新 `spec-init` 的 workflow/verification 边界，回答“怎么证明做对了”。

## 当前验证原则

- 高优先级需求必须有自动化验证
- bug fix 必须补回归测试
- 测试应验证行为，而不是堆覆盖率数字
- 需求、设计、验证、任务之间应尽量形成追踪链
- 非平凡变更必须证明功能能被真实用户直接使用，而不是只证明代码能编译
- UI 可见变更必须实际操作被影响的界面、控件和状态
- 新 UI 或工作流逻辑必须先检查并复用现有组件、样式、store、service 或契约
- 非平凡变更必须记录单元/白盒、静态扫描、防护/回滚和性能风险的适用性

## 当前验证真相源

- `AGENTS.md` 中的测试标准
- 各 active change 的 `tasks.md` / `implementation.md`
- 已存在的单元、集成与 E2E 测试文件

## 当前推荐做法

- 项目级长期验证策略逐步沉淀到这里
- 单次变更的验证计划继续写在对应 change 中
- 单次变更的 `implementation.md` 应记录实际执行的验收矩阵，而不是只写“已测试”

## 验收基线

非平凡变更在标记完成前，至少满足以下基线：

| Gate | 必须证明什么 |
| --- | --- |
| 功能可用 | 主流程端到端可运行，结果符合预期，没有明显阻断性 bug |
| UI 实操 | 已在运行中的桌面端、Web 页面、浏览器自动化或等价页面中操作触达控件 |
| 状态完整 | loading、empty、error、conflict、delete、update、sync、install 等相关状态已验证或说明不适用 |
| 复用审计 | 已检查现有 UI 组件、布局模式、store、service、IPC/API 或 shared helper，新增实现有理由 |
| 单元/白盒 | 新增或修改的判断、guard、fallback、错误路径、派生状态有最低有效层测试 |
| 静态扫描 | 按风险运行针对性扫描或审计，并记录命令、范围和结果 |
| 防护路径 | 删除、写入、同步、安装、迁移、网络、权限等风险路径有失败/回滚/恢复验证 |
| 性能压力 | 长列表、批量操作、图谱、同步 payload、文件 inventory 等场景有压力验证或明确不适用 |

## UI 实操验证

UI 可见变更不能只通过截图或代码审阅验收。验证记录必须写清：

- 操作入口：用户从哪个页面、按钮、菜单、快捷行为进入。
- 操作步骤：实际点击、输入、拖拽、筛选、排序、安装、删除、更新或同步的步骤。
- 期望结果：用户应该看到或得到什么。
- 观察结果：实际是否一致，有无布局重叠、控件无响应、状态错误、文案截断或数据不同步。
- 证据：能用 Playwright、in-app browser、桌面自动化或截图时，应附命令或截图路径；无法自动化时记录阻塞原因。

## 复用与一致性验证

涉及 Skill、Plugin、MCP、Agent、Prompt、设置、商店、分发和同步的 UI 变更，应先确认已有同类界面是否能复用。

- My Skill、My Plugin、My MCP 与 Agent 内对应列表应优先共享卡片、状态徽标、删除确认、更新提示和分发/安装操作模式。
- 设置类网络配置、镜像源、代理等应优先共享同一配置模型和表单模式。
- 如果确实需要新增组件或变体，必须记录不能复用的原因和后续是否需要抽象。

## 当前稳定补充

- Cloudflare worker / self-hosted 分支型实现如果进入仓库长期维护范围，至少需要具备独立的 `typecheck`、`lint`、`test` 和构建验证，而不能只依赖主应用验证结果。
- 若变更影响 monorepo 内的 package export / workspace 接入，还必须补根级构建验证，确保真实调用链不会因 `exports` 缺失或 lockfile 未更新而在构建阶段失败。
- 发布候选应优先运行根级 `pnpm verify:release` harness；本地快速排查可先运行 `pnpm verify:release:quick`，但 quick profile 不能替代发布准入。
- 新增或修复线上 bug 时，应先把失败归类到最低有效验证层：shared package typecheck、app lint/typecheck、unit、integration、performance、bundle、E2E smoke 或 packaging。避免通过多个聚合脚本重复运行同一层来制造“已验证”的错觉。
- Skill 相关发布风险必须先对照 `spec/knowledge/reference/skill-defect-taxonomy.md` 给问题定性，再对照 `spec/knowledge/reference/skill-regression-test-matrix.md` 说明哪些测试项已覆盖、哪些尚未覆盖。
